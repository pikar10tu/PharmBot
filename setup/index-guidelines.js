// ============================================================
//  index-guidelines.js
//  pipeline หลัก: cache -> chunk -> สรุปไทย -> embed -> Firestore
//
//  วิธีใช้:
//    node index-guidelines.js --dry            ไม่เรียก API ไม่เขียน Firestore
//    node index-guidelines.js --doc ccpe953_uti
//    node index-guidelines.js                  ทั้งคลัง
//
//  idempotent: chunk ที่ hash ไม่เปลี่ยน จะใช้ embedding เดิม ไม่ embed ซ้ำ
//
//  ⚠️ --doc จำกัดแค่ "อะไรถูก embed ใหม่" ไม่ใช่ "อะไรอยู่ในดัชนี"
//     ตอนเพิ่มเอกสารใหม่เข้าคลัง ห้ามใช้ --doc (ดู docs/plans/…-rag-phase1-indexing.md)
// ============================================================

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');
const { chunkPages } = require('./lib/chunk');
const { quantize }   = require('../js/rag-core');
const {
  summarizeChunks, embedTexts, chunkHash, shardEntries, buildEmbedInput,
  EMBED_MODEL, GEN_MODEL,
} = require('./lib/embed');

const GUIDE = path.join(__dirname, 'guidelines');
const CACHE = path.join(GUIDE, '.extracted');
const SHARD_SIZE = 300;

const args = process.argv.slice(2);
const DRY  = args.includes('--dry');
const ONLY = args.includes('--doc') ? args[args.indexOf('--doc') + 1] : null;

function loadCachedPages(docId) {
  const dir = path.join(CACHE, docId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^p\d+\.txt$/.test(f))
    .sort()
    .map(f => ({
      page: parseInt(f.match(/p(\d+)/)[1], 10),
      text: fs.readFileSync(path.join(dir, f), 'utf8'),
    }));
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(GUIDE, 'manifest.json'), 'utf8'));
  const corpusVersion = manifest.corpusVersion;
  if (!corpusVersion) throw new Error('manifest.json ไม่มี corpusVersion');
  console.log(`corpusVersion: ${corpusVersion}  |  embed: ${EMBED_MODEL}  |  สรุป: ${GEN_MODEL}\n`);

  let db = null, apiKey = null;
  if (!DRY) {
    const keyPath = path.join(__dirname, 'serviceAccountKey.json');
    if (!fs.existsSync(keyPath)) { console.error('\n❌  ไม่พบ serviceAccountKey.json\n'); process.exit(1); }
    admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
    db = admin.firestore();
    const snap = await db.collection('config').doc('gemini').get();
    apiKey = snap.data()?.apiKey;
    if (!apiKey) { console.error('\n❌  /config/gemini.apiKey ว่าง\n'); process.exit(1); }
  }

  // ── 1. chunk ทุก doc ──
  //
  // ⚠️ ต้อง chunk "ทุก" doc เสมอ แม้จะสั่ง --doc
  //    เพราะขั้นที่ 6 เขียนดัชนีด้วย .set() ซึ่งทับทั้ง shard
  //    ถ้ากรองตรงนี้ ดัชนีของเอกสารอื่นในกลุ่มเดียวกันจะหายทันที
  const byGroup = {};   // groupId -> entries[]
  const allChunks = []; // { chunk, doc }
  for (const doc of manifest.docs) {
    const pages = loadCachedPages(doc.id);
    if (!pages.length) {
      console.warn(`⚠️  ${doc.id}: ไม่มี cache (extract=${doc.extract}) — ข้าม`);
      continue;
    }
    const chunks = chunkPages(doc.id, pages);
    console.log(`${doc.id.padEnd(24)} ${String(pages.length).padStart(4)} หน้า -> ${String(chunks.length).padStart(4)} chunk`);
    chunks.forEach(c => allChunks.push({ chunk: c, doc }));
  }

  if (!allChunks.length) { console.error('ไม่มี chunk เลย — หยุด'); process.exit(1); }
  console.log(`\nรวม ${allChunks.length} chunk`);

  if (DRY) {
    console.log('\n--dry: หยุดก่อนเรียก API และก่อนเขียน Firestore');
    console.log(`ประมาณการ: สรุปไทย ~${Math.ceil(allChunks.length / 10)} req, embed ~${Math.ceil(allChunks.length / 50)} req`);
    console.log('\nตัวอย่าง 3 chunk แรก:');
    allChunks.slice(0, 3).forEach(({ chunk }) => {
      console.log('─'.repeat(78));
      console.log(chunk.chunkId, '| หน้า', chunk.page, '|', chunk.heading || '(ไม่มีหัวข้อ)');
      console.log(chunk.text.slice(0, 200).replace(/\n/g, ' '));
    });
    return;
  }

  // ── 2. หาว่าอะไรต้องประมวลผลใหม่ ──
  const existing = new Map();
  const chunkSnap = await db.collection('guidelineChunks')
    .where('corpusVersion', '==', corpusVersion).get();
  chunkSnap.forEach(d => existing.set(d.id, d.data().hash));

  // ต้องโหลดดัชนีเดิมมาด้วย ไม่ใช่แค่ hash — chunk ที่ข้ามไปยังต้องมี
  // embedding/summaryTh ประกอบเข้าดัชนีใหม่ ไม่งั้นรันซ้ำแล้วดัชนีจะว่าง
  const prevEntries = new Map();
  const idxSnap = await db.collection('guidelineIndex')
    .where('corpusVersion', '==', corpusVersion).get();
  idxSnap.forEach(d => {
    for (const e of d.data().entries || []) {
      if (!prevEntries.has(e.chunkId)) {
        prevEntries.set(e.chunkId, { emb: e.emb, summaryTh: e.summaryTh, keywords: e.keywords || [] });
      }
    }
  });

  const stale = ({ chunk }) =>
    existing.get(chunk.chunkId) !== chunkHash(chunk) || !prevEntries.has(chunk.chunkId);
  const todo = allChunks.filter(c => (!ONLY || c.doc.id === ONLY) && stale(c));

  console.log(`ต้องประมวลผลใหม่ ${todo.length} chunk (ใช้ของเดิม ${allChunks.length - todo.length})`);

  if (ONLY) {
    const orphan = [...new Set(
      allChunks.filter(c => c.doc.id !== ONLY && stale(c)).map(c => c.doc.id)
    )];
    if (orphan.length) {
      console.warn(`\n⚠️  ${orphan.join(', ')} ยังไม่มี embedding และถูก --doc กันไว้`);
      console.warn('   เอกสารเหล่านี้จะไม่อยู่ในดัชนีรอบนี้ — รันโดยไม่ใส่ --doc เพื่อให้ครบ\n');
    }
  }

  // ── 3. สรุปไทย + embed ──
  let meta = [], embs = [];
  if (todo.length) {
    meta = await summarizeChunks(todo.map(t => t.chunk), apiKey);
    const inputs = todo.map((t, i) => buildEmbedInput({ ...meta[i], text: t.chunk.text }));
    embs = await embedTexts(inputs, apiKey);
  }

  // ── 4. เขียน /guidelineChunks ──
  let batch = db.batch(), n = 0;
  for (let i = 0; i < todo.length; i++) {
    const { chunk } = todo[i];
    batch.set(db.collection('guidelineChunks').doc(chunk.chunkId), {
      docId: chunk.docId, page: chunk.page, heading: chunk.heading,
      text: chunk.text, summaryTh: meta[i].summaryTh,
      corpusVersion, hash: chunkHash(chunk),
    });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (n % 400 !== 0) await batch.commit();
  console.log(`เขียน /guidelineChunks ${todo.length} รายการ`);

  // ── 5. ประกอบดัชนีจาก chunk ทั้งหมด (ทั้งใหม่และเดิม) ──
  const embByChunk = new Map();
  todo.forEach((t, i) => embByChunk.set(t.chunk.chunkId, { emb: quantize(embs[i]), ...meta[i] }));

  let reused = 0, skippedNoSummary = 0;
  for (const { chunk, doc } of allChunks) {
    let e = embByChunk.get(chunk.chunkId);
    if (!e) { e = prevEntries.get(chunk.chunkId); if (e) reused++; }
    if (!e || !e.emb) continue;
    // chunk ที่โมเดลตีว่าไม่มีสาระทางคลินิก (คำนำ สารบัญ รายการอ้างอิง) — ไม่เข้าดัชนี
    if (!e.summaryTh) { skippedNoSummary++; continue; }
    for (const g of doc.groups) {
      (byGroup[g] ||= []).push({
        chunkId: chunk.chunkId, docId: chunk.docId, page: chunk.page,
        heading: chunk.heading, summaryTh: e.summaryTh, keywords: e.keywords, emb: e.emb,
      });
    }
  }
  console.log(`ใช้ embedding เดิม ${reused} chunk | ไม่เข้าดัชนีเพราะไม่มีสาระคลินิก ${skippedNoSummary} chunk`);

  // ── 6. เขียน /guidelineIndex เป็น shard ──
  // ลบ shard เก่าที่เกินจำนวนใหม่ ไม่งั้นจะเหลือ shard ค้างที่ไม่มีใครอัปเดต
  for (const [groupId, entries] of Object.entries(byGroup)) {
    const shards = shardEntries(entries, SHARD_SIZE);
    for (let s = 0; s < shards.length; s++) {
      await db.collection('guidelineIndex').doc(`${groupId}_${s}`)
        .set({ corpusVersion, groupId, shard: s, entries: shards[s] });
      const kb = Math.round(JSON.stringify(shards[s]).length / 1024);
      console.log(`/guidelineIndex/${groupId}_${s}  ${String(shards[s].length).padStart(4)} entries  ~${kb} KB`);
      if (kb > 900) console.warn('   ⚠️  ใกล้ชน Firestore 1 MB — ลด SHARD_SIZE');
    }
    for (let s = shards.length; s < shards.length + 5; s++) {
      const ref = db.collection('guidelineIndex').doc(`${groupId}_${s}`);
      if ((await ref.get()).exists) { await ref.delete(); console.log(`ลบ shard ค้าง ${groupId}_${s}`); }
    }
  }

  // ── 7. /config/rag — enabled: false จนกว่าจะวัด recall ผ่านเกณฑ์ ──
  const cfgRef = db.collection('config').doc('rag');
  const cfg = (await cfgRef.get()).data() || {};
  await cfgRef.set({
    corpusVersion,
    enabled: cfg.enabled === true,   // ไม่เปิดเอง แต่ถ้าเคยเปิดไว้แล้วไม่ปิด
    topK: cfg.topK || 6,
    minScore: cfg.minScore ?? null,
    embedModel: EMBED_MODEL,
  }, { merge: true });
  console.log(`\n/config/rag เขียนแล้ว (enabled: ${cfg.enabled === true})`);
  if (cfg.enabled !== true) {
    console.log('→ ยังไม่เปิดใช้งาน รัน eval-retrieval.js ให้ผ่านเกณฑ์ recall@6 >= 0.8 ก่อน');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('\n❌', e); process.exit(1); });

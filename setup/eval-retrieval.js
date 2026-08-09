// ============================================================
//  eval-retrieval.js
//  วัด recall@k ของการค้นคืน — ด่านตัดสินก่อนเปิดใช้งาน RAG
//
//  วิธีใช้:
//    node eval-retrieval.js            k = 6 (ค่าเริ่มต้น)
//    node eval-retrieval.js --k 10
//    node eval-retrieval.js --verbose  แสดงผลทุก query ไม่ใช่เฉพาะที่พลาด
//
//  เกณฑ์ผ่าน: recall@6 >= 0.8
//  ใช้ setup/lib/rag-core.js ตัวเดียวกับที่ index-guidelines.js ใช้ ผลจึงเทียบได้ตรง
// ============================================================

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');
const { dequantize, cosine, mergeTopK, capPerDoc } = require('./lib/rag-core');
const { embedTexts, EMBED_MODEL } = require('./lib/embed');

const args    = process.argv.slice(2);
const ARG_K   = args.includes('--k') ? parseInt(args[args.indexOf('--k') + 1], 10) : null;
const VERBOSE = args.includes('--verbose');
const DEFAULT_K = 6;
const MAX_PER_DOC = 2;
const PASS = 0.8;

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))),
});
const db = admin.firestore();

async function loadIndex(groupId) {
  const snap = await db.collection('guidelineIndex').where('groupId', '==', groupId).get();
  const entries = [];
  snap.forEach(d => entries.push(...(d.data().entries || [])));
  return entries;
}

async function main() {
  const apiKey = (await db.collection('config').doc('gemini').get()).data()?.apiKey;
  if (!apiKey) throw new Error('/config/gemini.apiKey ว่าง');

  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'guidelines', 'manifest.json'), 'utf8'));
  const K = ARG_K || DEFAULT_K;
  console.log(`corpusVersion: ${manifest.corpusVersion} | embed: ${EMBED_MODEL} | k=${K}\n`);

  const { queries } = JSON.parse(fs.readFileSync(path.join(__dirname, 'eval-queries.json'), 'utf8'));

  const indexCache = {};
  for (const g of [...new Set(queries.map(q => q.group))]) {
    indexCache[g] = await loadIndex(g);
    console.log(`ดัชนี ${g.padEnd(8)} ${String(indexCache[g].length).padStart(4)} entries`);
    if (!indexCache[g].length) throw new Error(`ดัชนี ${g} ว่าง — รัน index-guidelines.js ก่อน`);
  }

  console.log(`\nembed ${queries.length} query...`);
  const qEmbs = await embedTexts(queries.map(q => q.q), apiKey);

  const fails = [];
  const topScores = [];
  const byGroup = {};
  let hit = 0;

  queries.forEach((q, i) => {
    const qv = qEmbs[i];
    const scored = indexCache[q.group].map(e => ({
      chunkId: e.chunkId, docId: e.docId, page: e.page,
      summaryTh: e.summaryTh, score: cosine(qv, dequantize(e.emb)),
    }));
    const top = capPerDoc(mergeTopK([scored], K * 3), MAX_PER_DOC).slice(0, K);
    const ok = top.some(t => q.expectDocs.includes(t.docId));

    (byGroup[q.group] ||= { hit: 0, total: 0 });
    byGroup[q.group].total++;
    if (ok) { hit++; byGroup[q.group].hit++; } else { fails.push({ q, top }); }
    if (top[0]) topScores.push(top[0].score);

    if (VERBOSE) {
      console.log(`${ok ? '✔' : '✘'} ${q.q}`);
      top.slice(0, 3).forEach(t => console.log(`     ${t.docId} น.${t.page} (${t.score.toFixed(3)})`));
    }
  });

  const recall = hit / queries.length;
  console.log('\n' + '='.repeat(78));
  console.log(`recall@${K} = ${hit}/${queries.length} = ${recall.toFixed(3)}   เกณฑ์ ${PASS}   ${recall >= PASS ? '✅ ผ่าน' : '❌ ไม่ผ่าน'}`);

  console.log('\nแยกตามกลุ่ม:');
  for (const [g, s] of Object.entries(byGroup)) {
    console.log(`  ${g.padEnd(8)} ${s.hit}/${s.total} = ${(s.hit / s.total).toFixed(3)}`);
  }

  const sorted = [...topScores].sort((a, b) => a - b);
  const pct = p => sorted[Math.floor(sorted.length * p)]?.toFixed(3);
  console.log(`\ncosine ของอันดับ 1: min ${pct(0)} | p10 ${pct(0.1)} | กลาง ${pct(0.5)} | max ${sorted.at(-1)?.toFixed(3)}`);

  if (fails.length) {
    console.log(`\nquery ที่พลาด ${fails.length} ข้อ:`);
    fails.forEach(({ q, top }) => {
      console.log('─'.repeat(78));
      console.log(`Q: ${q.q}   [${q.group}]`);
      console.log(`   คาด: ${q.expectDocs.join(', ')}`);
      top.slice(0, 3).forEach(t =>
        console.log(`   ได้: ${t.docId} น.${t.page} (${t.score.toFixed(3)}) ${(t.summaryTh || '').slice(0, 60)}`));
    });
  }

  process.exit(recall >= PASS ? 0 : 1);
}

main().catch(e => { console.error('\n❌', e); process.exit(1); });

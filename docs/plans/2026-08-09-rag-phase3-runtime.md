# RAG Phase 3 — Runtime Integration Implementation Plan

> **⚠️ ยกเลิก (2026-08-09)** — งานทั้งแผนนี้ถูกถอดออกใน
> `docs/plans/2026-08-09-static-guideline-grounding.md`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ Step 4 ดึงหลักฐานจากคลังไกด์ไลน์มาประกอบการประเมิน แล้วแสดงแหล่งอ้างอิงในหน้าสรุป พร้อมบันทึกร่องรอยการค้นคืนลง `/results` เพื่องานวิจัย

**Architecture:** `js/rag.js` ห่อ I/O ทั้งหมด (โหลดดัชนี → cache ใน sessionStorage → สร้าง query 3 เส้น → embed → จัดอันดับด้วย `rag-core.js` → ดึงเนื้อหาเต็ม) แล้วคืนผลก้อนเดียวให้ `chat.js` เรียกบรรทัดเดียว `prompts.js` เพิ่มบล็อกหลักฐานเข้า eval prompt เดิม — **ไม่เพิ่ม Gemini call ของการประเมิน** มีแค่ embedding call เพิ่ม 1 ครั้ง

**Tech Stack:** vanilla JS global scope, ไม่มี build step · Firestore · Gemini embedding API

**Prereq (เสร็จแล้ว):** Phase 1 — `/guidelineIndex` 4 shard, `/guidelineChunks` 719 doc, `/config/rag` `{ enabled: true, topK: 6, minScore: 0.62, embedModel: 'gemini-embedding-2', corpusVersion: '2026-08-09' }`

**Spec:** `docs/specs/2026-08-08-rag-clinical-guidelines.md`

## Global Constraints

- **ไม่มี build step** — `js/*.js` global scope; เพิ่มไฟล์ต้องเพิ่ม `<script>` ใน `index.html` ตามลำดับ และ bump `?v=`
- **RAG ต้องล้มแบบเงียบเสมอ** — ทุก error path ต้องให้ Step 4 เดินต่อจนได้คะแนน ห้าม throw ออกจาก `RAG.retrieve()`
- **timeout รวม 4 วินาที** — เกินแล้วข้าม ไม่รอ
- **ห้ามแตะ `scoreRubric()`** — คะแนนต้องไม่เปลี่ยนจากการมี/ไม่มี RAG
- **`js/rag-core.js` ห้ามแก้** — Phase 1 ใช้แล้วและมี test บังคับความเข้ากันได้ Node/เบราว์เซอร์
- **embedding ตอน query ต้องใช้ `taskType: 'RETRIEVAL_QUERY'`** (ตอน index ใช้ `RETRIEVAL_DOCUMENT`) และ `outputDimensionality: 768` ให้ตรงกับดัชนี
- **อ่านชื่อ model จาก `/config/rag.embedModel`** ห้าม hardcode — ถ้าไม่ตรงกับที่ index ไว้ ผลค้นคืนจะมั่ว
- **ห้ามแสดงข้อความไกด์ไลน์ต้นฉบับต่อนักศึกษา** — หน้าสรุปแสดงได้แค่ `summaryTh` + ชื่อเอกสาร + หน้า + ลิงก์ (ลิขสิทธิ์)

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `js/rag.js` | I/O ทั้งหมดของ RAG — `RAG.retrieve()` เป็นทางเข้าเดียว |
| `js/prompts.js` | + `buildGuidelineBlock()` · `buildEvalPrompt()` รับ param เพิ่ม |
| `js/screens/chat.js` | เรียก `RAG.retrieve()` ก่อน eval — แตะไม่เกิน 12 บรรทัด |
| `js/screens/summary.js` | + section "อ้างอิงเวชปฏิบัติ" |
| `js/db.js` | `saveResult()` รับ `ragInfo` เพิ่ม |
| `index.html` | + `<script src="js/rag.js">` |
| `setup/test/rag-query.test.js` | test ส่วน pure ของ `rag.js` |

---

### Task 1: query builder + prompt block (ส่วน pure)

**Files:**
- Create: `js/rag.js` (เฉพาะส่วน pure ในรอบนี้)
- Modify: `js/prompts.js`
- Test: `setup/test/rag-query.test.js`

**Interfaces:**
- Consumes: `js/rag-core.js` (Phase 1)
- Produces:

```js
// js/rag.js
// RAG.buildQueries(caseData, dispensedDrugs) => string[]  (3 เส้น ภาษาไทย)
// RAG.formatCitations(chunks) => Array<{tag, docId, page, title, url, summaryTh}>

// js/prompts.js
// buildGuidelineBlock(chunks) => string   ('' ถ้า chunks ว่าง)
// buildEvalPrompt(caseData, chatHistory, dispensedDrugs, counselingHistory, guidelineChunks = [])
```

**query 3 เส้น** (จากที่ spec กำหนด):
1. วินิจฉัย + การรักษา — จาก `diagnosisAnswer` + `chiefComplaint`
2. counseling — จาก `drugAnswer.counseling` + ชื่อยาที่จ่าย
3. red flag / refer — จาก `chiefComplaint` + คำว่า "อาการเตือน ส่งต่อแพทย์"

เส้นที่ 2 ต้องมีชื่อยาที่นักศึกษาจ่ายจริง (ไม่ใช่เฉลย) เพื่อให้ดึงหลักฐานของยาที่หลุด `drugAnswer` ได้

- [ ] **Step 1: เขียน failing test**

```js
// setup/test/rag-query.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// js/rag.js เป็น classic script — โหลดผ่าน vm เหมือน rag-core
function loadRag() {
  const sandbox = { console, Math, JSON, Map, Set, String, Array, Object, Promise, Date };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'rag-core.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'rag.js'), 'utf8'), sandbox);
  return sandbox;
}

const CASE = {
  chiefComplaint: 'เจ็บคอค่ะ',
  diagnosisAnswer: 'Bacterial pharyngitis จากเชื้อ group A streptococcus',
  drugAnswer: { counseling: ['กินยาให้ครบ 10 วัน', 'ดื่มน้ำมากๆ'] },
};

test('buildQueries คืน 3 เส้น ไม่ว่าง เป็นภาษาไทย', () => {
  const { RAG } = loadRag();
  const qs = RAG.buildQueries(CASE, [{ name: 'Amoxicillin', strength: '500mg' }]);
  assert.strictEqual(qs.length, 3);
  qs.forEach(q => {
    assert.ok(q.trim().length > 5, `query สั้นเกินไป: ${q}`);
    assert.ok(/[\u0E00-\u0E7F]/.test(q), `ต้องมีภาษาไทย: ${q}`);
  });
});

test('query เส้น counseling มีชื่อยาที่จ่ายจริง (ไม่ใช่แค่เฉลย)', () => {
  const { RAG } = loadRag();
  const qs = RAG.buildQueries(CASE, [{ name: 'Azithromycin', strength: '500mg' }]);
  assert.ok(qs.some(q => q.includes('Azithromycin')), 'ต้องมีชื่อยาที่นักศึกษาจ่าย');
});

test('query เส้น red flag มีคำที่สื่อถึงการส่งต่อ', () => {
  const { RAG } = loadRag();
  const qs = RAG.buildQueries(CASE, []);
  assert.ok(qs.some(q => /ส่งต่อ|อาการเตือน|พบแพทย์/.test(q)));
});

test('buildQueries ทนต่อเคสที่ข้อมูลไม่ครบ', () => {
  const { RAG } = loadRag();
  const qs = RAG.buildQueries({}, []);
  assert.strictEqual(qs.length, 3);
  qs.forEach(q => assert.strictEqual(typeof q, 'string'));
});

test('formatCitations ใส่ tag G1..Gn ตามลำดับ', () => {
  const { RAG } = loadRag();
  const cites = RAG.formatCitations([
    { docId: 'ccpe461_uri', page: 3, summaryTh: 'ก' },
    { docId: 'ar_th_2565', page: 9, summaryTh: 'ข' },
  ]);
  assert.deepStrictEqual(cites.map(c => c.tag), ['G1', 'G2']);
});
```

- [ ] **Step 2: รัน test ให้เห็นว่าแดง**

Run: `cd setup && node --test test/rag-query.test.js`
Expected: FAIL — ไม่พบ `js/rag.js`

- [ ] **Step 3: เขียนส่วน pure ของ `js/rag.js`**

```js
// ============================================================
//  rag.js — สืบค้นแนวทางเวชปฏิบัติมาประกอบการประเมิน (Step 4)
//
//  ⚠️ ต้องล้มแบบเงียบเสมอ — RAG.retrieve() ห้าม throw
//     ถ้าล้ม การประเมินต้องเดินต่อจนได้คะแนนตามปกติ
//  ⚠️ classic script (global scope) ห้ามใช้ require / import
//
//  ใช้ RAGCore จาก js/rag-core.js — ต้องโหลดก่อนไฟล์นี้
// ============================================================

const RAG = {
  // ── สร้าง query 3 เส้นจากเคส + ยาที่นักศึกษาจ่ายจริง ──
  // เส้น counseling ใส่ชื่อยาที่จ่ายจริง (ไม่ใช่เฉลย) เพื่อให้ดึงหลักฐาน
  // ของยาที่หลุด drugAnswer ได้ — เป็นเหตุผลหนึ่งที่ทำ RAG ตั้งแต่แรก
  buildQueries(caseData = {}, dispensedDrugs = []) {
    const cc   = (caseData.chiefComplaint || '').trim();
    const dx   = (caseData.diagnosisAnswer || '').trim();
    const drugs = (dispensedDrugs || [])
      .map(d => [d.name, d.strength].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(' ');
    const counselPoints = (caseData.drugAnswer?.counseling || []).join(' ');

    return [
      `การวินิจฉัยและการรักษา ${dx || cc || 'อาการที่พบในร้านยา'}`.trim(),
      `คำแนะนำการใช้ยาและการปฏิบัติตัว ${drugs} ${counselPoints}`.trim(),
      `อาการเตือนที่ต้องส่งต่อพบแพทย์ ${cc || dx}`.trim(),
    ];
  },

  // ── แปลง chunk เป็นรายการอ้างอิงพร้อม tag G1..Gn ──
  formatCitations(chunks = []) {
    return chunks.map((c, i) => ({
      tag: `G${i + 1}`,
      docId: c.docId,
      page: c.page,
      title: c.title || c.docId,
      url: c.url || null,
      summaryTh: c.summaryTh || '',
    }));
  },
};
```

- [ ] **Step 4: เพิ่ม `buildGuidelineBlock()` ใน `js/prompts.js`**

แทรกก่อน `buildEvalPrompt` แล้วแก้ signature ของ `buildEvalPrompt`

```js
// ── Guideline evidence block (RAG) ────────────────────────────
// ว่าง -> คืน '' -> eval prompt ทำงานเหมือนไม่มี RAG ทุกประการ
function buildGuidelineBlock(chunks) {
  if (!Array.isArray(chunks) || !chunks.length) return '';
  const items = chunks.map((c, i) => {
    const src = [c.title || c.docId, c.page ? `หน้า ${c.page}` : ''].filter(Boolean).join(' ');
    return `[G${i + 1}] แหล่ง: ${src}\nสรุป: ${c.summaryTh || '-'}\nเนื้อหา: ${(c.text || '').slice(0, 900)}`;
  }).join('\n\n');

  return `

<Guideline_Evidence>
${items}
</Guideline_Evidence>

การใช้หลักฐานข้างต้น:
- อ้างอิงได้เฉพาะข้อความใน <Guideline_Evidence> เท่านั้น **ห้ามแต่งเพิ่มจากความรู้ของคุณเอง**
- เมื่ออ้างในข้อความ feedback ให้ติด tag เช่น [G1] ต่อท้ายประโยคนั้น
- **ถ้าหลักฐานขัดกับเฉลยของเคส (<Case_Info>) ให้ยึดเฉลยของเคสเสมอ และห้ามอ้าง chunk นั้น**
  (เฉลยผ่านการตรวจของผู้เชี่ยวชาญแล้ว ส่วนหลักฐานอาจมาจากบริบทอื่น เช่น โรงพยาบาล ไม่ใช่ร้านยา)
- หลักฐานนี้ใช้เพื่อ "อธิบายให้ลึกขึ้น" เท่านั้น **ห้ามใช้เปลี่ยนการตัดสิน earned รายข้อ**`;
}
```

แล้วแก้ `buildEvalPrompt`:

```js
function buildEvalPrompt(caseData, chatHistory, dispensedDrugs, counselingHistory, guidelineChunks = []) {
```

เพิ่มบล็อกก่อนบรรทัด `วิธีประเมิน (สำคัญมาก):` โดยแทรก `${buildGuidelineBlock(guidelineChunks)}` ต่อท้าย `</Counseling_Transcript>`

และเพิ่ม field ใน JSON schema ที่ขอกลับมา — ต่อจาก `"summary"`:

```
  "citations": ["G1", "G3"]
```

พร้อมคำอธิบายในบรรทัดถัดจาก schema:
```
"citations" = รายการ tag ที่คุณอ้างจริงใน feedback (ไม่ได้อ้าง = [])
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `cd setup && node --test test/rag-query.test.js`
Expected: PASS ทั้ง 5 tests

- [ ] **Step 6: ยืนยันว่า eval prompt เดิมไม่เปลี่ยนเมื่อไม่มี RAG**

```bash
cd "D:/PROJECT/pharmbot-v2" && node -e "
const fs=require('fs'),vm=require('vm');
const sb={console,Math,JSON,Array,Object,String,Number};
vm.createContext(sb);
vm.runInContext(fs.readFileSync('js/prompts.js','utf8'),sb);
const c={name:'สมหญิง',age:30,gender:'female',chiefComplaint:'เจ็บคอ',diagnosisAnswer:'pharyngitis',drugAnswer:{firstLine:['amoxicillin_500'],counseling:['กินให้ครบ']}};
const a=sb.buildEvalPrompt(c,[],[],[]);
const b=sb.buildEvalPrompt(c,[],[],[],[]);
console.log('ไม่ส่ง param เท่ากับส่ง array ว่าง:', a===b);
console.log('ไม่มีบล็อกหลักฐาน:', !a.includes('Guideline_Evidence'));
const d=sb.buildEvalPrompt(c,[],[],[],[{docId:'x',page:1,summaryTh:'ส',text:'ท'}]);
console.log('มี chunk แล้วมีบล็อก:', d.includes('<Guideline_Evidence>') && d.includes('[G1]'));
"
```
Expected: `true` ทั้ง 3 บรรทัด

- [ ] **Step 7: Commit**

```bash
git add js/rag.js js/prompts.js setup/test/rag-query.test.js
git commit -m "feat(rag): query builder + guideline evidence block in eval prompt"
```

---

### Task 2: retrieval I/O (`RAG.retrieve`)

**Files:**
- Modify: `js/rag.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `RAGCore` · `db` (firebase-config.js) · `getGeminiKey()` (gemini.js) · `RAG.buildQueries` (Task 1)
- Produces:

```js
// RAG.retrieve(caseData, dispensedDrugs, groupId) => Promise<RagResult>
// RagResult = {
//   chunks: Array<{chunkId, docId, page, heading, title, url, summaryTh, text, score}>,
//   status: 'ok'|'disabled'|'no_index'|'embed_failed'|'low_relevance'|'partial',
//   queries: string[],
//   retrieved: Array<{chunkId, docId, page, score}>,
//   corpusVersion: string|null,
//   ms: number,
// }
// ห้าม throw — ทุก error path คืน status ที่เหมาะสมพร้อม chunks: []
```

**ตาราง error handling (จาก spec):**

| เหตุ | `status` |
|---|---|
| `/config/rag.enabled = false` | `disabled` |
| ไม่มี index ของกลุ่มนั้น | `no_index` |
| embedding error / เกิน 4 วินาที | `embed_failed` |
| คะแนนสูงสุด < `minScore` | `low_relevance` |
| ดึง chunk ได้ไม่ครบ | `partial` |

- [ ] **Step 1: เขียนส่วน I/O ต่อท้าย `js/rag.js`**

```js
// ── Config + index cache ─────────────────────────────────────
RAG._cfg = null;
RAG._indexCache = {};      // groupId -> entries[]  (ใน memory ต่อหน้า)
RAG.TIMEOUT_MS = 4000;
RAG.MAX_PER_DOC = 2;

RAG._docMeta = {};         // docId -> { title, url }  จาก /guidelineDocs (ถ้ามี)

async function _ragLoadConfig() {
  if (RAG._cfg) return RAG._cfg;
  const snap = await db.collection('config').doc('rag').get();
  RAG._cfg = snap.exists ? snap.data() : { enabled: false };
  return RAG._cfg;
}

// ดัชนีก้อนใหญ่ (RESP ~750 KB) — cache ใน sessionStorage ไม่ให้โหลดซ้ำทั้ง session
async function _ragLoadIndex(groupId, corpusVersion) {
  if (RAG._indexCache[groupId]) return RAG._indexCache[groupId];

  const key = `rag-idx-${groupId}-${corpusVersion}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      RAG._indexCache[groupId] = JSON.parse(cached);
      return RAG._indexCache[groupId];
    }
  } catch (_) { /* sessionStorage เต็มหรือปิดอยู่ — ข้ามไปโหลดใหม่ */ }

  const snap = await db.collection('guidelineIndex').where('groupId', '==', groupId).get();
  const entries = [];
  snap.forEach(d => entries.push(...(d.data().entries || [])));

  RAG._indexCache[groupId] = entries;
  try { sessionStorage.setItem(key, JSON.stringify(entries)); } catch (_) { /* เกินโควตา ไม่เป็นไร */ }
  return entries;
}

async function _ragEmbedQueries(queries, model) {
  const key = getGeminiKey();
  if (!key) throw new Error('ไม่มี API key');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: queries.map(q => ({
        model: `models/${model}`,
        content: { parts: [{ text: q }] },
        outputDimensionality: 768,
        // ⚠️ ต้องเป็น RETRIEVAL_QUERY (ตอน index ใช้ RETRIEVAL_DOCUMENT)
        taskType: 'RETRIEVAL_QUERY',
      })),
    }),
  });
  if (!res.ok) throw new Error(`embed ${res.status}`);
  const data = await res.json();
  return (data.embeddings || []).map(e => e.values || e.value);
}

function _ragTimeout(ms) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
}

// ── ทางเข้าเดียวของ RAG ─────────────────────────────────────
RAG.retrieve = async function (caseData, dispensedDrugs, groupId) {
  const t0 = Date.now();
  const queries = RAG.buildQueries(caseData, dispensedDrugs);
  const fail = (status, corpusVersion = null) =>
    ({ chunks: [], status, queries, retrieved: [], corpusVersion, ms: Date.now() - t0 });

  try {
    const cfg = await _ragLoadConfig();
    if (!cfg.enabled) return fail('disabled', cfg.corpusVersion || null);

    const work = (async () => {
      const entries = await _ragLoadIndex(groupId, cfg.corpusVersion);
      if (!entries.length) return fail('no_index', cfg.corpusVersion);

      const embs = await _ragEmbedQueries(queries, cfg.embedModel || 'gemini-embedding-2');
      if (embs.length !== queries.length) return fail('embed_failed', cfg.corpusVersion);

      // จัดอันดับด้วยแกนเดียวกับที่ offline audit ใช้ — ผลจึงเทียบกันได้
      const lists = embs.map(qv =>
        entries.map(e => ({
          chunkId: e.chunkId, docId: e.docId, page: e.page,
          heading: e.heading, summaryTh: e.summaryTh,
          score: RAGCore.cosine(qv, RAGCore.dequantize(e.emb)),
        }))
      );
      const topK = cfg.topK || 6;
      const merged = RAGCore.mergeTopK(lists, topK * 3);
      if (!merged.length || merged[0].score < (cfg.minScore ?? 0)) {
        return fail('low_relevance', cfg.corpusVersion);
      }
      const picked = RAGCore.capPerDoc(merged, RAG.MAX_PER_DOC)
        .filter(h => h.score >= (cfg.minScore ?? 0))
        .slice(0, topK);

      // ดึงเนื้อหาเต็มเฉพาะที่เลือก
      const docs = await Promise.all(
        picked.map(h => db.collection('guidelineChunks').doc(h.chunkId).get().catch(() => null))
      );
      const chunks = [];
      docs.forEach((d, i) => {
        if (!d || !d.exists) return;
        const data = d.data();
        chunks.push({
          ...picked[i],
          text: data.text || '',
          summaryTh: data.summaryTh || picked[i].summaryTh || '',
          title: RAG._docMeta[picked[i].docId]?.title || picked[i].docId,
          url: RAG._docMeta[picked[i].docId]?.url || null,
        });
      });

      return {
        chunks,
        status: chunks.length === picked.length ? 'ok' : 'partial',
        queries,
        retrieved: picked.map(h => ({ chunkId: h.chunkId, docId: h.docId, page: h.page, score: +h.score.toFixed(4) })),
        corpusVersion: cfg.corpusVersion,
        ms: Date.now() - t0,
      };
    })();

    return await Promise.race([work, _ragTimeout(RAG.TIMEOUT_MS)]);
  } catch (e) {
    console.warn('RAG.retrieve ล้ม (การประเมินเดินต่อตามปกติ):', e.message);
    return fail('embed_failed');
  }
};
```

- [ ] **Step 2: เพิ่ม `<script>` ใน `index.html`**

หลัง `rag-core.js` ก่อน `prompts.js` (ต้องมี `db` + `getGeminiKey` มาก่อน — ทั้งคู่โหลดแล้ว)

```html
<script src="js/rag-core.js?v=1"></script>
<script src="js/rag.js?v=1"></script>
```

- [ ] **Step 3: ตรวจ syntax + ยืนยันว่าไม่มี require/import**

```bash
cd "D:/PROJECT/pharmbot-v2" && node --check js/rag.js && grep -c "require(\|^import " js/rag.js
```
Expected: syntax ผ่าน, `grep -c` คืน `0`

- [ ] **Step 4: ทดสอบ retrieve ของจริงด้วย Node (จำลอง global ของเบราว์เซอร์)**

```bash
cd "D:/PROJECT/pharmbot-v2/setup" && cat > /tmp/probe-retrieve.js <<'PROBE'
const fs=require('fs'),vm=require('vm'),path=require('path');
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(require('./serviceAccountKey.json'))});
const fdb=admin.firestore();

// จำลอง API ฝั่งเบราว์เซอร์ที่ rag.js ใช้
const shim={
  collection:(n)=>({
    doc:(id)=>({get:async()=>{const s=await fdb.collection(n).doc(id).get();return{exists:s.exists,data:()=>s.data()};}}),
    where:(f,op,v)=>({get:async()=>{const s=await fdb.collection(n).where(f,op,v).get();
      return{forEach:(cb)=>s.forEach(d=>cb({data:()=>d.data()}))};}}),
  }),
};
(async()=>{
  const key=(await fdb.collection('config').doc('gemini').get()).data().apiKey;
  const sb={console,Math,JSON,Map,Set,String,Array,Object,Promise,Date,fetch,setTimeout,
            db:shim,getGeminiKey:()=>key,sessionStorage:{getItem:()=>null,setItem:()=>{}}};
  vm.createContext(sb);
  const R=(f)=>vm.runInContext(fs.readFileSync(path.join('..','js',f),'utf8'),sb);
  R('rag-core.js'); R('rag.js');
  const CASE={chiefComplaint:'เจ็บคอ มีไข้',diagnosisAnswer:'Bacterial pharyngitis จาก group A streptococcus',
              drugAnswer:{counseling:['กินยาให้ครบ 10 วัน']}};
  const r=await sb.RAG.retrieve(CASE,[{name:'Amoxicillin',strength:'500mg'}],'RESP');
  console.log('status:',r.status,'| ms:',r.ms,'| chunks:',r.chunks.length);
  console.log('queries:'); r.queries.forEach(q=>console.log('   -',q));
  r.chunks.forEach((c,i)=>console.log(`[G${i+1}] ${c.docId} น.${c.page} (${c.score.toFixed(3)}) ${c.summaryTh.slice(0,70)}`));
  process.exit(0);
})();
PROBE
node /tmp/probe-retrieve.js
```
Expected: `status: ok`, chunks 4-6 ตัว, แต่ละตัวเกี่ยวกับเจ็บคอ/pharyngitis/ยาปฏิชีวนะ, `ms` < 4000

- [ ] **Step 5: ทดสอบ error path — ต้องไม่ throw**

```bash
cd "D:/PROJECT/pharmbot-v2/setup" && node -e "
const fs=require('fs'),vm=require('vm'),path=require('path');
const sb={console,Math,JSON,Map,Set,String,Array,Object,Promise,Date,setTimeout,
  db:{collection:()=>({doc:()=>({get:async()=>{throw new Error('firestore ล่ม')}}),
       where:()=>({get:async()=>{throw new Error('firestore ล่ม')}})})},
  getGeminiKey:()=>null, fetch:async()=>{throw new Error('เน็ตหลุด')},
  sessionStorage:{getItem:()=>null,setItem:()=>{}}};
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join('..','js','rag-core.js'),'utf8'),sb);
vm.runInContext(fs.readFileSync(path.join('..','js','rag.js'),'utf8'),sb);
sb.RAG.retrieve({chiefComplaint:'เจ็บคอ'},[],'RESP').then(r=>{
  console.log('ไม่ throw:', true);
  console.log('status:',r.status,'| chunks:',r.chunks.length,'| มี queries:',r.queries.length===3);
}).catch(e=>{console.log('❌ throw ออกมา:',e.message);process.exit(1)});
"
```
Expected: `ไม่ throw: true`, `chunks: 0`, `มี queries: true` — **นี่คือกติกาที่สำคัญที่สุดของ Phase 3**

- [ ] **Step 6: Commit**

```bash
git add js/rag.js index.html
git commit -m "feat(rag): runtime retrieval with silent-failure contract"
```

---

### Task 3: ต่อเข้า Step 4 + บันทึกลง `/results`

**Files:**
- Modify: `js/screens/chat.js` (`_runEval`, ~บรรทัด 908-940)
- Modify: `js/db.js` (`saveResult`, บรรทัด 92-109)
- Modify: `index.html` (bump `?v=`)

**Interfaces:**
- Consumes: `RAG.retrieve()` (Task 2) · `buildEvalPrompt(..., guidelineChunks)` (Task 1)
- Produces: `/results` เพิ่มฟิลด์ `rag`

```js
// db.js — saveResult(sessionId, userId, evalJson, caseSnapshot, ragInfo = null)
// ragInfo => เก็บลง field `rag`:
// { version, status, queries, retrieved: [{chunkId,docId,page,score}], citations: string[], ms }
```

- [ ] **Step 1: แก้ `saveResult` ใน `js/db.js`**

```js
async function saveResult(sessionId, userId, evalJson, caseSnapshot = null, ragInfo = null) {
  const resultData = {
    sessionId,
    userId,
    caseSnapshot:      caseSnapshot ? { title: caseSnapshot.title, groupId: caseSnapshot.groupId, difficulty: caseSnapshot.difficulty } : null,
    checklistJson:     evalJson.checklist_results || [],
    historyScore:      evalJson.history_score     || 0,
    diagnosisScore:    evalJson.diagnosis_score   || 0,
    drugScore:         evalJson.drug_score        || 0,
    counselingScore:   evalJson.counseling_score  || 0,
    overallScore:      evalJson.overall           || 0,
    feedbackJson:      evalJson,
    // ร่องรอยการค้นคืน — ใช้ตรวจย้อนกลับตอนวิเคราะห์ผลวิจัย
    rag: ragInfo ? {
      version:    ragInfo.corpusVersion || null,
      status:     ragInfo.status,
      queries:    ragInfo.queries || [],
      retrieved:  ragInfo.retrieved || [],
      citations:  Array.isArray(evalJson.citations) ? evalJson.citations : [],
      ms:         ragInfo.ms || 0,
    } : null,
    createdAt:         firebase.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('sessions').doc(sessionId).update({ status: 'evaluated' });
  const ref = await db.collection('results').add(resultData);
  return { id: ref.id, ...resultData };
}
```

- [ ] **Step 2: แก้ `_runEval` ใน `js/screens/chat.js`**

แทนที่ 3 บรรทัดแรกใน `try` และบรรทัด `saveResult`:

```js
  try {
    // ค้นคืนหลักฐานจากคลังไกด์ไลน์ — ล้มแล้วเดินต่อ ไม่กระทบคะแนน
    const rag = await RAG.retrieve(_caseData, _dispensedDrugs, _caseData.groupId);
    if (rag.status !== 'ok') console.info('RAG:', rag.status);

    const prompt  = buildEvalPrompt(_caseData, _chatHistory, _dispensedDrugs, _counselingHistory, rag.chunks);
    const raw     = await geminiComplete(prompt);
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const evalJson = JSON.parse(cleaned);

    // คำนวณคะแนนแบบ deterministic จากน้ำหนัก rubric (AI ให้แค่ earned รายข้อ)
    const scored = scoreRubric(_caseData, evalJson.items, _caseData.gender);
    Object.assign(evalJson, scored);

    // เก็บรายการอ้างอิงไว้แสดงในหน้าสรุป (เฉพาะ chunk ที่ AI อ้างจริง)
    const cited = new Set(Array.isArray(evalJson.citations) ? evalJson.citations : []);
    evalJson.guidelineRefs = RAG.formatCitations(rag.chunks).filter(c => cited.has(c.tag));

    const user   = getCurrentUser();
    const result = await saveResult(_session.id, user.uid, evalJson, _caseData, rag);
```

- [ ] **Step 3: bump cache version ใน `index.html`**

`chat.js?v=23` → `v=24` · `db.js?v=4` → `v=5` · `prompts.js?v=9` → `v=10`

- [ ] **Step 4: ตรวจ syntax**

Run: `cd "D:/PROJECT/pharmbot-v2" && node --check js/screens/chat.js && node --check js/db.js`
Expected: ผ่านทั้งคู่

- [ ] **Step 5: ยืนยันว่า RAG ไม่แตะคะแนน**

```bash
cd "D:/PROJECT/pharmbot-v2" && grep -n "scoreRubric" js/screens/chat.js
```
Expected: มีบรรทัดเดียว และ argument ไม่มีตัวใดมาจาก `rag` — คะแนนต้องคำนวณจาก `evalJson.items` + rubric เท่านั้น

- [ ] **Step 6: Commit**

```bash
git add js/screens/chat.js js/db.js index.html
git commit -m "feat(rag): wire retrieval into Step 4 eval + persist trace to /results"
```

---

### Task 4: section อ้างอิงในหน้าสรุป

**Files:**
- Modify: `js/screens/summary.js`
- Modify: `index.html` (bump `?v=`)

**Interfaces:**
- Consumes: `result.feedbackJson.guidelineRefs` (Task 3)

**ข้อจำกัดลิขสิทธิ์:** แสดงได้แค่ `summaryTh` + ชื่อเอกสาร + หน้า + ลิงก์ — **ห้ามแสดง `text` ต้นฉบับ**

- [ ] **Step 1: เพิ่ม section ก่อนบล็อก Actions**

```js
      <!-- Guideline references (RAG) -->
      ${(fb.guidelineRefs || []).length ? `
        <div class="card mb-3">
          <h3 class="mb-1">📚 อ้างอิงแนวทางเวชปฏิบัติ</h3>
          <p class="text-dim text-sm mb-2">คำแนะนำข้างต้นบางส่วนอ้างอิงจากเอกสารเหล่านี้ — ตัวเลข [G1] ในข้อความตรงกับรายการด้านล่าง</p>
          ${fb.guidelineRefs.map(r => `
            <div class="checklist-item">
              <div class="checklist-icon">${_escS(r.tag)}</div>
              <div class="checklist-text">
                <div>${_escS(r.summaryTh)}</div>
                <div class="checklist-note">
                  ${_escS(r.title)}${r.page ? ` หน้า ${_escS(String(r.page))}` : ''}
                  ${r.url ? ` · <a href="${_escS(r.url)}" target="_blank" rel="noopener">เปิดเอกสาร</a>` : ''}
                </div>
              </div>
            </div>`).join('')}
        </div>` : ''}
```

- [ ] **Step 2: bump `summary.js?v=3` → `v=4`**

- [ ] **Step 3: ตรวจ syntax + ยืนยันว่าไม่รั่วข้อความต้นฉบับ**

```bash
cd "D:/PROJECT/pharmbot-v2" && node --check js/screens/summary.js && grep -c "r.text\|\.text)" js/screens/summary.js
```
Expected: syntax ผ่าน, `grep -c` คืน `0` (ไม่มีการอ้าง `text` ของ chunk)

- [ ] **Step 4: Commit**

```bash
git add js/screens/summary.js index.html
git commit -m "feat(rag): show guideline citations on summary screen"
```

---

### Task 5: ทดสอบปลายทางด้วย Playwright + smoke test

**Files:**
- Create: `tests/05-rag-summary.spec.js`

- [ ] **Step 1: เขียน test ที่ไม่ต้องพึ่ง Firestore จริง**

ทดสอบ pure logic ของการ render: มี `guidelineRefs` → แสดง section, ไม่มี → ไม่แสดง
(ถ้า Playwright suite เดิมยัง fail อยู่ ให้ทดสอบด้วย vm แบบเดียวกับ `rag-core-browser.test.js` แทน)

- [ ] **Step 2: Smoke test ด้วยมือ — ขั้นที่ตัดสินว่าใช้ได้จริง**

รันเคสจริง 3-5 เคสครอบทั้ง 3 กลุ่ม แล้วตรวจ:

| ตรวจ | เกณฑ์ |
|---|---|
| คะแนนยังออกครบทุกครั้ง | ✅ ต้องผ่าน 100% |
| `ragStatus` ใน `/results` | ควรเป็น `ok` เป็นส่วนใหญ่ |
| เนื้อหาที่อ้าง [G*] ตรงกับเคส | ตาดู — ถ้าอ้างผิดเรื่อง ให้ขึ้น `minScore` |
| หน้าสรุปแสดง section อ้างอิงเมื่อมี citation | ✅ |
| เวลาที่เพิ่มขึ้นตอนประเมิน | ควร < 1 วินาที |

```bash
cd "D:/PROJECT/pharmbot-v2/setup" && node -e "
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(require('./serviceAccountKey.json'))});
admin.firestore().collection('results').orderBy('createdAt','desc').limit(10).get().then(s=>{
  s.forEach(d=>{const r=d.data().rag;
    console.log(d.id.slice(0,6), r? \`\${r.status} | อ้าง \${r.citations.length} | \${r.ms}ms\` : 'ไม่มี rag');});
  process.exit(0);
});
"
```

- [ ] **Step 3: บันทึกผล smoke test กลับเข้า spec**

โดยเฉพาะถ้า `low_relevance` เกิดบ่อย → ปรับ `minScore` แล้วบันทึกค่าใหม่พร้อมเหตุผล

---

## หลังจบ plan นี้

**ได้:** RAG ทำงานปลายทางครบ — Step 4 ใช้หลักฐานจริง, หน้าสรุปแสดงที่มา, `/results` มีร่องรอยให้ตรวจย้อน

**ยังเหลือ:**
1. `extract: "gemini"` สำหรับ `sti_ddc_2567` + `495-CPG-migraine-2565`
2. ระยะ 2 — `setup/brief-case.js` ช่วยทีมเขียน 9 เคสจากไกด์ไลน์
3. ระยะ 4 — `setup/audit-case-guidelines.js` (บล็อกอยู่ รอเคสจริง)
4. ทดสอบเสียงจริง 1 เคส ยืนยันว่า transcript ไม่แตกเป็นท่อน (commit `3a0b9d2`)
5. **freeze `corpusVersion` + prompt ก่อน pretest** — treatment fidelity
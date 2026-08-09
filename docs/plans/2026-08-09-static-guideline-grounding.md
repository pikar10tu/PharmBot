# Static Guideline Grounding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ถอด runtime RAG ออกจากแอป แล้ววางโครงให้หลักฐานอ้างอิงมาจาก annotation ที่เขียนไว้ล่วงหน้าต่อข้อ rubric — โดยยังไม่เขียนเนื้อหา annotation

**Architecture:** rubric item ได้ฟิลด์ optional `rationale` + `sources` เก็บใน `/cases` ที่เดิม `buildEvalPrompt()` render annotation แทรกใต้ข้อของตัวเองใน `<Checklist>` ส่วนรายการอ้างอิงคำนวณตอน Step 4 ด้วย `collectGuidelineSources()` แล้วบันทึกลง `/results.guidelineRefs` เพื่อให้หน้าสรุปอ่านได้โดยไม่ต้อง fetch เคส เคสที่ยังไม่มี annotation ต้องได้ prompt เท่ากับก่อนหน้านี้ทุกประการ

**Tech Stack:** vanilla JS (classic scripts, global scope, ไม่มี build step) · Firebase Firestore compat v9 · `node:test` ฝั่ง setup

**Spec:** `docs/specs/2026-08-09-static-guideline-grounding.md`

## Global Constraints

- **ไม่มี build step** — แก้ไฟล์แล้ว commit ตรงๆ ทุกครั้งที่แก้ไฟล์ที่ deploy แล้วต้อง bump `?v=` ใน `index.html`
- **JS ทุกไฟล์ใน `js/` เป็น classic script global scope** — ห้ามใส่ `require()` หรือ `import` ลำดับ `<script>` ใน `index.html` สำคัญ โหลดผิดลำดับ = "X is not defined"
- **รัน test:** `cd setup && npm test` — บน Windows `node --test test/` แบบโฟลเดอร์ไม่ทำงาน ต้องใช้ glob (มีใน `package.json` แล้ว)
- **`scoreRubric()` ห้ามเปลี่ยนสูตร** — คะแนนคำนวณจาก weight ล้วน annotation เปลี่ยนได้แค่ `earned` ที่ AI ตัดสิน
- **ลิขสิทธิ์:** หน้าสรุปแสดงได้แค่ชื่อเอกสาร + หน้า + ลิงก์ **ห้ามแสดงข้อความต้นฉบับจากไกด์ไลน์**
- **ห้ามแตะ 7 เคสทดสอบใน `setup/seed-cases.js`** และห้ามเขียนเนื้อหา annotation จริง — รอเคสที่ผ่าน IOC
- **`GROUNDING_VERSION`** รูปแบบ `'YYYY-MM-DD'` ค่าเริ่มต้นรอบนี้ = `'2026-08-09'`
- Test ทั้งหมดเขียนคอมเมนต์/ข้อความ assert เป็นภาษาไทยตามไฟล์ที่มีอยู่
- **บทเรียนบังคับ:** ก่อนสรุปว่า test ผ่านหรือ fail ให้ตรวจว่า test วัดถูกจุดก่อน — รอบก่อนสรุปผิด 3 ครั้งเพราะวัดผิด ไม่ใช่โค้ดผิด

## File Structure

| ไฟล์ | ความรับผิดชอบ |
|---|---|
| `js/prompts.js` | **(แก้)** เพิ่ม `GROUNDING_VERSION` · `renderRubricLine()` · `rubricHasAnnotations()` · `collectGuidelineSources()` · ลบ `buildGuidelineBlock()` และ `citations` |
| `js/screens/chat.js` | **(แก้)** Step 4 เลิกเรียก `RAG.retrieve` · ส่ง grounding เข้า `saveResult` |
| `js/db.js` | **(แก้)** `saveResult()` เก็บ `guidelineRefs` + `groundingVersion` แทนฟิลด์ `rag` |
| `js/screens/summary.js` | **(แก้)** section อ้างอิงอ่านจาก `result.guidelineRefs` |
| `js/screens/admin.js` | **(แก้)** whitelist ตอน save ให้ `rationale`/`sources` รอด |
| `js/rag.js` | **(ลบ)** |
| `js/rag-core.js` → `setup/lib/rag-core.js` | **(ย้าย)** เป็นเครื่องมือ offline ล้วนแล้ว |
| `setup/test/grounding.test.js` | **(สร้าง)** annotation rendering + baseline + `collectGuidelineSources()` |
| `setup/test/summary-citations.test.js` | **(เขียนใหม่)** section อ้างอิงเวอร์ชันใหม่ |
| `setup/test/rag-query.test.js` · `rag-core-browser.test.js` | **(ลบ)** |

---

### Task 1: annotation ใน eval prompt + ถอด `buildGuidelineBlock`

**Files:**
- Modify: `js/prompts.js:8` (เพิ่ม const), `js/prompts.js:261-286` (ลบ), `js/prompts.js:291-307` (render), `js/prompts.js:373-402` (prompt body)
- Test: `setup/test/grounding.test.js` (สร้าง)

**Interfaces:**
- Consumes: `DOMAIN_ORDER`, `DOMAIN_WEIGHTS`, `DOMAIN_LABELS`, `buildRubricForCase()` — มีอยู่แล้วใน `prompts.js`
- Produces:
  - `GROUNDING_VERSION: string` — `'2026-08-09'`
  - `renderRubricLine(item) -> string` — บรรทัด checklist ของข้อเดียว รวม annotation ถ้ามี
  - `rubricHasAnnotations(rubric) -> boolean`
  - `buildEvalPrompt(caseData, chatHistory, dispensedDrugs, counselingHistory) -> string` — **ตัดพารามิเตอร์ที่ 5 (`guidelineChunks`) ออก**

---

- [ ] **Step 1: อ่านโครงที่มีอยู่ก่อนแก้**

อ่าน `js/prompts.js` บรรทัด 1-15 (constants), 261-307 (`buildGuidelineBlock` + หัว `buildEvalPrompt`), 373-402 (ท้าย prompt)
อ่าน `setup/test/rag-core.test.js` เพื่อดูสไตล์ test ของโปรเจกต์

`js/prompts.js` เป็น classic script — test โหลดผ่าน `vm` เพราะ `const`/`function` ระดับบนสุดไม่ผูกกับ `globalThis` ของ sandbox ต้องดึงด้วย `vm.runInContext('ชื่อ', sandbox)`

- [ ] **Step 2: เขียน test ที่ต้อง fail**

สร้าง `setup/test/grounding.test.js`:

```js
// ============================================================
//  grounding.test.js — static guideline grounding
//  ตรวจว่า annotation (rationale/sources) ต่อข้อ rubric ถูก render
//  ลงใน eval prompt ถูกที่ และเคสที่ยังไม่ถูก annotate ได้ prompt
//  เหมือนก่อนมีฟีเจอร์นี้ทุกประการ
//
//  js/prompts.js เป็น classic script -> โหลดผ่าน vm
//  รัน: cd setup && npm test
// ============================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPrompts() {
  const sandbox = { console, Math, JSON, Map, Set, String, Array, Object, Number, Date };
  vm.createContext(sandbox);
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'prompts.js'), 'utf8');
  vm.runInContext(src, sandbox);
  // const/function ระดับบนสุดเป็น lexical binding ไม่ผูกกับ globalThis ของ sandbox
  ['GROUNDING_VERSION', 'renderRubricLine', 'rubricHasAnnotations',
   'buildEvalPrompt', 'buildRubricForCase', 'scoreRubric'].forEach(n => {
    sandbox[n] = vm.runInContext(n, sandbox);
  });
  return sandbox;
}

// rubric ขั้นต่ำที่ครบทั้ง 4 หมวด เพื่อให้ buildEvalPrompt ทำงานได้
const BARE_RUBRIC = [
  { id: 'h1', domain: 'history',    label: 'ถามอาการสำคัญ',   weight: 4, critical: false, active: true },
  { id: 'd1', domain: 'diagnosis',  label: 'สรุปการวินิจฉัย',  weight: 5, critical: false, active: true },
  { id: 'r1', domain: 'drug',       label: 'เลือกยา first-line', weight: 7, critical: true,  active: true },
  { id: 'c1', domain: 'counseling', label: 'แจ้งผลข้างเคียง',   weight: 3, critical: false, active: true },
];

function makeCase(rubric) {
  return {
    name: 'สมหญิง', age: 30, gender: 'female',
    chiefComplaint: 'เจ็บคอค่ะ',
    diagnosisAnswer: 'Bacterial pharyngitis',
    drugAnswer: { firstLine: ['amoxicillin_500'], regimen: {}, counseling: [] },
    rubric: JSON.parse(JSON.stringify(rubric)),
  };
}

const EVAL_ARGS = [[{ role: 'user', text: 'สวัสดีครับ' }], [], []];

test('GROUNDING_VERSION เป็นรูปแบบ YYYY-MM-DD', () => {
  const { GROUNDING_VERSION } = loadPrompts();
  assert.match(GROUNDING_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test('ข้อที่ไม่มี rationale -> บรรทัดเดียว ไม่มีอะไรเพิ่ม', () => {
  const { renderRubricLine } = loadPrompts();
  const line = renderRubricLine(BARE_RUBRIC[0]);
  assert.strictEqual(line, '- (h1) ถามอาการสำคัญ [น้ำหนักข้อ 4]');
});

test('ข้อ CRITICAL ยังมีคำว่า CRITICAL เหมือนเดิม', () => {
  const { renderRubricLine } = loadPrompts();
  assert.ok(renderRubricLine(BARE_RUBRIC[2]).includes('CRITICAL'));
});

test('ข้อที่มี rationale -> เพิ่มบรรทัด "เกณฑ์อ้างอิง" ใต้ข้อของตัวเอง', () => {
  const { renderRubricLine } = loadPrompts();
  const line = renderRubricLine({
    ...BARE_RUBRIC[2],
    rationale: 'ต้องครบ 10 วันเพื่อป้องกันไข้รูมาติก',
  });
  const rows = line.split('\n');
  assert.strictEqual(rows.length, 2);
  assert.ok(rows[0].includes('(r1)'));
  assert.strictEqual(rows[1], '  เกณฑ์อ้างอิง: ต้องครบ 10 วันเพื่อป้องกันไข้รูมาติก');
});

test('มี rationale แต่ไม่มี sources -> ไม่มีบรรทัด (ที่มา:', () => {
  const { renderRubricLine } = loadPrompts();
  const line = renderRubricLine({ ...BARE_RUBRIC[2], rationale: 'เกณฑ์ก' });
  assert.strictEqual(line.includes('(ที่มา:'), false);
});

test('มี sources -> บรรทัดที่มา แสดงชื่อเอกสารและหน้า', () => {
  const { renderRubricLine } = loadPrompts();
  const line = renderRubricLine({
    ...BARE_RUBRIC[2],
    rationale: 'เกณฑ์ก',
    sources: [{ docId: 'ccpe_461', title: 'การใช้ยาปฏิชีวนะอย่างสมเหตุผล', page: 12 }],
  });
  assert.ok(line.includes('(ที่มา: การใช้ยาปฏิชีวนะอย่างสมเหตุผล หน้า 12)'));
});

test('หลาย sources -> คั่นด้วย " · " ในบรรทัดเดียว', () => {
  const { renderRubricLine } = loadPrompts();
  const line = renderRubricLine({
    ...BARE_RUBRIC[2],
    rationale: 'เกณฑ์ก',
    sources: [
      { docId: 'ccpe_461', title: 'เอกสาร ก', page: 12 },
      { docId: 'cpg_2565', title: 'เอกสาร ข', page: 3 },
    ],
  });
  const srcRow = line.split('\n').find(r => r.includes('ที่มา'));
  assert.strictEqual(srcRow, '  (ที่มา: เอกสาร ก หน้า 12 · เอกสาร ข หน้า 3)');
});

test('source ไม่มี page -> แสดงแค่ชื่อเอกสาร', () => {
  const { renderRubricLine } = loadPrompts();
  const line = renderRubricLine({
    ...BARE_RUBRIC[2], rationale: 'เกณฑ์ก',
    sources: [{ docId: 'ccpe_461', title: 'เอกสาร ก' }],
  });
  assert.ok(line.includes('(ที่มา: เอกสาร ก)'));
});

test('rationale ที่มีแต่ช่องว่าง ถือว่าไม่มี annotation', () => {
  const { renderRubricLine, rubricHasAnnotations } = loadPrompts();
  const item = { ...BARE_RUBRIC[0], rationale: '   ' };
  assert.strictEqual(renderRubricLine(item).includes('เกณฑ์อ้างอิง'), false);
  assert.strictEqual(rubricHasAnnotations([item]), false);
});

test('baseline: เคสไม่มี annotation -> prompt ไม่มีคำว่า เกณฑ์อ้างอิง เลย', () => {
  const { buildEvalPrompt } = loadPrompts();
  const p = buildEvalPrompt(makeCase(BARE_RUBRIC), ...EVAL_ARGS);
  assert.strictEqual(p.includes('เกณฑ์อ้างอิง'), false);
  assert.strictEqual(p.includes('ที่มา:'), false);
});

test('baseline: prompt ต้องไม่มีร่องรอย RAG เหลืออยู่', () => {
  const { buildEvalPrompt } = loadPrompts();
  const p = buildEvalPrompt(makeCase(BARE_RUBRIC), ...EVAL_ARGS);
  assert.strictEqual(p.includes('Guideline_Evidence'), false);
  assert.strictEqual(p.includes('citations'), false);
  assert.strictEqual(/\[G\d/.test(p), false);
});

test('เคสมี annotation -> prompt มีทั้งเกณฑ์และคำสั่งใช้เกณฑ์ตัดสิน', () => {
  const { buildEvalPrompt } = loadPrompts();
  const rubric = JSON.parse(JSON.stringify(BARE_RUBRIC));
  rubric[2].rationale = 'ต้องครบ 10 วัน';
  const p = buildEvalPrompt(makeCase(rubric), ...EVAL_ARGS);
  assert.ok(p.includes('เกณฑ์อ้างอิง: ต้องครบ 10 วัน'));
  assert.ok(p.includes('ตัดสิน earned ตามเกณฑ์นั้นเป็นหลัก'));
});

test('annotation อยู่ใต้ข้อของตัวเอง ไม่ใช่ข้ออื่น', () => {
  const { buildEvalPrompt } = loadPrompts();
  const rubric = JSON.parse(JSON.stringify(BARE_RUBRIC));
  rubric[2].rationale = 'เกณฑ์ยา';
  const p = buildEvalPrompt(makeCase(rubric), ...EVAL_ARGS);
  const rows = p.split('\n');
  const i = rows.findIndex(r => r.includes('เกณฑ์อ้างอิง: เกณฑ์ยา'));
  assert.ok(i > 0, 'ไม่พบบรรทัดเกณฑ์อ้างอิงใน prompt');
  assert.ok(rows[i - 1].includes('(r1)'), `บรรทัดก่อนหน้าควรเป็นข้อ r1 แต่ได้: ${rows[i - 1]}`);
});

test('เคสไม่มี annotation -> ไม่มีคำสั่งใช้เกณฑ์ตัดสิน', () => {
  const { buildEvalPrompt } = loadPrompts();
  const p = buildEvalPrompt(makeCase(BARE_RUBRIC), ...EVAL_ARGS);
  assert.strictEqual(p.includes('ตัดสิน earned ตามเกณฑ์นั้นเป็นหลัก'), false);
});

test('annotation ไม่แตะสูตรคะแนน — scoreRubric ให้ผลเท่ากันเป๊ะ', () => {
  const { scoreRubric } = loadPrompts();
  const withAnn = JSON.parse(JSON.stringify(BARE_RUBRIC));
  withAnn[2].rationale = 'เกณฑ์ยา';
  withAnn[2].sources = [{ docId: 'ccpe_461', title: 'เอกสาร ก', page: 1 }];
  const items = [
    { id: 'h1', earned: 1 }, { id: 'd1', earned: 0.5 },
    { id: 'r1', earned: 1 }, { id: 'c1', earned: 0 },
  ];
  const a = scoreRubric(makeCase(BARE_RUBRIC), items, 'female');
  const b = scoreRubric(makeCase(withAnn),     items, 'female');
  assert.strictEqual(a.overall, b.overall);
  assert.strictEqual(a.drug_score, b.drug_score);
});

test('js/prompts.js ต้องไม่มี require/import (classic script)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'prompts.js'), 'utf8');
  assert.strictEqual(/\brequire\s*\(/.test(src), false, 'พบ require() — เบราว์เซอร์จะพัง');
  assert.strictEqual(/^\s*import\s/m.test(src), false, 'พบ ESM import');
});
```

- [ ] **Step 3: รัน test ให้เห็นว่า fail**

```bash
cd setup && node --test test/grounding.test.js
```

Expected: FAIL — `ReferenceError: GROUNDING_VERSION is not defined` (`vm.runInContext` หาชื่อไม่เจอ)

> ถ้าเห็น error คนละแบบ ให้หยุดอ่านก่อน — อาจเป็นปัญหาที่ตัว harness ไม่ใช่โค้ด

- [ ] **Step 4: เพิ่ม `GROUNDING_VERSION`**

ใน `js/prompts.js` ใต้บรรทัด 8 (`DOMAIN_WEIGHTS`) เพิ่ม:

```js
// ── เวอร์ชันเฉลย+prompt ที่ใช้ประเมิน (treatment fidelity) ─────
// อยู่ในโค้ด ไม่ใช่ Firestore เพื่อให้ตรวจย้อนจาก git ได้และไม่มีใครแก้กลางการเก็บข้อมูล
// bump เมื่อแก้ annotation ในเคส หรือแก้ prompt ของ Step 4 · freeze ก่อนเก็บข้อมูลจริง
const GROUNDING_VERSION = '2026-08-09';
```

- [ ] **Step 5: แทน `buildGuidelineBlock()` ด้วยตัว render annotation**

ลบทั้งบล็อก `js/prompts.js:261-286` (ตั้งแต่คอมเมนต์ `// ── Guideline evidence block (RAG) ──` ถึงปีกกาปิดของ `buildGuidelineBlock`) แล้วใส่แทนที่:

```js
// ── Static guideline grounding ────────────────────────────────
// หลักฐานอ้างอิงผูกกับข้อ rubric รายข้อ (annotated marking scheme)
// เขียนไว้ล่วงหน้าในเฉลยเคสและผ่านการตรวจของผู้เชี่ยวชาญ — ไม่ได้ค้นคืนตอน runtime
// ข้อที่ไม่มี rationale ต้องได้บรรทัดเดียวเหมือนก่อนมีฟีเจอร์นี้ทุกประการ

function formatSourceRef(s) {
  if (!s) return '';
  const name = s.title || s.docId || '';
  return name ? `${name}${s.page ? ` หน้า ${s.page}` : ''}` : '';
}

function renderRubricLine(item) {
  const head = `- (${item.id}) ${item.label} [น้ำหนักข้อ ${item.weight}${item.critical ? ', CRITICAL' : ''}]`;
  const rationale = String(item.rationale || '').trim();
  if (!rationale) return head;

  const refs = (item.sources || []).map(formatSourceRef).filter(Boolean);
  const srcLine = refs.length ? `\n  (ที่มา: ${refs.join(' · ')})` : '';
  return `${head}\n  เกณฑ์อ้างอิง: ${rationale}${srcLine}`;
}

function rubricHasAnnotations(rubric) {
  return (rubric || []).some(it => String(it.rationale || '').trim());
}
```

- [ ] **Step 6: ให้ `buildEvalPrompt` ใช้ตัว render ใหม่**

แก้ลายเซ็นที่ `js/prompts.js:291` (ตัดพารามิเตอร์ที่ 5 และคอมเมนต์เหนือมัน):

```js
// ── Evaluation prompt (Step 4) ────────────────────────────────
// AI ตัดสินแค่ earned ต่อข้อ (0|0.5|1) — JS คำนวณคะแนนเองผ่าน scoreRubric()
// หลักฐานอ้างอิงมาจาก annotation ในข้อ rubric (ถ้าเคสนั้นมี) ไม่มีการค้นคืนตอน runtime
function buildEvalPrompt(caseData, chatHistory, dispensedDrugs, counselingHistory) {
```

แก้การสร้าง `lines` ใน `checklistText` (บรรทัด 303-305) ให้เรียกฟังก์ชันใหม่:

```js
    const lines = items.map(renderRubricLine).join('\n');
```

- [ ] **Step 7: เพิ่มคำสั่งประเมิน + ตัด `citations` ออกจาก JSON schema**

เหนือ `return` ของ `buildEvalPrompt` (ก่อนบรรทัด 349) เพิ่ม:

```js
  // คำสั่งนี้โผล่เฉพาะเคสที่มี annotation — เคสอื่นได้ prompt เท่าเดิมทุกตัวอักษร
  const groundingRules = rubricHasAnnotations(rubric) ? `
- ข้อที่มี "เกณฑ์อ้างอิง" กำกับ: ให้ตัดสิน earned ตามเกณฑ์นั้นเป็นหลัก และอธิบายใน feedback ว่านักศึกษาทำได้ตรงหรือขาดตรงไหนเทียบกับเกณฑ์
- ห้ามแต่งเนื้อหาเชิงวิชาการเพิ่มเองนอกเหนือจาก "เกณฑ์อ้างอิง" ที่ให้ไว้` : '';
```

ใน template ของ prompt: ลบบรรทัด `${buildGuidelineBlock(guidelineChunks)}` (บรรทัด 373)

ต่อท้าย bullet `- อ้างอิงหลักฐานจาก transcript เสมอ ...` (บรรทัด 383) ให้เป็น:

```
- อ้างอิงหลักฐานจาก transcript เสมอ ก่อนสรุป earned ให้เขียนวิเคราะห์ทีละหมวดใน "reasoning"${groundingRules}
```

แก้ท้าย JSON schema — เดิมสองบรรทัดสุดท้ายเป็น `"summary": "...",` ตามด้วย `"citations": ["G1"]` เปลี่ยนเป็น:

```
  "summary": "สรุปภาพรวม 2-3 ประโยค จุดเด่นและจุดที่ต้องพัฒนา"
}

หมายเหตุ:
- ต้องมี "items" ครบทุก id ที่อยู่ใน <Checklist> ห้ามข้าม
```

(ตัด `"citations"` ออกจาก schema และตัดหมายเหตุสองบรรทัดที่อธิบาย `citations` ทิ้ง — สังเกตว่า `"summary"` ต้องไม่มี comma ต่อท้ายแล้ว)

- [ ] **Step 8: รัน test ให้ผ่าน**

```bash
cd setup && node --test test/grounding.test.js
```

Expected: PASS ทุกเคส

ถ้า `baseline: prompt ต้องไม่มีร่องรอย RAG เหลืออยู่` fail ให้ค้น `grep -n "citations\|Guideline_Evidence" ../js/prompts.js` ว่ายังเหลือตรงไหน

- [ ] **Step 9: รัน test ทั้งชุด — คาดว่า `rag-query` จะยังผ่าน (ยังไม่ลบรอบนี้)**

```bash
cd setup && npm test
```

Expected: PASS ทั้งหมด — Task นี้ไม่แตะ `js/rag.js`
`chat.js` ยังส่ง argument ที่ 5 อยู่ ซึ่ง JS จะเมินให้เอง แอปจึงยังทำงานได้ (แค่ยังไม่แสดงอ้างอิง)

- [ ] **Step 10: Commit**

```bash
git add js/prompts.js setup/test/grounding.test.js
git commit -m "feat(grounding): per-rubric-item annotations in eval prompt

Replaces the RAG evidence block. Items without a rationale render exactly
as before, so cases that are not yet annotated produce an identical prompt.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `collectGuidelineSources()`

**Files:**
- Modify: `js/prompts.js` (เพิ่มฟังก์ชันต่อจาก `rubricHasAnnotations`)
- Test: `setup/test/grounding.test.js` (เพิ่ม test ต่อท้าย)

**Interfaces:**
- Consumes: `buildRubricForCase()`, `DOMAIN_ORDER` จาก Task 1
- Produces: `collectGuidelineSources(caseData) -> Array<{docId, title, page, url}>` — Task 3 เรียกใช้ใน `chat.js`

---

- [ ] **Step 1: เขียน test ที่ต้อง fail**

เพิ่ม `collectGuidelineSources` เข้าลิสต์ที่ดึงออกจาก sandbox ใน `loadPrompts()` (ในไฟล์ `setup/test/grounding.test.js` จาก Task 1):

```js
  ['GROUNDING_VERSION', 'renderRubricLine', 'rubricHasAnnotations',
   'collectGuidelineSources', 'buildEvalPrompt', 'buildRubricForCase',
   'scoreRubric'].forEach(n => {
```

แล้วเพิ่ม test ต่อท้ายไฟล์:

```js
// ── collectGuidelineSources ──────────────────────────────────

const SRC_A = { docId: 'ccpe_461', title: 'เอกสาร ก', page: 12, url: 'https://x/461' };
const SRC_B = { docId: 'cpg_2565', title: 'เอกสาร ข', page: 3 };

test('เคสไม่มี annotation -> คืน array ว่าง', () => {
  const { collectGuidelineSources } = loadPrompts();
  assert.strictEqual(collectGuidelineSources(makeCase(BARE_RUBRIC)).length, 0);
});

test('รวม sources จากทุกข้อ เรียงตาม DOMAIN_ORDER', () => {
  const { collectGuidelineSources } = loadPrompts();
  const rubric = JSON.parse(JSON.stringify(BARE_RUBRIC));
  rubric[2].sources = [SRC_A];   // drug   (หมวดที่ 3)
  rubric[0].sources = [SRC_B];   // history (หมวดที่ 1)
  const out = collectGuidelineSources(makeCase(rubric));
  // array ข้าม realm เทียบด้วย deepStrictEqual ไม่ได้ — เทียบเป็น string
  assert.strictEqual(Array.from(out, s => s.docId).join(','), 'cpg_2565,ccpe_461');
});

test('dedup ด้วย docId|page — เอกสารหน้าเดียวกันไม่ซ้ำ', () => {
  const { collectGuidelineSources } = loadPrompts();
  const rubric = JSON.parse(JSON.stringify(BARE_RUBRIC));
  rubric[0].sources = [SRC_A];
  rubric[2].sources = [SRC_A];
  assert.strictEqual(collectGuidelineSources(makeCase(rubric)).length, 1);
});

test('เอกสารเดียวกันคนละหน้า ถือเป็นคนละรายการ', () => {
  const { collectGuidelineSources } = loadPrompts();
  const rubric = JSON.parse(JSON.stringify(BARE_RUBRIC));
  rubric[0].sources = [SRC_A, { ...SRC_A, page: 13 }];
  const out = collectGuidelineSources(makeCase(rubric));
  assert.strictEqual(Array.from(out, s => s.page).join(','), '12,13');
});

test('ข้อ active:false ไม่ถูกนับ', () => {
  const { collectGuidelineSources } = loadPrompts();
  const rubric = JSON.parse(JSON.stringify(BARE_RUBRIC));
  rubric[0].sources = [SRC_A];
  rubric[0].active = false;
  assert.strictEqual(collectGuidelineSources(makeCase(rubric)).length, 0);
});

test('source ที่ไม่มี docId ถูกข้าม', () => {
  const { collectGuidelineSources } = loadPrompts();
  const rubric = JSON.parse(JSON.stringify(BARE_RUBRIC));
  rubric[0].sources = [{ title: 'ไม่มี docId' }, SRC_A];
  const out = collectGuidelineSources(makeCase(rubric));
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].docId, 'ccpe_461');
});

test('เติมค่า default ให้ครบทุก field ที่หน้าสรุปต้องใช้', () => {
  const { collectGuidelineSources } = loadPrompts();
  const rubric = JSON.parse(JSON.stringify(BARE_RUBRIC));
  rubric[0].sources = [{ docId: 'only_id' }];
  const s = collectGuidelineSources(makeCase(rubric))[0];
  assert.strictEqual(s.title, 'only_id');   // ไม่มี title -> ใช้ docId
  assert.strictEqual(s.page, null);
  assert.strictEqual(s.url, null);
});

test('ลำดับคงที่เมื่อเรียกซ้ำ (ต้องนิ่งเพื่อ treatment fidelity)', () => {
  const { collectGuidelineSources } = loadPrompts();
  const rubric = JSON.parse(JSON.stringify(BARE_RUBRIC));
  rubric[3].sources = [SRC_B];
  rubric[1].sources = [SRC_A];
  const c = makeCase(rubric);
  const first  = Array.from(collectGuidelineSources(c), s => s.docId).join(',');
  const second = Array.from(collectGuidelineSources(c), s => s.docId).join(',');
  assert.strictEqual(first, second);
  assert.strictEqual(first, 'ccpe_461,cpg_2565');  // diagnosis มาก่อน counseling
});
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
cd setup && node --test test/grounding.test.js
```

Expected: FAIL — `ReferenceError: collectGuidelineSources is not defined`

- [ ] **Step 3: เขียน implementation**

ใน `js/prompts.js` ต่อจาก `rubricHasAnnotations()`:

```js
// รวมรายการอ้างอิงของทั้งเคส สำหรับแสดงในหน้าสรุป
// เรียกตอน Step 4 (ไม่ใช่ตอนแสดงผล) เพราะ /results เก็บแค่ caseSnapshot ที่ไม่มี rubric
// และเพื่อให้ผลเก่าไม่เปลี่ยนตามการแก้ annotation ภายหลัง
// ลำดับต้องคงที่ -> ไล่ตาม DOMAIN_ORDER แล้วตามลำดับข้อในหมวด
function collectGuidelineSources(caseData) {
  const rubric = buildRubricForCase(caseData).filter(it => it.active !== false);
  const seen = new Set();
  const out  = [];

  DOMAIN_ORDER.forEach(dom => {
    rubric.filter(it => it.domain === dom).forEach(it => {
      (it.sources || []).forEach(s => {
        if (!s || !s.docId) return;
        const key = `${s.docId}|${s.page || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
          docId: s.docId,
          title: s.title || s.docId,
          page:  s.page || null,
          url:   s.url  || null,
        });
      });
    });
  });
  return out;
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
cd setup && npm test
```

Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add js/prompts.js setup/test/grounding.test.js
git commit -m "feat(grounding): collectGuidelineSources for the summary screen

Computed at eval time because /results stores only caseSnapshot without
the rubric, and so old results keep the references they were graded with.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: ต่อสายเข้าแอป — chat.js · db.js · summary.js

**Files:**
- Modify: `js/screens/chat.js:917-946`, `js/db.js:92-114`, `js/screens/summary.js:103-123`, `index.html`
- Test: `setup/test/summary-citations.test.js` (เขียนใหม่ทั้งไฟล์)

**Interfaces:**
- Consumes: `collectGuidelineSources()`, `GROUNDING_VERSION` จาก Task 1-2
- Produces:
  - `saveResult(sessionId, userId, evalJson, caseSnapshot, grounding)` — `grounding` = `{ refs: Array, version: string }` หรือ `null`
  - `/results` ได้ฟิลด์ `guidelineRefs: Array` และ `groundingVersion: string|null` แทนฟิลด์ `rag`

---

- [ ] **Step 1: เขียน test ที่ต้อง fail**

แทนที่ `setup/test/summary-citations.test.js` ทั้งไฟล์:

```js
// ============================================================
//  summary-citations.test.js
//  ตรวจ section "อ้างอิงแนวทางเวชปฏิบัติ" ในหน้าสรุป
//  โดยไม่ต้องพึ่ง Firestore — ยกเฉพาะเทมเพลตมาทดสอบ
//
//  สำคัญเพราะข้อจำกัดลิขสิทธิ์: ห้ามแสดงข้อความต้นฉบับจากไกด์ไลน์
//  แสดงได้แค่ชื่อเอกสาร + หน้า + ลิงก์
// ============================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'screens', 'summary.js'), 'utf8');

// จำลองบล็อกอ้างอิงให้ตรงกับซอร์สจริง (ทดสอบพฤติกรรม)
function renderRefs(result) {
  const _escS = (s) => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return (result.guidelineRefs || []).length ? `
        <div class="card mb-3">
          <h3 class="mb-1">📚 อ้างอิงแนวทางเวชปฏิบัติ</h3>
          <p class="text-dim text-sm mb-2">เกณฑ์การประเมินเคสนี้อ้างอิงจากเอกสารต่อไปนี้</p>
          ${result.guidelineRefs.map(r => `
            <div class="checklist-item">
              <div class="checklist-icon">📄</div>
              <div class="checklist-text">
                <div>${_escS(r.title)}${r.page ? ` หน้า ${_escS(String(r.page))}` : ''}</div>
                ${r.url ? `<div class="checklist-note"><a href="${_escS(r.url)}" target="_blank" rel="noopener">เปิดเอกสาร</a></div>` : ''}
              </div>
            </div>`).join('')}
        </div>` : '';
}

const REF = {
  docId: 'ccpe461_uri', page: 3,
  title: 'แนวทางการเลือกใช้ยาปฏิชีวนะ',
  url: 'https://ccpe.pharmacycouncil.org/showfile.php?file=461',
};

test('ไม่มี guidelineRefs -> ไม่แสดง section เลย', () => {
  assert.strictEqual(renderRefs({}), '');
  assert.strictEqual(renderRefs({ guidelineRefs: [] }), '');
});

test('มี guidelineRefs -> แสดงชื่อเอกสาร หน้า และลิงก์', () => {
  const html = renderRefs({ guidelineRefs: [REF] });
  assert.ok(html.includes('อ้างอิงแนวทางเวชปฏิบัติ'));
  assert.ok(html.includes('แนวทางการเลือกใช้ยาปฏิชีวนะ'));
  assert.ok(html.includes('หน้า 3'));
  assert.ok(html.includes('showfile.php?file=461'));
});

test('ไม่มี url -> ไม่แสดงลิงก์ แต่ยังแสดงรายการ', () => {
  const html = renderRefs({ guidelineRefs: [{ ...REF, url: null }] });
  assert.ok(html.includes('แนวทางการเลือกใช้ยาปฏิชีวนะ'));
  assert.strictEqual(html.includes('เปิดเอกสาร'), false);
});

test('ไม่มี page -> แสดงแค่ชื่อเอกสาร', () => {
  const html = renderRefs({ guidelineRefs: [{ ...REF, page: null }] });
  assert.strictEqual(html.includes('หน้า'), false);
});

test('escape HTML กัน XSS จากชื่อเอกสาร', () => {
  const html = renderRefs({ guidelineRefs: [{ ...REF, title: '<script>alert(1)</script>' }] });
  assert.strictEqual(html.includes('<script>alert'), false);
  assert.ok(html.includes('&lt;script&gt;'));
});

test('ซอร์สจริงอ่านจาก result.guidelineRefs ไม่ใช่ fb.guidelineRefs', () => {
  assert.ok(SRC.includes('result.guidelineRefs'), 'ต้องอ่านจาก result');
  assert.strictEqual(/fb\.guidelineRefs/.test(SRC), false,
    'ยังอ่านจาก feedbackJson อยู่ — AI ไม่ได้ผลิตรายการนี้แล้ว');
});

test('ซอร์สจริงต้องไม่แสดงข้อความต้นฉบับของไกด์ไลน์ (ลิขสิทธิ์)', () => {
  const block = SRC.slice(SRC.indexOf('guidelineRefs'), SRC.indexOf('<!-- Actions -->'));
  assert.strictEqual(/r\.text|r\.summaryTh/.test(block), false,
    'พบการแสดงเนื้อความจากเอกสาร — ผิดข้อจำกัดลิขสิทธิ์');
});

test('ซอร์สจริงต้องไม่เหลือกลไก tag G1..Gn', () => {
  assert.strictEqual(/r\.tag/.test(SRC), false, 'ยังเหลือ r.tag — กลไก tag ถูกตัดไปแล้ว');
});

test('ซอร์สจริงต้องมี section นี้อยู่ก่อนบล็อก Actions', () => {
  assert.ok(SRC.indexOf('guidelineRefs') > 0);
  assert.ok(SRC.indexOf('guidelineRefs') < SRC.indexOf('<!-- Actions -->'));
});
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
cd setup && node --test test/summary-citations.test.js
```

Expected: FAIL ที่ `ซอร์สจริงอ่านจาก result.guidelineRefs ไม่ใช่ fb.guidelineRefs` และ `ซอร์สจริงต้องไม่เหลือกลไก tag G1..Gn`

- [ ] **Step 3: แก้ `js/db.js`**

แทนที่ `js/db.js:92` และฟิลด์ `rag` (บรรทัด 104-112):

```js
async function saveResult(sessionId, userId, evalJson, caseSnapshot = null, grounding = null) {
```

```js
    feedbackJson:      evalJson,
    // อ้างอิงที่ผูกกับข้อ rubric ของเคส ณ ตอนที่ทำ — เก็บสำเนาไว้เพื่อให้ผลเก่า
    // ไม่เปลี่ยนตามการแก้เฉลยภายหลัง และตรวจย้อนเชิงวิจัยได้
    guidelineRefs:     grounding?.refs || [],
    groundingVersion:  grounding?.version || null,
    createdAt:         firebase.firestore.FieldValue.serverTimestamp(),
```

- [ ] **Step 4: แก้ `js/screens/chat.js`**

แทนที่ `js/screens/chat.js:917-946` (ตั้งแต่ `try {` ถึงบรรทัด `Router.go('summary', ...)`):

```js
  try {
    const prompt  = buildEvalPrompt(_caseData, _chatHistory, _dispensedDrugs, _counselingHistory);
    const raw     = await geminiComplete(prompt);
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const evalJson = JSON.parse(cleaned);

    // คำนวณคะแนนแบบ deterministic จากน้ำหนัก rubric (AI ให้แค่ earned รายข้อ)
    //
    // ⚠️ annotation (rationale) ในข้อ rubric ตั้งใจให้เปลี่ยนการตัดสิน earned ของ AI
    //    แต่ไม่แตะสูตรคำนวณ — scoreRubric ใช้ weight ล้วน
    //    ต้อง freeze GROUNDING_VERSION + prompt ก่อนเก็บข้อมูล (treatment fidelity)
    const scored = scoreRubric(_caseData, evalJson.items, _caseData.gender);
    Object.assign(evalJson, scored);   // เติม *_score, overall, checklist_results

    const user   = getCurrentUser();
    const result = await saveResult(_session.id, user.uid, evalJson, _caseData, {
      refs:    collectGuidelineSources(_caseData),
      version: GROUNDING_VERSION,
    });
    _disableRefreshGuard();   // evaluation saved — safe to leave
    Router.go('summary', { sessionId: _session.id, resultId: result.id });
```

- [ ] **Step 5: แก้ `js/screens/summary.js`**

แทนที่ `js/screens/summary.js:103-123`:

```js
      <!-- Guideline references (static grounding — ผูกกับข้อ rubric ของเคส) -->
      <!-- ⚠️ ลิขสิทธิ์: แสดงได้แค่ชื่อเอกสาร + หน้า + ลิงก์
           ห้ามแสดงข้อความต้นฉบับจากไกด์ไลน์ -->
      ${(result.guidelineRefs || []).length ? `
        <div class="card mb-3">
          <h3 class="mb-1">📚 อ้างอิงแนวทางเวชปฏิบัติ</h3>
          <p class="text-dim text-sm mb-2">เกณฑ์การประเมินเคสนี้อ้างอิงจากเอกสารต่อไปนี้</p>
          ${result.guidelineRefs.map(r => `
            <div class="checklist-item">
              <div class="checklist-icon">📄</div>
              <div class="checklist-text">
                <div>${_escS(r.title)}${r.page ? ` หน้า ${_escS(String(r.page))}` : ''}</div>
                ${r.url ? `<div class="checklist-note"><a href="${_escS(r.url)}" target="_blank" rel="noopener">เปิดเอกสาร</a></div>` : ''}
              </div>
            </div>`).join('')}
        </div>` : ''}
```

- [ ] **Step 6: bump `?v=` ใน `index.html`**

`js/db.js?v=5` → `?v=6` · `js/prompts.js?v=10` → `?v=11` · `js/screens/chat.js?v=24` → `?v=25` · `js/screens/summary.js?v=4` → `?v=5`

- [ ] **Step 7: รัน test ให้ผ่าน**

```bash
cd setup && npm test
```

Expected: PASS ทั้งหมด (`rag-query.test.js` ยังผ่านอยู่ — `js/rag.js` ยังไม่ถูกลบ)

- [ ] **Step 8: ตรวจว่าไม่มีใครเรียก RAG ในแอปแล้ว**

```bash
grep -rn "RAG\." js/ index.html
```

Expected: ไม่มีผลลัพธ์ (เหลือแค่ `js/rag.js` เองที่จะถูกลบใน Task 4 — ไฟล์นั้นนิยาม `RAG.` ของตัวเอง จึงจะยังโผล่ในผลค้น ให้ยืนยันว่าผลที่เหลือมาจาก `js/rag.js` เท่านั้น)

- [ ] **Step 9: Commit**

```bash
git add js/screens/chat.js js/db.js js/screens/summary.js index.html setup/test/summary-citations.test.js
git commit -m "feat(grounding): wire static references through eval and summary

Step 4 no longer calls retrieval. References are collected from the case
rubric and stored on the result, so the summary needs no extra read and
old results keep the references they were graded with.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: ลบ runtime RAG และย้าย `rag-core.js` ไป offline

**Files:**
- Delete: `js/rag.js`, `setup/test/rag-query.test.js`, `setup/test/rag-core-browser.test.js`
- Move: `js/rag-core.js` → `setup/lib/rag-core.js`
- Modify: `index.html`, `setup/eval-retrieval.js:17`, `setup/index-guidelines.js:20`, `setup/test/rag-core.test.js:9`

**Interfaces:**
- Consumes: ยืนยันจาก Task 3 ว่าไม่มีโค้ดในแอปเรียก `RAG` แล้ว
- Produces: `require('./lib/rag-core')` (จากไฟล์ใน `setup/`) และ `require('../lib/rag-core')` (จากไฟล์ใน `setup/test/`)

---

- [ ] **Step 1: ยืนยันว่าไม่มีใครเรียกใช้ก่อนลบ**

```bash
grep -rn "RAG\b" js/ index.html | grep -v "^js/rag.js:" | grep -v "^js/rag-core.js:"
```

Expected: ไม่มีผลลัพธ์ — ถ้ามี **หยุดทันที** แปลว่า Task 3 ยังไม่ครบ

- [ ] **Step 2: ลบและย้ายไฟล์**

```bash
git rm js/rag.js setup/test/rag-query.test.js setup/test/rag-core-browser.test.js
git mv js/rag-core.js setup/lib/rag-core.js
```

- [ ] **Step 3: แก้ path ที่ require ทั้งสามจุด**

- `setup/eval-retrieval.js:17` — `require('../js/rag-core')` → `require('./lib/rag-core')`
- `setup/index-guidelines.js:20` — `require('../js/rag-core')` → `require('./lib/rag-core')`
- `setup/test/rag-core.test.js:9` — `require('../../js/rag-core')` → `require('../lib/rag-core')`

แก้คอมเมนต์ที่ `setup/eval-retrieval.js:11` ด้วย — เดิมเขียนว่า "ใช้ js/rag-core.js ตัวเดียวกับที่เบราว์เซอร์ใช้" ซึ่งไม่จริงแล้ว เปลี่ยนเป็น:

```js
//  ใช้ setup/lib/rag-core.js ตัวเดียวกับที่ index-guidelines.js ใช้ ผลจึงเทียบได้ตรง
```

- [ ] **Step 4: แก้หัวและท้ายไฟล์ `setup/lib/rag-core.js`**

แทนที่หัวไฟล์บรรทัด 1-10 ทั้งบล็อก:

```js
// ============================================================
//  rag-core.js
//  คณิตค้นคืน — ไม่มี I/O ไม่มี dependency
//
//  ⚠️ offline เท่านั้น — เบราว์เซอร์ไม่โหลดไฟล์นี้แล้วตั้งแต่ถอด runtime RAG
//     (2026-08-09) ใช้โดย setup/index-guidelines.js และ setup/eval-retrieval.js
//     เก็บไว้เพราะคลัง 719 chunk คือวัตถุดิบสำหรับเขียน annotation ในเฉลยเคส
// ============================================================
```

แทนที่สองบรรทัดสุดท้ายของไฟล์ (เดิมคือ `const RAGCore = {...}` และ `if (typeof module !== 'undefined') module.exports = RAGCore;`) ด้วย:

```js
module.exports = { quantize, dequantize, cosine, mergeTopK, capPerDoc };
```

> ตัว global `RAGCore` และ guard `typeof module` มีไว้เพื่อให้ไฟล์รันได้ทั้งสองฝั่ง — ไม่ต้องใช้แล้ว

- [ ] **Step 5: ลบ `<script>` สองบรรทัดใน `index.html`**

ลบ `<script src="js/rag-core.js?v=1"></script>` และ `<script src="js/rag.js?v=1"></script>`

- [ ] **Step 6: รัน test ทั้งชุด**

```bash
cd setup && npm test
```

Expected: PASS — จำนวน test ลดลงจากเดิมเพราะลบไป 2 ไฟล์ ที่เหลือต้องไม่มี fail
ถ้าเห็น `Cannot find module '../js/rag-core'` แปลว่ายังแก้ path ไม่ครบ ให้ `grep -rn "rag-core" setup/ --include=*.js | grep -v node_modules`

- [ ] **Step 7: ยืนยันว่าไม่มี reference ค้างในทั้ง repo**

```bash
grep -rn "js/rag" --include=*.js --include=*.html --include=*.json . | grep -v node_modules
```

Expected: ไม่มีผลลัพธ์

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: delete runtime RAG, move rag-core into setup/lib

Retrieval math is an offline authoring tool now, not something the browser
loads. The corpus and the indexing pipeline stay -- they become the source
material for writing the annotations once the IOC-approved cases arrive.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: กันไม่ให้ admin ทำ annotation หาย

**Files:**
- Modify: `js/screens/admin.js:790-801`, `index.html`
- Test: `setup/test/admin-rubric-passthrough.test.js` (สร้าง)

**Interfaces:**
- Consumes: schema `rationale`/`sources` จาก Task 1
- Produces: ไม่มี — เป็นการปิดช่องข้อมูลหาย

**บริบท:** `admin.js:680` โหลด rubric ด้วย deep clone จึงเก็บฟิลด์ครบ แต่ตอนบันทึกที่บรรทัด 790-801 มีการ map สร้าง object ใหม่แบบ whitelist ฟิลด์ที่ไม่อยู่ในลิสต์จะหายเงียบ **รอบนี้ทำแค่ pass-through ยังไม่ทำ UI แก้ไข**

---

- [ ] **Step 1: เขียน test ที่ต้อง fail**

สร้าง `setup/test/admin-rubric-passthrough.test.js`:

```js
// ============================================================
//  admin-rubric-passthrough.test.js
//  admin.js สร้าง rubric object ใหม่แบบ whitelist ตอนบันทึกเคส
//  annotation ยังไม่มี UI แก้ไข ถ้าไม่ pass-through จะหายเงียบ
//  เมื่ออาจารย์เปิดเคสแล้วกดบันทึก
//
//  ทดสอบที่ระดับซอร์ส เพราะโค้ดส่วนนี้ผูกกับ DOM ทั้งก้อน
// ============================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'screens', 'admin.js'), 'utf8');

// ยกเฉพาะบล็อก map ที่ประกอบ rubric ตอน save
function rubricMapBlock() {
  const start = SRC.indexOf('const rubric = _caseRubric');
  assert.ok(start > 0, 'หาบล็อกประกอบ rubric ตอน save ไม่เจอ — โครงไฟล์เปลี่ยนไปแล้ว');
  const end = SRC.indexOf('}));', start);
  assert.ok(end > start, 'หาจุดจบของบล็อกไม่เจอ');
  return SRC.slice(start, end);
}

test('บล็อกประกอบ rubric ต้อง pass-through rationale', () => {
  assert.ok(/rationale/.test(rubricMapBlock()),
    'rationale จะหายเมื่ออาจารย์กดบันทึกเคส');
});

test('บล็อกประกอบ rubric ต้อง pass-through sources', () => {
  assert.ok(/sources/.test(rubricMapBlock()),
    'sources จะหายเมื่ออาจารย์กดบันทึกเคส');
});

test('ฟิลด์เดิมต้องยังอยู่ครบ', () => {
  const block = rubricMapBlock();
  ['id', 'domain', 'label', 'weight', 'critical', 'active', 'femaleOnly', 'custom']
    .forEach(f => assert.ok(block.includes(f), `ฟิลด์ ${f} หายไปจาก whitelist`));
});
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

```bash
cd setup && node --test test/admin-rubric-passthrough.test.js
```

Expected: FAIL 2 เคส — `rationale จะหายเมื่ออาจารย์กดบันทึกเคส` และเคส `sources`

- [ ] **Step 3: เพิ่มสองฟิลด์เข้า whitelist**

ใน `js/screens/admin.js` หลังบรรทัด `...(it.custom ? { custom: true } : {}),`:

```js
      // annotation ยังไม่มี UI แก้ไข — ต้อง pass-through ไม่งั้นหายเงียบตอนกดบันทึก
      ...(String(it.rationale || '').trim() ? { rationale: it.rationale.trim() } : {}),
      ...(Array.isArray(it.sources) && it.sources.length ? { sources: it.sources } : {}),
```

- [ ] **Step 4: bump `?v=` ของ admin.js**

`js/screens/admin.js?v=6` → `?v=7` ใน `index.html`

- [ ] **Step 5: รัน test ทั้งชุดให้ผ่าน**

```bash
cd setup && npm test
```

Expected: PASS ทั้งหมด

- [ ] **Step 6: Commit**

```bash
git add js/screens/admin.js index.html setup/test/admin-rubric-passthrough.test.js
git commit -m "fix(admin): keep rubric annotations when saving a case

The save path rebuilds each rubric item from a field whitelist, so
rationale and sources would vanish the first time a teacher opened a case
and pressed save. No editing UI yet -- that comes with the real cases.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: เอกสาร + ล้าง `/config/rag`

**Files:**
- Modify: `CLAUDE.md`, `docs/specs/2026-08-08-rag-clinical-guidelines.md`, `docs/plans/2026-08-08-rag-phase1-indexing.md`, `docs/plans/2026-08-09-rag-phase3-runtime.md`

**Interfaces:**
- Consumes: สถานะสุดท้ายของโค้ดหลัง Task 1-5
- Produces: ไม่มี — เป็นงานเอกสารและล้าง Firestore

---

- [ ] **Step 1: แปะหัวเอกสารเก่าว่าเลิกใช้แล้ว**

บนสุดของ `docs/specs/2026-08-08-rag-clinical-guidelines.md`:

```markdown
> **⚠️ SUPERSEDED (2026-08-09)** — runtime RAG ถูกถอดออกจากแอปแล้ว
> แทนที่ด้วย `docs/specs/2026-08-09-static-guideline-grounding.md`
>
> เก็บไฟล์นี้ไว้เพราะยังใช้อ้างในเล่มวิทยานิพนธ์ได้: ผลวัด A/B ก่อน-หลังมี RAG ·
> บทเรียนการถอดข้อความ PDF ไทย · ตารางความครอบคลุมไกด์ไลน์รายเคส
> **ส่วน Runtime (`js/`) ในเอกสารนี้ไม่ตรงกับโค้ดปัจจุบันแล้ว**
```

บนสุดของ `docs/plans/2026-08-09-rag-phase3-runtime.md`:

```markdown
> **⚠️ ยกเลิก (2026-08-09)** — งานทั้งแผนนี้ถูกถอดออกใน
> `docs/plans/2026-08-09-static-guideline-grounding.md`
```

บนสุดของ `docs/plans/2026-08-08-rag-phase1-indexing.md`:

```markdown
> **หมายเหตุ (2026-08-09)** — แผนนี้ยังใช้ได้ offline pipeline ไม่เปลี่ยน
> แต่ `js/rag-core.js` ย้ายไป `setup/lib/rag-core.js` แล้ว
> คลัง 719 chunk ยังอยู่ใน Firestore เป็นวัตถุดิบสำหรับเขียน annotation
```

- [ ] **Step 2: แก้ `CLAUDE.md` — ตาราง Quick Orientation**

แถว `งาน RAG อ้างอิงเวชปฏิบัติ` เปลี่ยนเป็น:

```markdown
| แก้หลักฐานอ้างอิงในเฉลย (annotation) | `docs/specs/2026-08-09-static-guideline-grounding.md` |
```

- [ ] **Step 3: แก้ `CLAUDE.md` — Script Load Order**

ลบสองบรรทัด `rag-core.js` และ `rag.js` ออกจากบล็อก load order
ลบย่อหน้าท้ายที่ขึ้นต้นว่า ``js/rag-core.js` ต้องรันได้ทั้งเบราว์เซอร์และ Node` พร้อมบรรทัดที่อ้าง `setup/test/rag-core-browser.test.js`

- [ ] **Step 4: แก้ `CLAUDE.md` — ตาราง Firestore Collections**

ลบแถว `/config/rag` · แก้สองแถว guideline เป็น offline:

```markdown
| `/guidelineIndex/{groupId}_{shard}` | `{ corpusVersion, groupId, entries[] }` | **offline เท่านั้น** — วัตถุดิบเขียน annotation ไม่มีโค้ดฝั่งเบราว์เซอร์อ่าน |
| `/guidelineChunks/{chunkId}` | `{ docId, page, heading, text, summaryTh, hash }` | **offline เท่านั้น** — เนื้อหาเต็มสำหรับร่างเฉลย |
```

เพิ่มแถวฟิลด์ใหม่ของ `/results`:

```markdown
| `/results/{id}` | score fields + feedbackJson + `guidelineRefs[]` + `groundingVersion` | linked to sessionId + userId |
```

- [ ] **Step 5: แก้ `CLAUDE.md` — Case Schema**

ต่อจากบล็อก schema ของ `/cases` เพิ่ม:

```markdown
**rubric item รองรับ annotation (static guideline grounding):**
```js
{ id: 'r1', domain: 'drug', label: '...', weight: 7, critical: true, active: true,
  rationale: 'เกณฑ์ตัดสินข้อนี้ตามหลักฐาน — ว่างได้',
  sources: [{ docId, title, page, url }] }
```
ทั้งสองฟิลด์ optional · ข้อที่ไม่มี `rationale` ได้ prompt เหมือนก่อนมีฟีเจอร์นี้ทุกประการ
· **ยังไม่มี UI แก้ไขใน admin** (pass-through อย่างเดียว) รอเคสที่ผ่าน IOC
```

- [ ] **Step 6: แก้ `CLAUDE.md` — ส่วน Setup Scripts และ Prompts**

ในบล็อก RAG ของ Setup Scripts เปลี่ยนหัวข้อเป็น
`**คลังแนวทางเวชปฏิบัติ (offline — วัตถุดิบเขียน annotation)**` และคงคำสั่งทั้งสี่ไว้

ในตารางฟังก์ชันของ `js/prompts.js` แก้แถว `buildEvalPrompt` ให้ตรงลายเซ็นใหม่ (4 พารามิเตอร์)
และเพิ่มแถว `collectGuidelineSources(caseData)` · ใน Eval JSON output schema ลบ `"citations"`

- [ ] **Step 7: แก้ `CLAUDE.md` — Known Issues**

ลบ/แก้บรรทัดที่ไม่จริงแล้ว: `Scoring weights hardcoded ใน prompts.js:199` → ของจริงอยู่บรรทัด 8
เพิ่มบรรทัด: `- ยังไม่มี UI แก้ annotation (rationale/sources) ใน admin rubric editor`
เพิ่มบรรทัด: `- ปุ่ม "↺ ค่าเริ่มต้น" ต่อหมวดใน rubric editor ลบ annotation ของหมวดนั้นทิ้ง (มี confirm dialog)`

- [ ] **Step 8: ลบ `/config/rag` ออกจาก Firestore**

```bash
cd setup && node -e "
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(require('./serviceAccountKey.json'))});
admin.firestore().collection('config').doc('rag').delete()
  .then(()=>{console.log('ลบ /config/rag แล้ว');process.exit(0)})
  .catch(e=>{console.error(e);process.exit(1)});
"
```

Expected: `ลบ /config/rag แล้ว`
(ถ้าไม่มี `serviceAccountKey.json` ให้ข้ามขั้นนี้และแจ้งผู้ใช้ว่ายังต้องลบเอง — document นี้ไม่มีโค้ดอ่านแล้ว จึงไม่กระทบการทำงาน)

- [ ] **Step 9: รัน test ทั้งชุดปิดท้าย**

```bash
cd setup && npm test
```

Expected: PASS ทั้งหมด

- [ ] **Step 10: ตรวจว่าเอกสารไม่ได้อ้างของที่ลบไปแล้ว**

```bash
grep -n "rag.js\|config/rag\|citations\|rag-core-browser" CLAUDE.md
```

Expected: ไม่มีผลลัพธ์ (การอ้าง `setup/lib/rag-core.js` ยังมีได้)

- [ ] **Step 11: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs: bring CLAUDE.md and the RAG docs in line with static grounding

Marks the runtime-RAG spec superseded rather than deleting it -- its A/B
numbers, Thai PDF extraction lessons, and per-case coverage table are still
cited in the thesis.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## หลังจบทุก Task — ยังต้องทำด้วยมือ

1. **Smoke test ในเบราว์เซอร์จริง** — `npx serve .` แล้วเดินครบ 4 ขั้นตอน 1 เคส ตรวจว่าประเมินผ่าน หน้าสรุปขึ้นปกติ และไม่มี error ใน console (เคสทดสอบยังไม่มี annotation จึงต้อง **ไม่** เห็น section อ้างอิง) — ค้างมาจากรอบก่อน ยังไม่เคยทำ
2. **ตรวจ `/results` doc ล่าสุด** ว่ามี `guidelineRefs: []` และ `groundingVersion: '2026-08-09'` และไม่มีฟิลด์ `rag`
3. **push 20+ commits ที่ค้างอยู่** — ยืนยันกับผู้ใช้ก่อน push (GitHub Actions deploy ทันทีเมื่อ push `main`)

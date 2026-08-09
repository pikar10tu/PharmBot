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
   'collectGuidelineSources', 'buildEvalPrompt', 'buildRubricForCase',
   'scoreRubric'].forEach(n => {
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

// ── collectGuidelineSources ──────────────────────────────

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

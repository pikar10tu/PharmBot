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
    sources: [{ docId: 'ccpe461_uri', title: 'การใช้ยาปฏิชีวนะอย่างสมเหตุผล', page: 12 }],
  });
  assert.ok(line.includes('(ที่มา: การใช้ยาปฏิชีวนะอย่างสมเหตุผล หน้า 12)'));
});

test('หลาย sources -> คั่นด้วย " · " ในบรรทัดเดียว', () => {
  const { renderRubricLine } = loadPrompts();
  const line = renderRubricLine({
    ...BARE_RUBRIC[2],
    rationale: 'เกณฑ์ก',
    sources: [
      { docId: 'ccpe461_uri', title: 'เอกสาร ก', page: 12 },
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
    sources: [{ docId: 'ccpe461_uri', title: 'เอกสาร ก' }],
  });
  assert.ok(line.includes('(ที่มา: เอกสาร ก)'));
});

test('source ที่มี title แต่ไม่มี docId ถูกตัดออกจาก prompt ด้วย (ต้องตรงกับ collectGuidelineSources)', () => {
  const { renderRubricLine } = loadPrompts();
  const line = renderRubricLine({
    ...BARE_RUBRIC[2], rationale: 'เกณฑ์ก',
    sources: [{ title: 'เอกสารไม่มี docId — พิมพ์ผิดตอน annotate' }],
  });
  // ไม่มี docId ที่ตรวจกับ manifest.json ได้ -> ต้องไม่โผล่ใน prompt เหมือนที่ไม่โผล่ในหน้าสรุป
  assert.strictEqual(line.includes('(ที่มา:'), false);
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
  withAnn[2].sources = [{ docId: 'ccpe461_uri', title: 'เอกสาร ก', page: 1 }];
  const items = [
    { id: 'h1', earned: 1 }, { id: 'd1', earned: 0.5 },
    { id: 'r1', earned: 1 }, { id: 'c1', earned: 0 },
  ];
  const a = scoreRubric(makeCase(BARE_RUBRIC), items, 'female');
  const b = scoreRubric(makeCase(withAnn),     items, 'female');
  assert.strictEqual(a.overall, b.overall);
  assert.strictEqual(a.drug_score, b.drug_score);
});

// ── golden fixture: prompt ของเคสที่ยังไม่มี annotation ต้องเหมือนเดิมทุกตัวอักษร ──
// การทดสอบด้านบน (baseline, ไม่มีร่องรอย RAG) เป็น absence-of-substring — พิสูจน์แค่ว่า
// ข้อความบางคำหายไป ไม่พิสูจน์ว่าส่วนที่เหลือของ prompt ไม่เปลี่ยน เทียบทั้งก้อนตรงๆ กับ
// fixture ที่สร้างจาก output จริง (setup/test/fixtures/regenerate-eval-prompt-bare-rubric.js)
// จึงปิดช่องนั้น — แก้ prompt โดยตั้งใจ ให้รันสคริปต์ regenerate แล้วพิจารณา bump GROUNDING_VERSION
test('golden: prompt ของเคสไม่มี annotation ต้องตรงกับ fixture เป๊ะทุกตัวอักษร', () => {
  const { buildEvalPrompt } = loadPrompts();
  const actual = buildEvalPrompt(makeCase(BARE_RUBRIC), ...EVAL_ARGS);

  const fixturePath = path.join(__dirname, 'fixtures', 'eval-prompt-bare-rubric.txt');
  const raw = fs.readFileSync(fixturePath, 'utf8');
  const marker = '=== เนื้อหาด้านล่างบรรทัดนี้คือ output ตรงจาก buildEvalPrompt() ห้ามมีอะไรอยู่หลังบรรทัดนี้ก่อนเนื้อหา ===\n';
  const markerIdx = raw.indexOf(marker);
  assert.ok(markerIdx >= 0, 'fixture ไม่มีเส้นคั่น — โครงไฟล์เปลี่ยนไปหรือไฟล์ถูกแก้มือ');
  const expected = raw.slice(markerIdx + marker.length);

  assert.strictEqual(actual, expected,
    'prompt ของเคสที่ไม่มี annotation เปลี่ยนไปจาก fixture — ถ้าตั้งใจแก้ ให้รัน ' +
    'node setup/test/fixtures/regenerate-eval-prompt-bare-rubric.js แล้วพิจารณา bump GROUNDING_VERSION');
});

test('js/prompts.js ต้องไม่มี require/import (classic script)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'prompts.js'), 'utf8');
  assert.strictEqual(/\brequire\s*\(/.test(src), false, 'พบ require() — เบราว์เซอร์จะพัง');
  assert.strictEqual(/^\s*import\s/m.test(src), false, 'พบ ESM import');
});

// ── collectGuidelineSources ──────────────────────────────

const SRC_A = { docId: 'ccpe461_uri', title: 'เอกสาร ก', page: 12, url: 'https://x/461' };
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
  assert.strictEqual(Array.from(out, s => s.docId).join(','), 'cpg_2565,ccpe461_uri');
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
  assert.strictEqual(out[0].docId, 'ccpe461_uri');
});

test('url ที่ไม่ใช่ http(s) (เช่น javascript:) ถูกตัดออกเหลือ null', () => {
  const { collectGuidelineSources } = loadPrompts();
  const rubric = JSON.parse(JSON.stringify(BARE_RUBRIC));
  rubric[0].sources = [{ docId: 'ccpe461_uri', title: 'เอกสาร ก', url: 'javascript:alert(1)' }];
  const out = collectGuidelineSources(makeCase(rubric));
  assert.strictEqual(out[0].url, null);
});

test('url ที่เป็น http(s) ปกติ ผ่านได้ตามเดิม', () => {
  const { collectGuidelineSources } = loadPrompts();
  const rubric = JSON.parse(JSON.stringify(BARE_RUBRIC));
  rubric[0].sources = [{ docId: 'ccpe461_uri', title: 'เอกสาร ก', url: 'https://ccpe.pharmacycouncil.org/showfile.php?file=461' }];
  const out = collectGuidelineSources(makeCase(rubric));
  assert.strictEqual(out[0].url, 'https://ccpe.pharmacycouncil.org/showfile.php?file=461');
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
  assert.strictEqual(first, 'ccpe461_uri,cpg_2565');  // diagnosis มาก่อน counseling
});

test('ข้อ femaleOnly ถูกข้ามสำหรับคนชาย', () => {
  const { collectGuidelineSources } = loadPrompts();
  const rubric = JSON.parse(JSON.stringify(BARE_RUBRIC));
  const femaleItem = { id: 'h8', domain: 'history', label: 'ถามการตั้งครรภ์', weight: 6, critical: true, active: true, femaleOnly: true, sources: [SRC_A] };
  rubric.push(femaleItem);
  const maleCase = makeCase(rubric);
  maleCase.gender = 'male';
  const out = collectGuidelineSources(maleCase);
  assert.strictEqual(out.length, 0, 'เอกสารจากข้อ femaleOnly ต้องไม่ขึ้นสำหรับคนชาย');
});

test('ข้อ femaleOnly ถูกรวมสำหรับคนหญิง', () => {
  const { collectGuidelineSources } = loadPrompts();
  const rubric = JSON.parse(JSON.stringify(BARE_RUBRIC));
  const femaleItem = { id: 'h8', domain: 'history', label: 'ถามการตั้งครรภ์', weight: 6, critical: true, active: true, femaleOnly: true, sources: [SRC_A] };
  rubric.push(femaleItem);
  const femaleCase = makeCase(rubric);
  femaleCase.gender = 'female';
  const out = collectGuidelineSources(femaleCase);
  assert.strictEqual(out.length, 1, 'เอกสารจากข้อ femaleOnly ต้องขึ้นสำหรับคนหญิง');
  assert.strictEqual(out[0].docId, 'ccpe461_uri');
});

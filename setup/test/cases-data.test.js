// ============================================================
//  cases-data.test.js — ตรวจความครบของ 9 เคสฝึก + กลไกเคสส่งต่อ (referral)
//  รัน: cd setup && npm test
// ============================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { CASES } = require('../cases-data.js');

function loadScript(file, names) {
  const sandbox = { console, Math, JSON, Map, Set, String, Array, Object, Number, Date };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', file), 'utf8'), sandbox);
  return Object.fromEntries(names.map(n => [n, vm.runInContext(n, sandbox)]));
}
const P = loadScript('prompts.js', ['buildEvalPrompt', 'buildCounselingPrompt', 'buildSystemPrompt']);
const { DRUG_SEED } = loadScript('drug-data.js', ['DRUG_SEED']);
const seedDrugsSrc = fs.readFileSync(path.join(__dirname, '..', 'seed-drugs.js'), 'utf8');

test('มี 9 เคสฝึก กลุ่มละ 3 และไม่มีเคสสอบ/BV', () => {
  assert.strictEqual(CASES.length, 9);
  for (const g of ['RESP', 'GU_STI', 'NEURO']) {
    assert.strictEqual(CASES.filter(c => c.groupId === g).length, 3, g);
  }
  const ids = CASES.map(c => c.id).join(' ');
  assert.doesNotMatch(ids, /trich|vaginosis/i);
  assert.strictEqual(new Set(CASES.map(c => c.id)).size, 9, 'id ซ้ำ');
});

test('ยาทุกตัวในเฉลยมีอยู่ทั้งใน js/drug-data.js และ setup/seed-drugs.js', () => {
  const codes = new Set(DRUG_SEED.map(d => d.drugCode));
  for (const c of CASES) {
    const da = c.drugAnswer;
    for (const code of [...da.firstLine, ...da.alternatives, ...da.unacceptable, ...Object.keys(da.regimen)]) {
      assert.ok(codes.has(code), `${c.id}: ${code} ไม่มีใน drug-data.js`);
      assert.ok(seedDrugsSrc.includes(`'${code}'`), `${c.id}: ${code} ไม่มีใน seed-drugs.js`);
    }
  }
});

test('ทุกเคสมี secretInfo ที่ประกอบแล้ว และ occupation ไม่ใช่ random', () => {
  for (const c of CASES) {
    assert.match(c.secretInfo, /\[หมวด 4: ความปลอดภัย/, c.id);
    assert.notStrictEqual(c.occupation, 'random', c.id);
    assert.doesNotThrow(() => P.buildSystemPrompt({ ...c, name: 'ทดสอบ' }, true));
  }
});

test('เคส refer-only: eval prompt บอกว่าไม่จ่ายยาคือคำตอบที่ถูก', () => {
  const stroke = CASES.find(c => c.drugAnswer.referral?.mode === 'refer-only');
  const p = P.buildEvalPrompt({ ...stroke, name: 'ทดสอบ' }, [], [], []);
  assert.match(p, /คำตอบที่ถูกคือ "ไม่จ่ายยา"/);
  assert.match(p, /First-line: ไม่จ่ายยา/);
});

test('เคสไม่มี referral: eval prompt ไม่มีบล็อกส่งต่อ', () => {
  const c = CASES.find(x => !x.drugAnswer.referral);
  assert.doesNotMatch(P.buildEvalPrompt({ ...c, name: 'ทดสอบ' }, [], [], []), /เคสส่งต่อ|ต้องแนะนำส่งต่อแพทย์ก่อน/);
});

test('counseling prompt เมื่อไม่ได้รับยา: ถามว่าต้องทำอะไรต่อ ไม่ถามวิธีกินยา', () => {
  const c = { ...CASES[8], name: 'ทดสอบ' };
  const p = P.buildCounselingPrompt(c, [], true);
  assert.match(p, /ไม่ได้จ่ายยาให้/);
  assert.doesNotMatch(p, /ถ้าเภสัชกรยังไม่ได้บอกวิธีกินยา/);
  const withDrug = P.buildCounselingPrompt(c, [{ name: 'Paracetamol', strength: '500mg' }], true);
  assert.match(withDrug, /ยาที่เพิ่งรับจากเภสัชกร: Paracetamol 500mg/);
});

test('parseEvalJson ทนต่อ ``` และ comma เกิน (เจอจริงจากตัวประเมิน)', () => {
  const { parseEvalJson } = loadScript('prompts.js', ['parseEvalJson']);
  const raw = '```json\n{"items":[{"id":"h1","earned":1},\n  ],\n "summary":"ok",}\n```';
  const j = parseEvalJson(raw);
  assert.strictEqual(j.items.length, 1);
  assert.strictEqual(j.summary, 'ok');
  assert.throws(() => parseEvalJson('ไม่ใช่ JSON'));
});

test('กฎห้ามพูดแบบ AI อยู่ทั้ง prompt ซักประวัติและให้คำแนะนำ', () => {
  const c = { ...CASES[0], name: 'ทดสอบ' };
  for (const p of [P.buildSystemPrompt(c, true),
                   P.buildCounselingPrompt(c, [{ name: 'A', strength: '1' }], true),
                   P.buildCounselingPrompt(c, [], true)]) {
    assert.match(p, /ไม่ใช่ผู้ช่วย AI/);
  }
});

// ============================================================
//  rag-query.test.js — ทดสอบส่วน pure ของ js/rag.js
//  js/rag.js เป็น classic script (global scope) โหลดผ่าน vm เหมือน rag-core
//  รัน: cd setup && npm test
// ============================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadRag() {
  const sandbox = { console, Math, JSON, Map, Set, String, Array, Object, Promise, Date, setTimeout };
  vm.createContext(sandbox);
  const js = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'js', f), 'utf8');
  vm.runInContext(js('rag-core.js'), sandbox);
  vm.runInContext(js('rag.js'), sandbox);
  // `const RAG` เป็น lexical binding ไม่ผูกกับ globalThis ของ sandbox
  // (ในเบราว์เซอร์จริง สคริปต์อื่นเรียก RAG ได้ตามปกติ) จึงต้องดึงผ่าน context
  sandbox.RAG = vm.runInContext('RAG', sandbox);
  sandbox.RAGCore = vm.runInContext('RAGCore', sandbox);
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
    assert.ok(/[฀-๿]/.test(q), `ต้องมีภาษาไทย: ${q}`);
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
  qs.forEach(q => {
    assert.strictEqual(typeof q, 'string');
    assert.ok(q.trim().length > 5, `query ว่างเกินไป: "${q}"`);
  });
});

test('buildQueries ทนต่อ argument ที่ไม่ได้ส่งมาเลย', () => {
  const { RAG } = loadRag();
  assert.strictEqual(RAG.buildQueries().length, 3);
});

test('formatCitations ใส่ tag G1..Gn ตามลำดับ', () => {
  const { RAG } = loadRag();
  const cites = RAG.formatCitations([
    { docId: 'ccpe461_uri', page: 3, summaryTh: 'ก' },
    { docId: 'ar_th_2565', page: 9, summaryTh: 'ข' },
  ]);
  // array ที่คืนจาก vm context เป็นคนละ realm — deepStrictEqual จะเทียบ prototype ไม่ผ่าน
  assert.strictEqual(Array.from(cites, c => c.tag).join(','), 'G1,G2');
  assert.strictEqual(cites[0].page, 3);
  assert.strictEqual(cites[0].docId, 'ccpe461_uri');
});

test('formatCitations รับ list ว่างได้', () => {
  const { RAG } = loadRag();
  assert.strictEqual(RAG.formatCitations([]).length, 0);
  assert.strictEqual(RAG.formatCitations().length, 0);
});

test('js/rag.js ต้องไม่มี require/import (classic script)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'rag.js'), 'utf8');
  assert.strictEqual(/\brequire\s*\(/.test(src), false, 'พบ require() — เบราว์เซอร์จะพัง');
  assert.strictEqual(/^\s*import\s/m.test(src), false, 'พบ ESM import');
});

// ============================================================
//  letters.test.js
//  pop-up จดหมายเด้งใส่ผู้เรียนกลางการฝึก ถ้าเงื่อนไขผิดจะรบกวนทั้งรุ่น
//  และข้อ "เลยวันหมดอายุ" คือข้อที่กันไม่ให้ประกาศเก่าเด้งในเดือนท้าย ๆ
// ============================================================

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'letters.js'), 'utf8');
const { LETTERS, pickPopupLetter, countUnread } =
  new Function(`${SRC}; return { LETTERS, pickPopupLetter, countUnread };`)();

const L = [
  { id: 'a', subject: 'ก', date: '2026-09-03', popupUntil: '2026-09-14', body: '' },
  { id: 'b', subject: 'ข', date: '2026-08-01', popupUntil: null,         body: '' },
];

test('ยังไม่อ่าน และยังไม่เลยวันหมดอายุ → เด้ง', () => {
  assert.strictEqual(pickPopupLetter(L, [], '2026-09-06').id, 'a');
});

test('วันสุดท้ายพอดี ยังต้องเด้ง', () => {
  assert.strictEqual(pickPopupLetter(L, [], '2026-09-14').id, 'a');
});

test('อ่านแล้ว → ไม่เด้ง', () => {
  assert.strictEqual(pickPopupLetter(L, ['a'], '2026-09-06'), null);
});

test('เลยวันหมดอายุแล้ว → ไม่เด้ง แม้จะยังไม่เคยอ่าน', () => {
  // เงื่อนไขหลักของฟีเจอร์: คนที่ไม่ได้เข้าช่วงประกาศ ต้องไม่โดนเด้งย้อนหลัง
  assert.strictEqual(pickPopupLetter(L, [], '2026-09-15'), null);
});

test('popupUntil เป็น null → ขึ้นแค่ในกล่อง ไม่เด้ง', () => {
  assert.strictEqual(pickPopupLetter([L[1]], [], '2026-08-01'), null);
});

test('countUnread ไม่สนวันหมดอายุ — จดหมายเก่าที่ยังไม่เปิดก็ยังนับ', () => {
  assert.strictEqual(countUnread(L, []),    2);
  assert.strictEqual(countUnread(L, ['a']), 1);
  assert.strictEqual(countUnread(L, ['a', 'b']), 0);
});

test('อ่าน id ที่ไม่มีอยู่จริงแล้ว ไม่ทำให้ยอดติดลบ', () => {
  assert.strictEqual(countUnread(L, ['zzz']), 2);
});

test('LETTERS ที่ปล่อยจริงต้องมี id ไม่ซ้ำ — id ซ้ำ = ทำเครื่องหมายอ่านผิดฉบับ', () => {
  const ids = LETTERS.map(l => l.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

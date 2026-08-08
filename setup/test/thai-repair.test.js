// ============================================================
//  thai-repair.test.js
//  fixture ทั้งหมดเป็น output จริงจาก pypdf ที่วัดไว้ 2026-08-09
//  รัน: cd setup && node --test test/thai-repair.test.js
// ============================================================

const test = require('node:test');
const assert = require('node:assert');
const { repairThai } = require('../lib/thai-repair');

test('ยุบ combining mark ที่ซ้ำติดกัน (ของจริงจาก CPG ไมเกรน 2565)', () => {
  assert.strictEqual(
    repairThai('แนวทางเวชปฏิิบััติิการวินิจฉััย'),
    'แนวทางเวชปฏิบัติการวินิจฉัย'
  );
  assert.strictEqual(repairThai('ฉับัับัสมบัูรณ์์'), 'ฉับับัสมบัูรณ์');
});

test('ซ่อม ำ ที่แตกเป็นพยัญชนะ + ช่องว่าง + า (ของจริงจาก AR.pdf)', () => {
  assert.strictEqual(
    repairThai('แนวทางเวชปฏิบัติส าหรับโรคจมูก'),
    'แนวทางเวชปฏิบัติสำหรับโรคจมูก'
  );
  assert.strictEqual(repairThai('สาเหตุส าคัญ'), 'สาเหตุสำคัญ');
  assert.strictEqual(repairThai('จ านวนหน่วยกิต'), 'จำนวนหน่วยกิต');
});

// ⚠️ test นี้จับบั๊กที่เคยเขียนพลาดมาแล้ว — ห้ามลบ
// negative lookahead ที่กว้างเป็น [ะ-๎] (0E30-0E4E) จะครอบสระนำ เ แ โ ใ ไ
// ทำให้ "ค าแนะนำ" ไม่ถูกซ่อมเพราะหลัง า เป็น แ (พลาดไปครึ่งหนึ่งของเคสจริง)
test('ซ่อมได้แม้ตัวถัดไปเป็นสระนำ เ แ โ ใ ไ', () => {
  assert.strictEqual(repairThai('ให้ค าแนะน าผู้ป่วย'), 'ให้คำแนะนำผู้ป่วย');
  assert.strictEqual(repairThai('จ าเป็นต้อง'), 'จำเป็นต้อง');
  assert.strictEqual(repairThai('พิจารณาท าเป็นรายๆ'), 'พิจารณาทำเป็นรายๆ');
});

test('ซ่อม ำ ที่กลายเป็น U+FFFD และทิ้ง U+FFFD ที่เหลือ', () => {
  assert.strictEqual(repairThai('ที่จ�าเป็น'), 'ที่จำเป็น');
  assert.strictEqual(repairThai('ข้อความ�ปกติ'), 'ข้อความปกติ');
});

test('รับช่องว่างชนิดอื่นที่ PDF แทรก (non-breaking space)', () => {
  assert.strictEqual(repairThai('ส าหรับ'), 'สำหรับ');
  assert.strictEqual(repairThai('ส​าหรับ'), 'สำหรับ');
});

test('ซ่อม ำ ที่ถูกช่องว่างแยกจากพยัญชนะ (ของจริงจาก RDU/AR)', () => {
  assert.strictEqual(repairThai('ค ำน ำ'), 'คำนำ');
  assert.strictEqual(repairThai('ท ำให้'), 'ทำให้');
});

test('ไม่แตะข้อความที่ถูกต้องอยู่แล้ว', () => {
  const clean = 'การจัดการและดูแลรักษาภาวะ community-acquired urinary tract infection';
  assert.strictEqual(repairThai(clean), clean);
  // ไม้หันอากาศ + วรรณยุกต์ต่างตัวติดกันเป็นเรื่องปกติ ห้ามยุบ
  assert.strictEqual(repairThai('ตั้งครรภ์'), 'ตั้งครรภ์');
  assert.strictEqual(repairThai('ผู้ป่วยที่มีอาการ'), 'ผู้ป่วยที่มีอาการ');
});

test('ไม่ยุ่งกับ า ที่ตามหลังเลขหรืออักษรละติน', () => {
  assert.strictEqual(repairThai('WHO า'), 'WHO า');
  assert.strictEqual(repairThai('5 าา'), '5 าา');
});

test('ไม่ยุบ า ที่เป็นของจริงตามด้วย mark', () => {
  // "มา" + วรรณยุกต์ ไม่ใช่กรณี ำ แตก
  assert.strictEqual(repairThai('ค า้'), 'ค า้');
});

test('รับ input ว่าง/null ได้', () => {
  assert.strictEqual(repairThai(''), '');
  assert.strictEqual(repairThai(null), '');
  assert.strictEqual(repairThai(undefined), '');
});

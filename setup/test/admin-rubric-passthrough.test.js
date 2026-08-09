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

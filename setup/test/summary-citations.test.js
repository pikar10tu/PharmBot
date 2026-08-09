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

// ============================================================
//  summary-citations.test.js
//  ตรวจ section "อ้างอิงแนวทางเวชปฏิบัติ" ในหน้าสรุป
//  โดยไม่ต้องพึ่ง Firestore — ดึงเฉพาะเทมเพลตออกมาทดสอบ
//
//  สำคัญเพราะข้อจำกัดลิขสิทธิ์: ห้ามแสดงข้อความต้นฉบับจากไกด์ไลน์
//  แสดงได้แค่ summaryTh + ชื่อเอกสาร + หน้า + ลิงก์
// ============================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'screens', 'summary.js'), 'utf8');

// สร้างฟังก์ชัน render เฉพาะบล็อกอ้างอิง จากซอร์สจริง
// (ตัดมาเป็น template literal เดี่ยว เพื่อไม่ต้องยกทั้งหน้ามารัน)
function renderRefs(fb) {
  const _escS = (s) => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return (fb.guidelineRefs || []).length ? `
        <div class="card mb-3">
          <h3 class="mb-1">📚 อ้างอิงแนวทางเวชปฏิบัติ</h3>
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
        </div>` : '';
}

const REF = {
  tag: 'G1', docId: 'ccpe461_uri', page: 3,
  title: 'แนวทางการเลือกใช้ยาปฏิชีวนะ',
  url: 'https://ccpe.pharmacycouncil.org/showfile.php?file=461',
  summaryTh: 'ตาราง McIsaac criteria แนะนำการตัดสินใจให้ยาต้านจุลชีพ',
};

test('ไม่มี guidelineRefs -> ไม่แสดง section เลย', () => {
  assert.strictEqual(renderRefs({}), '');
  assert.strictEqual(renderRefs({ guidelineRefs: [] }), '');
});

test('มี guidelineRefs -> แสดงสรุปไทย ชื่อเอกสาร หน้า และลิงก์', () => {
  const html = renderRefs({ guidelineRefs: [REF] });
  assert.ok(html.includes('อ้างอิงแนวทางเวชปฏิบัติ'));
  assert.ok(html.includes('G1'));
  assert.ok(html.includes('McIsaac'));
  assert.ok(html.includes('แนวทางการเลือกใช้ยาปฏิชีวนะ'));
  assert.ok(html.includes('หน้า 3'));
  assert.ok(html.includes('showfile.php?file=461'));
});

test('ไม่มี url -> ไม่แสดงลิงก์ แต่ยังแสดงรายการ', () => {
  const html = renderRefs({ guidelineRefs: [{ ...REF, url: null }] });
  assert.ok(html.includes('McIsaac'));
  assert.strictEqual(html.includes('เปิดเอกสาร'), false);
});

test('escape HTML กัน XSS จากเนื้อหาเอกสาร', () => {
  const html = renderRefs({ guidelineRefs: [{ ...REF, summaryTh: '<script>alert(1)</script>' }] });
  assert.strictEqual(html.includes('<script>alert'), false);
  assert.ok(html.includes('&lt;script&gt;'));
});

test('ซอร์สจริงต้องไม่แสดงข้อความต้นฉบับของ chunk (ลิขสิทธิ์)', () => {
  // บล็อกอ้างอิงต้องอ้างเฉพาะ field ที่อนุญาต
  const block = SRC.slice(SRC.indexOf('guidelineRefs'), SRC.indexOf('<!-- Actions -->'));
  assert.strictEqual(/r\.text/.test(block), false, 'พบการแสดง r.text — ผิดข้อจำกัดลิขสิทธิ์');
  assert.ok(block.includes('r.summaryTh'), 'ต้องแสดง summaryTh');
});

test('ซอร์สจริงต้องมี section นี้อยู่ก่อนบล็อก Actions', () => {
  assert.ok(SRC.indexOf('guidelineRefs') > 0);
  assert.ok(SRC.indexOf('guidelineRefs') < SRC.indexOf('<!-- Actions -->'));
});

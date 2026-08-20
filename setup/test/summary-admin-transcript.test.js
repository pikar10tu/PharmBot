// ============================================================
//  summary-admin-transcript.test.js
//  บล็อก transcript ต้องโผล่เฉพาะ admin
//  firestore.rules ยอมให้นักศึกษาอ่าน session ของตัวเองได้
//  ถ้าเรนเดอร์ให้ทุกคน = ข้อมูลรั่วทันที
// ============================================================

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'screens', 'summary.js'), 'utf8');

function load({ admin }) {
  const sandbox = {
    isAdmin:       () => admin,
    escapeHtmlBr:  (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    escapeHtml:    (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'),
  };
  const keys = Object.keys(sandbox);
  const fn = new Function(...keys,
    `${SRC}; return { _adminTranscriptBlock };`);
  return fn(...keys.map(k => sandbox[k]));
}

const SESSION = {
  chatHistory: [
    { role: 'user',  text: 'เจ็บคอมากี่วันแล้วครับ', via: 'live' },
    { role: 'model', text: 'สามวันค่ะ' },
    { role: 'model', text: 'แล้วก็มีไข้', via: 'live', interrupted: true },
    { role: 'user', text: 'คุณมีอาการอื่นไหม', via: 'live' },
  ],
  counselingHistory: [{ role: 'user', text: 'กินหลังอาหาร', via: 'webspeech' }],
  dispensedDrugs: [{ name: 'Amoxicillin', strength: '500mg', form: 'capsule' }],
  degraded: { level: 'L2', reason: 'mic-denied' },
};

test('นักศึกษาต้องไม่เห็นบล็อก transcript', () => {
  const { _adminTranscriptBlock } = load({ admin: false });
  assert.strictEqual(_adminTranscriptBlock(SESSION), '');
});

test('admin เห็นบทสนทนาทั้งสองขั้นตอน', () => {
  const { _adminTranscriptBlock } = load({ admin: true });
  const html = _adminTranscriptBlock(SESSION);
  assert.ok(html.includes('เจ็บคอมากี่วันแล้วครับ'), 'ต้องมีเทิร์น Step 1');
  assert.ok(html.includes('กินหลังอาหาร'),          'ต้องมีเทิร์น Step 3');
  assert.ok(html.includes('Amoxicillin'),           'ต้องมียาที่จ่าย');
});

test('สรุปจำนวนเทิร์นแยกตาม via', () => {
  const { _adminTranscriptBlock } = load({ admin: true });
  const html = _adminTranscriptBlock(SESSION);
  assert.ok(/live\s*2/.test(html),      'live ต้องนับได้ 2');
  assert.ok(/webspeech\s*1/.test(html), 'webspeech ต้องนับได้ 1');
});

test('แสดงแถบเตือนเมื่อเซสชันถูกลดระดับ', () => {
  const { _adminTranscriptBlock } = load({ admin: true });
  assert.ok(_adminTranscriptBlock(SESSION).includes('mic-denied'));
});

test('ไม่มี session ให้เรนเดอร์ = คืนค่าว่าง ไม่ throw', () => {
  const { _adminTranscriptBlock } = load({ admin: true });
  assert.strictEqual(_adminTranscriptBlock(null), '');
});

test('escape ข้อความจากผู้ใช้', () => {
  const { _adminTranscriptBlock } = load({ admin: true });
  const html = _adminTranscriptBlock({ chatHistory: [{ role: 'user', text: '<img src=x>' }] });
  assert.ok(!html.includes('<img src=x>'), 'ต้องไม่ปล่อย tag ดิบออกไป');
});

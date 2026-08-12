// ============================================================
//  chat-notify.test.js
//  พอซ่อนฟองแชท ข้อความ system ที่ยิงผ่าน _addMsg จะมองไม่เห็น
//  ทุกจุดที่แจ้งผู้ใช้ต้องผ่าน _notify() ซึ่งเขียนลงช่องแจ้งเตือนด้วย
// ============================================================

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'screens', 'chat.js'), 'utf8');

// เทสต์เดียวที่คุ้มค่าจะจับ source: มันกันบั๊กที่ Playwright มองไม่เห็น
// (ข้อความแจ้งเตือนที่ยิงลงฟองแชทที่ถูกซ่อน = ผู้เรียนไม่รู้ว่าระบบล่ม)
// พฤติกรรมอื่นของ _notify ถูกตรวจใน tests/specs/04-voice-ui.spec.js แทน
test('ข้อความแจ้งว่าเสียงใช้ไม่ได้ต้องไม่ยิงลงฟองแชทตรงๆ', () => {
  const rawFailureNotices = SRC.match(
    /_addMsg\([^)]*'system'[^)]*(Live API|ไม่รองรับการรู้จำเสียง|ไม่สามารถเริ่มรับเสียง)/g);
  assert.strictEqual(rawFailureNotices, null,
    'ต้องยิงผ่าน _notify ไม่ใช่ _addMsg ตรงๆ ไม่งั้นข้อความจะมองไม่เห็นเมื่อฟองแชทถูกซ่อน');
});

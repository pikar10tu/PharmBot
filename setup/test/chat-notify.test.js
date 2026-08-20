// ============================================================
//  chat-notify.test.js
//  พอซ่อนฟองแชท ข้อความ system ที่ยิงผ่าน _addMsg จะมองไม่เห็น
//  ทุกจุดที่แจ้งผู้ใช้เรื่องความล้มเหลว/สิ่งที่ต้องทำ ต้องผ่าน _notify() ซึ่งเขียนลง
//  ช่องแจ้งเตือนถาวร (#voice-notice-N) ด้วย ไม่ใช่แค่ฟองแชทที่ VOICE_ONLY ซ่อนไว้
// ============================================================

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'screens', 'chat.js'), 'utf8');

// เทสต์นี้คุ้มค่าจะจับ source: มันกันบั๊กที่ Playwright มองไม่เห็น
// (ข้อความแจ้งเตือนที่ยิงลงฟองแชทที่ถูกซ่อน = ผู้เรียนไม่รู้ว่าระบบล่มหรือต้องทำอะไร)
// พฤติกรรมอื่นของ _notify ถูกตรวจใน tests/specs/04-voice-ui.spec.js แทน
//
// นี่คือ invariant จริง ไม่ใช่รายการเลขบรรทัดที่เคย audit ผ่าน — ทุกจุดที่เรียก
// _addMsg(container, 'system', ...) ตรงๆ (ไม่ผ่าน _notify) ต้องมีคอมเมนต์กำกับ
// "NOTIFY-EXEMPT" อยู่บนบรรทัดเดียวกันหรือใน 5 บรรทัดก่อนหน้า พร้อมเหตุผลว่าทำไมจุดนี้
// ไม่ต้องแจ้งผ่านช่องแจ้งเตือนถาวร (เช่น เป็นข้อความข้อมูล ไม่ใช่ failure/required-action
// หรือ unreachable ภายใต้ VOICE_ONLY) — ถ้าใครเพิ่มจุดแจ้งเตือนใหม่โดยไม่ผ่าน _notify()
// และไม่ใส่คอมเมนต์ยกเว้นไว้ เทสต์นี้ต้อง fail ทันที ไม่ใช่รอ audit รอบหน้ามาเจอ
test('_addMsg(..., \'system\', ...) ตรงๆ ทุกจุดต้องผ่าน _notify() หรือมีคอมเมนต์ NOTIFY-EXEMPT กำกับเหตุผล', () => {
  const lines = SRC.split('\n');
  const callRe = /_addMsg\([^)]*'system'[^)]*\)/;

  const unexempted = [];
  lines.forEach((line, i) => {
    if (!callRe.test(line)) return;
    // มองย้อนหลังสูงสุด 5 บรรทัด (รวมบรรทัดตัวเอง) หาคอมเมนต์ NOTIFY-EXEMPT กำกับ
    const windowStart = Math.max(0, i - 5);
    const window = lines.slice(windowStart, i + 1).join('\n');
    if (!/NOTIFY-EXEMPT/.test(window)) {
      unexempted.push(`บรรทัด ${i + 1}: ${line.trim()}`);
    }
  });

  assert.deepStrictEqual(unexempted, [],
    'พบ _addMsg(..., \'system\', ...) ที่ยิงตรงไม่ผ่าน _notify() และไม่มีคอมเมนต์ NOTIFY-EXEMPT กำกับเหตุผล — ' +
    'ถ้าเป็นข้อความแจ้ง failure/required-action ต้องเปลี่ยนไปเรียก _notify(panelStep, msg) แทน ' +
    'ถ้าตั้งใจให้เป็นข้อยกเว้นจริงๆ (เช่น ข้อความข้อมูลล้วนๆ หรือ unreachable ภายใต้ VOICE_ONLY) ' +
    'ให้ใส่คอมเมนต์ "NOTIFY-EXEMPT: <เหตุผล>" กำกับไว้ด้วย\n' + unexempted.join('\n'));
});

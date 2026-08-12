// ============================================================
//  04-voice-ui.spec.js
//  โหมดเสียงล้วน — ผู้เรียนต้องไม่เห็นฟองแชท/ช่องพิมพ์
//  และโหมดฉุกเฉินต้องเรียกกลับมาได้จริง (ไม่ใช้ไมโครโฟนจริง)
// ============================================================

const { test, expect } = require('@playwright/test');
const { loginAs } = require('../helpers/auth');

const STUDENT_ID = process.env.STUDENT_ID;
const STUDENT_PW = process.env.STUDENT_PASSWORD;

test.beforeEach(async ({ page }) => {
  await loginAs(page, STUDENT_ID, STUDENT_PW);
  await page.goto('/#groups');
  // .group-card / .case-card ไม่มีจริงใน DOM — groups.js เรนเดอร์
  // <div class="card" id="pick-all"> (สุ่มทุกระบบ) และคลิกแล้วสุ่มเคส + Router.go('chat')
  // ทันที ไม่ผ่านหน้าเลือกเคสแยกต่างหาก (ดู js/screens/groups.js:68)
  await page.locator('#pick-all').click();
  await expect(page.locator('#panel-1')).toBeVisible();
});

test('ไม่มีแท็บสลับโหมดให้กด', async ({ page }) => {
  await expect(page.locator('.mode-switcher')).toHaveCount(0);
  await expect(page.locator('#tab-text-1')).toHaveCount(0);
});

test('ฟองแชทถูกซ่อนแต่ DOM ยังอยู่', async ({ page }) => {
  await expect(page.locator('#chat-messages')).toHaveCount(1);
  await expect(page.locator('#panel-1 .transcript-wrap')).toBeHidden();
});

test('ช่องพิมพ์ถูกซ่อน', async ({ page }) => {
  await expect(page.locator('#text-input-row-1')).toBeHidden();
});

test('เวทีเสียง ซับไตเติล และช่องแจ้งเตือนยังอยู่', async ({ page }) => {
  await expect(page.locator('#voice-input-row-1')).toBeVisible();
  await expect(page.locator('#voice-subtitle-1')).toHaveCount(1);
  await expect(page.locator('#voice-notice-1')).toHaveCount(1);
});

test('สลับเป็นโหมดพิมพ์ด้วยมือไม่ได้', async ({ page }) => {
  await page.evaluate(() => _switchMode(1, 'text'));
  await expect(page.locator('#text-input-row-1')).toBeHidden();
});

test('โหมดฉุกเฉินเปิดฟองแชท ช่องพิมพ์ และข้อความแจ้ง', async ({ page }) => {
  await page.evaluate(() => _revealEmergencyText(1, 'mic-denied'));
  await expect(page.locator('#panel-1 .transcript-wrap')).toBeVisible();
  await expect(page.locator('#text-input-row-1')).toBeVisible();
  await expect(page.locator('#voice-notice-1')).toContainText('พิมพ์คุยกับผู้ป่วย');
});

test('เปิดโหมดฉุกเฉินซ้ำแล้วไม่พัง', async ({ page }) => {
  await page.evaluate(() => {
    _revealEmergencyText(1, 'mic-denied');
    _revealEmergencyText(1, 'no-speech-api');
  });
  await expect(page.locator('#text-input-row-1')).toBeVisible();
});

// เส้นทางอัตโนมัติ: _startVoiceWebSpeech เรียก _revealEmergencyText เอง (ไม่ใช่ _switchMode)
// เมื่อเบราว์เซอร์ไม่มี SpeechRecognition เลย — ก่อนหน้านี้ยิง _switchMode(panelStep,'text')
// ซึ่งโดน guard ของ VOICE_ONLY บล็อกจนช่องพิมพ์ไม่มีวันโผล่มา (dead end)
test('เบราว์เซอร์ไม่รองรับเสียง → เส้นทางอัตโนมัติเปิดช่องพิมพ์ฉุกเฉินได้เอง', async ({ page }) => {
  await page.evaluate(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    _startVoiceWebSpeech(1);
  });
  await expect(page.locator('#text-input-row-1')).toBeVisible();
});

// Regression: _revealEmergencyText เดิม idempotent ต่อ "เซสชัน" ทั้งเซสชัน (_emergencyText)
// ไม่ใช่ต่อพาเนล — พาเนล 1 เปิดโหมดฉุกเฉินไปแล้ว พาเนล 3 (Step 3) จะไม่มีวันถูกเปิดตาม
// เพราะ guard เจอ _emergencyText เป็น true อยู่ก่อนแล้วแล้ว return ทันที ทำให้เสียงค้างที่
// "กำลังเชื่อมต่อ…" ไปตลอด ผู้เรียนจบเคสไม่ได้ (ดู task-5-report.md รอบแก้ที่ 1)
//
// #panel-3 ทั้งพาเนลยังถูกซ่อนด้วยคลาส "hidden" ของ step ที่ยังไม่ถึง (student อยู่ Step 1)
// toBeVisible() จึงเป็น false เสมอไม่ว่า _revealEmergencyText(3, …) จะทำงานจริงหรือไม่
// ต้องเช็ค class ของ element เองแทนตามที่ reviewer ระบุ
test('พาเนล 1 เปิดโหมดฉุกเฉินแล้ว พาเนล 3 ต้องเปิดตามได้เองด้วย ไม่ใช่ dead end', async ({ page }) => {
  await page.evaluate(() => {
    _revealEmergencyText(1, 'mic-denied');
    _revealEmergencyText(3, 'mic-denied');
  });
  const hidden = await page.locator('#text-input-row-3')
    .evaluate(el => el.classList.contains('hidden'));
  expect(hidden).toBe(false);
});

// เมื่อเซสชันลง L2 ไปแล้ว (ไม่ว่าจากพาเนลไหน) _startVoice ของพาเนลถัดไปต้องไม่ retry
// Live API / Web Speech ซ้ำเลย — ทั้งเพื่อไม่ให้ค้าง (ถ้าล้มซ้ำ) และเพื่อไม่ให้ฟื้นเสียงกลับมา
// โดยไม่ตั้งใจ (ถ้าสาเหตุเดิมใช้ไม่ได้กับพาเนลนี้) ซึ่งขัดกติกา "ลงได้อย่างเดียว ไม่ขึ้น"
test('_startVoice บนพาเนลใหม่หลังลง L2 แล้ว ต้องเข้าทางโหมดฉุกเฉินทันที ไม่ลองต่อ Live/Web Speech', async ({ page }) => {
  await page.evaluate(async () => {
    _revealEmergencyText(1, 'mic-denied');   // จำลองพาเนล 1 ลงถึง L2 ไปแล้วในเซสชันนี้
    await _startVoice(3);
  });
  const hidden = await page.locator('#text-input-row-3')
    .evaluate(el => el.classList.contains('hidden'));
  expect(hidden).toBe(false);
  // _liveConnecting ต้องยังเป็น false เพราะ _startVoice ต้อง return ก่อนถึงส่วนที่เรียก
  // Live API เลย — ถ้าพังกลับไปเป็นบั๊กเดิม ตัวแปรนี้จะเป็น true ระหว่างพยายามเชื่อมต่อ
  const liveConnecting = await page.evaluate(() => _liveConnecting);
  expect(liveConnecting).toBe(false);
});

// ============================================================
//  04-voice-ui.spec.js
//  ทดสอบ voice UI elements — ไม่ใช้ microphone จริง
//  Mock SpeechRecognition + speechSynthesis ไว้ใน initScript
// ============================================================

const { test, expect } = require('@playwright/test');
const { loginAs } = require('../helpers/auth');

const ADMIN_ID = process.env.ADMIN_ID;
const ADMIN_PW = process.env.ADMIN_PASSWORD;

// ── Mock browser speech APIs ──────────────────────────────────
// เพิ่มก่อน page load เพื่อให้ JS ของแอปเห็น mock แทน API จริง
const SPEECH_MOCK = `
  // Mock SpeechRecognition
  class MockSpeechRecognition extends EventTarget {
    constructor() {
      super();
      this.lang = 'th-TH';
      this.continuous = false;
      this.interimResults = false;
      this.maxAlternatives = 1;
      this._started = false;
    }
    start()  { this._started = true;  this.dispatchEvent(new Event('start')); }
    stop()   { this._started = false; this.dispatchEvent(new Event('end'));   }
    abort()  { this._started = false; this.dispatchEvent(new Event('end'));   }
  }
  window.SpeechRecognition       = MockSpeechRecognition;
  window.webkitSpeechRecognition = MockSpeechRecognition;

  // Mock speechSynthesis
  window.speechSynthesis = {
    speak:  () => {},
    cancel: () => {},
    pause:  () => {},
    resume: () => {},
    getVoices: () => [],
    speaking: false,
    pending:  false,
    paused:   false,
  };
  window.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.pitch = 1; }
  };

  // Mock AudioContext (ป้องกัน error จาก geminiTTS ถ้าถูกเรียก)
  window.AudioContext = window.AudioContext || class {
    constructor() { this.state = 'running'; this.destination = {}; }
    createBuffer() { return { copyToChannel: () => {} }; }
    createBufferSource() { return { buffer: null, connect: () => {}, start: () => {}, onended: null }; }
    close() {}
  };
`;

// Helper: login → navigate to chat
async function goToChat(page) {
  await loginAs(page, ADMIN_ID, ADMIN_PW);
  await page.click('#btn-start');
  await page.waitForSelector('.group-card[data-group="INF_URI"]');
  await page.click('.group-card[data-group="INF_URI"]');
  await page.waitForSelector('.case-card', { timeout: 15_000 });
  await page.locator('.case-card').first().click();
  await expect(page.locator('#panel-1')).toBeVisible({ timeout: 30_000 });
  // รอ AI message แรก
  await page.waitForSelector('.msg', { timeout: 30_000 });
}

// ── Tests ─────────────────────────────────────────────────────

test.describe('Voice UI — Step 1 (ซักประวัติ)', () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(SPEECH_MOCK);
  });

  test('voice/text tab มีครบทั้งคู่ใน panel-1', async ({ page }) => {
    await goToChat(page);
    await expect(page.locator('#tab-text-1')).toBeVisible();
    await expect(page.locator('#tab-voice-1')).toBeVisible();
    await expect(page.locator('#tab-text-1')).toHaveClass(/active/);
  });

  test('สวิตช์ไป voice mode → text input ซ่อน, voice status โชว์', async ({ page }) => {
    await goToChat(page);
    await page.click('#tab-voice-1');
    // text input row ต้องซ่อน
    await expect(page.locator('#text-input-row-1')).toHaveClass(/hidden/);
    // voice status row ต้องโชว์
    await expect(page.locator('#voice-input-row-1')).not.toHaveClass(/hidden/);
    // waveform visible
    await expect(page.locator('#waveform-1')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/voice-mode-step1.png', fullPage: true });
  });

  test('สวิตช์กลับ text mode → text input กลับมา', async ({ page }) => {
    await goToChat(page);
    await page.click('#tab-voice-1');
    await page.click('#tab-text-1');
    await expect(page.locator('#text-input-row-1')).not.toHaveClass(/hidden/);
    await expect(page.locator('#voice-input-row-1')).toHaveClass(/hidden/);
  });

  test('voice tab active class เปลี่ยนถูกต้องเมื่อ toggle', async ({ page }) => {
    await goToChat(page);
    // เริ่มต้น text active
    await expect(page.locator('#tab-text-1')).toHaveClass(/active/);
    await expect(page.locator('#tab-voice-1')).not.toHaveClass(/active/);
    // switch voice
    await page.click('#tab-voice-1');
    await expect(page.locator('#tab-voice-1')).toHaveClass(/active/);
    await expect(page.locator('#tab-text-1')).not.toHaveClass(/active/);
  });

  test('TTS toggle checkbox มีอยู่และ toggle ได้', async ({ page }) => {
    await goToChat(page);
    const toggle = page.locator('#tts-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
  });

  test('TTS label ซ่อนเมื่อเข้า voice mode', async ({ page }) => {
    await goToChat(page);
    await expect(page.locator('#tts-label')).toBeVisible();
    await page.click('#tab-voice-1');
    // tts-label ถูก set visibility:hidden (ไม่ใช่ display:none)
    const visibility = await page.locator('#tts-label').evaluate(el => getComputedStyle(el).visibility);
    expect(visibility).toBe('hidden');
  });

  test('push-to-talk mic button มีและ clickable (text mode)', async ({ page }) => {
    await goToChat(page);
    const mic = page.locator('#mic-btn');
    await expect(mic).toBeVisible();
    await expect(mic).toBeEnabled();
    // Click ได้โดยไม่ error (mock SpeechRecognition รับได้)
    await mic.click();
    await expect(mic).toHaveClass(/listening/);
    // click อีกครั้งเพื่อ stop
    await mic.click();
    await expect(mic).not.toHaveClass(/listening/);
  });

  test('voice status text อัปเดตเมื่อเข้า voice mode', async ({ page }) => {
    await goToChat(page);
    await page.click('#tab-voice-1');
    const statusEl = page.locator('#voice-status-1');
    await expect(statusEl).toBeVisible();
    const text = await statusEl.textContent();
    // ต้องมีข้อความสถานะอะไรก็ได้ (ไม่ว่าง)
    expect(text?.trim().length).toBeGreaterThan(0);
  });

});

test.describe('Voice UI — Step 3 (ให้คำแนะนำ)', () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(SPEECH_MOCK);
  });

  // Helper: ไปถึง step 3 โดยผ่าน step 1 และ 2
  async function goToStep3(page) {
    await goToChat(page);
    // ข้าม step 1 → step 2
    await page.click('#done-history-btn');
    await expect(page.locator('#panel-2')).not.toHaveClass(/hidden/, { timeout: 5_000 });
    // mock confirm() → true เพื่อข้ามผ่าน drug validation dialog
    await page.evaluate(() => { window.confirm = () => true; });
    // step 2 → step 3
    await page.click('#confirm-drugs-btn');
    await expect(page.locator('#panel-3')).not.toHaveClass(/hidden/, { timeout: 15_000 });
  }

  test('panel-3 มี voice/text tab ครบ', async ({ page }) => {
    await goToStep3(page);
    await expect(page.locator('#tab-text-3')).toBeVisible();
    await expect(page.locator('#tab-voice-3')).toBeVisible();
  });

  test('สวิตช์ voice mode ใน step 3 → voice status โชว์', async ({ page }) => {
    await goToStep3(page);
    await page.click('#tab-voice-3');
    await expect(page.locator('#voice-input-row-3')).not.toHaveClass(/hidden/);
    await expect(page.locator('#waveform-3')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/voice-mode-step3.png', fullPage: true });
  });

  test('mic-btn-3 exists และ clickable ใน text mode', async ({ page }) => {
    await goToStep3(page);
    await expect(page.locator('#mic-btn-3')).toBeVisible();
    await page.locator('#mic-btn-3').click();
    await expect(page.locator('#mic-btn-3')).toHaveClass(/listening/);
  });

});

test.describe('Voice — Edge Cases', () => {

  test('เบราว์เซอร์ไม่รองรับ SpeechRecognition → แสดง error message', async ({ page }) => {
    // ไม่ inject mock → SpeechRecognition จะไม่มีใน headless chromium
    await page.addInitScript(`
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;
    `);
    await loginAs(page, ADMIN_ID, ADMIN_PW);
    await page.click('#btn-start');
    await page.waitForSelector('.group-card[data-group="INF_URI"]');
    await page.click('.group-card[data-group="INF_URI"]');
    await page.waitForSelector('.case-card', { timeout: 15_000 });
    await page.locator('.case-card').first().click();
    await page.waitForSelector('#panel-1', { timeout: 30_000 });
    await page.waitForSelector('.msg', { timeout: 30_000 });

    // กด voice tab → ควร fallback กลับ text mode + แสดง error msg
    await page.click('#tab-voice-1');
    // รอ error message หรือ fallback (text row กลับมา visible)
    await page.waitForTimeout(1000);
    const hasError = await page.locator('.msg-system').filter({ hasText: 'ไม่รองรับ' }).count();
    const fallbackToText = await page.locator('#text-input-row-1').evaluate(el => !el.classList.contains('hidden'));
    expect(hasError > 0 || fallbackToText).toBeTruthy();
  });

});

// ============================================================
//  02-student-flow.spec.js
//  เส้นทางของนักศึกษา: dashboard → เริ่มซักประวัติ → สุ่มเคส → Step 1
//
//  ใช้ Admin account เพื่อหลีกเลี่ยง rate-limit 5 sessions/day
//
//  ⚠️ ห้ามกดปุ่ม "🟢 เริ่มเคส" ในชุดนี้ — ปุ่มนั้นคือจุดที่ createSession()
//     เขียน doc ลง Firestore และหักโควต้าจริง (chat.js:394) เทสต์ทั้งไฟล์นี้
//     จึงหยุดอยู่ก่อนกดปุ่ม และมีเทสต์ยืนยันว่ายังไม่มี session เกิดขึ้น
//
//  ประวัติ: ชุดเดิมเขียนไว้ตอนที่ยังมี groups grid 18 กลุ่ม → หน้ารายการเคส
//  → คลิกเลือกเคสเอง ซึ่งถูกถอดออกไปแล้ว (สเปกงานวิจัย §3.4.1: เหลือ 3 ระบบ
//  และนักศึกษาเลือกเคสเจาะจงไม่ได้ ระบบสุ่มให้) เทสต์เก่าจึงค้างพังมาตั้งแต่นั้น
// ============================================================

const { test, expect } = require('@playwright/test');
const { loginAs } = require('../helpers/auth');

const ADMIN_ID = process.env.ADMIN_ID;
const ADMIN_PW = process.env.ADMIN_PASSWORD;

// ต้องตรงกับ SYSTEMS ใน js/screens/groups.js:8 และ GROUPS ใน setup/seed-cases.js
const SYSTEM_IDS = ['RESP', 'GU_STI', 'NEURO'];

test.describe('Student Flow (via admin — rate-limit exempt)', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_ID, ADMIN_PW);
  });

  test('Dashboard แสดง action cards ครบ', async ({ page }) => {
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-history')).toBeVisible();
    await expect(page.locator('#btn-admin')).toBeVisible(); // admin only
    await page.screenshot({ path: 'test-results/screenshots/dashboard.png', fullPage: true });
  });

  test('เริ่มซักประวัติ → เห็นการ์ดสุ่มทุกระบบ + 3 ระบบโรค', async ({ page }) => {
    await page.click('#btn-start');
    await expect(page.locator('#pick-all')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#systems-grid .card[data-group]')).toHaveCount(SYSTEM_IDS.length);
    for (const id of SYSTEM_IDS) {
      await expect(page.locator(`#systems-grid .card[data-group="${id}"]`)).toBeVisible();
    }
    await page.screenshot({ path: 'test-results/screenshots/groups.png', fullPage: true });
  });

  // สเปกงานวิจัยกำหนดว่านักศึกษาต้องเลือกเคสเจาะจงไม่ได้ — ถ้าหน้ารายการเคส
  // กลับมาอยู่ในเส้นทางปกติเมื่อไร ตัวแปรของการทดลองจะเปลี่ยนทันที
  test('สุ่มทุกระบบ → เข้า chat ตรง ไม่ผ่านหน้ารายการเคส', async ({ page }) => {
    await page.click('#btn-start');
    await page.waitForSelector('#pick-all');
    await page.click('#pick-all');

    await expect(page.locator('#panel-1')).toBeVisible({ timeout: 30_000 });
    expect(page.url()).toContain('#chat');
    await expect(page.locator('#cases-container')).toHaveCount(0);
  });

  test('เข้าเคสแล้วเห็น Step 1 พร้อมปุ่มเริ่มเคสและฉากเปิด', async ({ page }) => {
    await page.click('#btn-start');
    await page.waitForSelector('#pick-all');
    await page.click('#pick-all');

    await expect(page.locator('#panel-1')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#step-1')).toHaveClass(/active/);
    await expect(page.locator('#start-case-btn')).toBeVisible();

    // VOICE_ONLY ซ่อนฟองแชท ฉากเปิดจึงถูกส่งไปโชว์ที่ช่องแจ้งเตือนแทน (chat.js:859)
    await expect(page.locator('#voice-notice-1')).toContainText('📍', { timeout: 30_000 });
    // ฟองแชท system ยังถูกเขียนลง DOM ไว้ให้ทีมอ่านย้อนหลังได้ แค่ไม่โชว์
    await expect(page.locator('#chat-messages .msg-system')).toHaveCount(1);

    await page.screenshot({ path: 'test-results/screenshots/chat-step1.png', fullPage: true });
  });

  // Regression: createSession() เคยอยู่ตอนเข้าหน้า #chat ทำให้แค่เปิดดูแล้วถอยออก
  // ก็เสียโควต้าไปแล้ว 1 ครั้ง (แก้เมื่อ 2026-08-12 ย้ายไปที่ปุ่มเริ่มเคส)
  test('ยังไม่กดเริ่มเคส = ยังไม่มี session และยังไม่เสียโควต้า', async ({ page }) => {
    await page.click('#btn-start');
    await page.waitForSelector('#pick-all');
    await page.click('#pick-all');
    await expect(page.locator('#panel-1')).toBeVisible({ timeout: 30_000 });

    const session = await page.evaluate(() => _session);
    expect(session).toBeNull();
  });

  test('เลือกระบบเจาะจง → สุ่มเคสในระบบนั้น หรือแจ้งว่ายังไม่มีเคส', async ({ page }) => {
    await page.click('#btn-start');
    await page.waitForSelector('#systems-grid .card[data-group="RESP"]');
    await page.click('#systems-grid .card[data-group="RESP"]');

    // ระบบที่ยังไม่มีเคส active จะคืนการ์ดกลับมาแล้วขึ้น alert แทน (groups.js:26)
    // ทั้งสองทางถือว่าถูก — ที่ผิดคือค้างอยู่ที่ spinner
    await expect(async () => {
      const inChat   = await page.locator('#panel-1').isVisible();
      const hasAlert = await page.locator('#groups-alert.alert').isVisible();
      expect(inChat || hasAlert).toBe(true);
    }).toPass({ timeout: 30_000 });
  });

  test('ปุ่มย้อนกลับในหน้าเริ่มซักประวัติ → กลับ dashboard', async ({ page }) => {
    await page.click('#btn-start');
    await page.waitForSelector('#back-btn');
    await page.click('#back-btn');
    await expect(page.locator('#btn-start')).toBeVisible();
  });

});

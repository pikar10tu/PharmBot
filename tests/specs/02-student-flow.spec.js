// ใช้ Admin account เพื่อหลีกเลี่ยง rate-limit 5 sessions/day
const { test, expect } = require('@playwright/test');
const { loginAs } = require('../helpers/auth');

const ADMIN_ID = process.env.ADMIN_ID;
const ADMIN_PW = process.env.ADMIN_PASSWORD;

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

  test('เลือกหมวดโรค → เห็น groups grid', async ({ page }) => {
    await page.click('#btn-start');
    await expect(page.locator('.group-grid')).toBeVisible({ timeout: 10_000 });
    // ตรวจว่ามี group cards
    await expect(page.locator('.group-card')).toHaveCount(18);
    await page.screenshot({ path: 'test-results/screenshots/groups.png', fullPage: true });
  });

  test('เลือก INF_URI → เห็นรายการเคส', async ({ page }) => {
    await page.click('#btn-start');
    await page.waitForSelector('.group-card[data-group="INF_URI"]');
    await page.click('.group-card[data-group="INF_URI"]');
    // รอ cases โหลดจาก Firestore
    await page.waitForSelector('#cases-container .case-list, #cases-container .card', { timeout: 15_000 });
    await page.screenshot({ path: 'test-results/screenshots/cases-INF_URI.png', fullPage: true });
  });

  test('เริ่มเคส → chat UI โหลดสำเร็จ (Step 1)', async ({ page }) => {
    await page.click('#btn-start');
    await page.waitForSelector('.group-card[data-group="INF_URI"]');
    await page.click('.group-card[data-group="INF_URI"]');

    // คลิกเคสแรกที่มี
    await page.waitForSelector('.case-card', { timeout: 15_000 });
    await page.locator('.case-card').first().click();

    // รอ chat UI ขึ้น (panel-1 + stepper)
    await expect(page.locator('#panel-1')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#step-1')).toHaveClass(/active/);

    // รอ system message แรก (.msg-system) — ปรากฏก่อน AI response
    await page.waitForSelector('.msg', { timeout: 30_000 });

    await page.screenshot({ path: 'test-results/screenshots/chat-step1.png', fullPage: true });
  });

  test('ปุ่มย้อนกลับใน groups → กลับ dashboard', async ({ page }) => {
    await page.click('#btn-start');
    await page.waitForSelector('#back-btn');
    await page.click('#back-btn');
    await expect(page.locator('#btn-start')).toBeVisible();
  });

  test('ปุ่มย้อนกลับใน cases → กลับ groups', async ({ page }) => {
    await page.click('#btn-start');
    await page.waitForSelector('.group-card[data-group="GI"]');
    await page.click('.group-card[data-group="GI"]');
    await page.waitForSelector('#back-btn');
    await page.click('#back-btn');
    await expect(page.locator('.group-grid')).toBeVisible({ timeout: 10_000 });
  });

});

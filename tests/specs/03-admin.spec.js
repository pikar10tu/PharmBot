const { test, expect } = require('@playwright/test');
const { loginAs, logout } = require('../helpers/auth');

const ADMIN_ID = process.env.ADMIN_ID;
const ADMIN_PW = process.env.ADMIN_PASSWORD;
const STUDENT_ID = process.env.STUDENT_ID;
const STUDENT_PW = process.env.STUDENT_PASSWORD;

test.describe('Admin Panel', () => {

  test('admin login → เห็น Admin card บน dashboard', async ({ page }) => {
    await loginAs(page, ADMIN_ID, ADMIN_PW);
    await expect(page.locator('#btn-admin')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/admin-dashboard.png', fullPage: true });
  });

  test('admin เข้า admin panel ได้', async ({ page }) => {
    await loginAs(page, ADMIN_ID, ADMIN_PW);
    await page.click('#btn-admin');
    // รอ admin panel โหลด
    await page.waitForURL('**/#admin', { timeout: 10_000 });
    await page.screenshot({ path: 'test-results/screenshots/admin-panel.png', fullPage: true });
  });

  test('student ไม่เห็น Admin card', async ({ page }) => {
    await loginAs(page, STUDENT_ID, STUDENT_PW);
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-admin')).not.toBeVisible();
  });

});

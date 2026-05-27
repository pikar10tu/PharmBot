const { test, expect } = require('@playwright/test');
const { loginAs, logout } = require('../helpers/auth');

const STUDENT_ID = process.env.STUDENT_ID;
const STUDENT_PW = process.env.STUDENT_PASSWORD;

test.describe('Login', () => {

  test('login สำเร็จ → เข้า dashboard', async ({ page }) => {
    await loginAs(page, STUDENT_ID, STUDENT_PW);
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-history')).toBeVisible();
    // Navbar แสดง participant ID
    await expect(page.locator('nav')).toContainText(STUDENT_ID);
  });

  test('รหัสผ่านผิด → แสดง error', async ({ page }) => {
    await page.goto('/#login');
    await page.fill('#login-id', STUDENT_ID);
    await page.fill('#login-pw', 'WRONG_PASSWORD');
    await page.click('#login-btn');
    await expect(page.locator('#login-alert')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#login-alert')).toContainText('ไม่ถูกต้อง');
  });

  test('กรอกข้อมูลไม่ครบ → แสดง error', async ({ page }) => {
    await page.goto('/#login');
    await page.fill('#login-id', STUDENT_ID);
    // ไม่กรอกรหัสผ่าน
    await page.click('#login-btn');
    await expect(page.locator('#login-alert')).toBeVisible();
  });

  test('logout → กลับหน้า login', async ({ page }) => {
    await loginAs(page, STUDENT_ID, STUDENT_PW);
    await logout(page);
    await expect(page.locator('#login-btn')).toBeVisible();
    await expect(page.locator('#login-id')).toBeVisible();
  });

});

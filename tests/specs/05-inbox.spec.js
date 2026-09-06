const { test, expect } = require('@playwright/test');
const { loginAs } = require('../helpers/auth');

const STUDENT_ID = process.env.STUDENT_ID;
const STUDENT_PW = process.env.STUDENT_PASSWORD;

// สตับชั้น Firestore ทิ้ง เพื่อให้เทสต์ไม่ผูกกับสถานะจริงของผู้ใช้คนนี้
// (ถ้าเขาเคยกดอ่านไปแล้ว pop-up จะไม่เด้ง เทสต์จะแดงทั้งที่โค้ดถูก)
// และตรึง "วันนี้" ไว้ที่วันสุดท้ายที่จดหมายยังเด้งได้ — เทสต์จะได้ไม่พังเองเมื่อเลย popupUntil
async function stubLetterState(page, readIds = []) {
  await page.evaluate((ids) => {
    window.getLetterReads  = async () => ids;
    window.markLetterRead  = async () => {};
    const letter = LETTERS.find(l => l.popupUntil);
    if (letter) window.todayISO = () => letter.popupUntil;
  }, readIds);
}

// กลับเข้า dashboard ใหม่เพื่อให้ initMailbox() ทำงานอีกรอบหลังสตับ
async function reenterDashboard(page) {
  await page.evaluate(() => { window.location.hash = '#history'; });
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.location.hash = '#dashboard'; });
  await page.waitForSelector('#btn-start');
}

test.describe('กล่องจดหมาย', () => {

  test('navbar มีปุ่มจดหมาย และกดแล้วเข้าหน้ากล่องจดหมาย', async ({ page }) => {
    await loginAs(page, STUDENT_ID, STUDENT_PW);
    await expect(page.locator('#mail-btn')).toBeVisible();

    await page.click('#mail-btn');
    await expect(page.locator('#letter-list')).toBeVisible();
    await expect(page.locator('h2')).toContainText('กล่องจดหมาย');
  });

  test('ยังไม่เคยอ่าน → pop-up เด้งเองที่หน้าแรก', async ({ page }) => {
    await loginAs(page, STUDENT_ID, STUDENT_PW);
    await stubLetterState(page, []);
    await reenterDashboard(page);

    const modal = page.locator('#letter-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Pre-CC1');
    await expect(modal).toContainText('47');
  });

  test('อ่านแล้ว → ไม่เด้งซ้ำ', async ({ page }) => {
    await loginAs(page, STUDENT_ID, STUDENT_PW);
    const firstId = await page.evaluate(() => LETTERS[0].id);
    await stubLetterState(page, [firstId]);
    await reenterDashboard(page);

    await page.waitForTimeout(500);
    await expect(page.locator('#letter-modal')).toHaveCount(0);
  });

  test('กดรับทราบ → ปิด และ badge หายไป', async ({ page }) => {
    await loginAs(page, STUDENT_ID, STUDENT_PW);
    await stubLetterState(page, []);
    await reenterDashboard(page);

    await expect(page.locator('#mail-badge')).toBeVisible();
    await page.click('#letter-modal-ok');
    await expect(page.locator('#letter-modal')).toHaveCount(0);
    await expect(page.locator('#mail-badge')).toBeHidden();
  });

  test('กด Escape ก็นับว่าอ่านแล้ว — ไม่เด้งซ้ำเมื่อกลับเข้าหน้าแรก', async ({ page }) => {
    // ถ้าไม่นับ ผู้เรียนที่เผลอกด Esc จะโดนเด้งทุกครั้งที่เข้าหน้าแรก
    await loginAs(page, STUDENT_ID, STUDENT_PW);
    await stubLetterState(page, []);
    await reenterDashboard(page);

    await expect(page.locator('#letter-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#letter-modal')).toHaveCount(0);

    await reenterDashboard(page);
    await page.waitForTimeout(500);
    await expect(page.locator('#letter-modal')).toHaveCount(0);
  });

  test('ในกล่องจดหมาย กดการ์ดแล้วกางเนื้อ และจุดยังไม่อ่านหายไป', async ({ page }) => {
    await loginAs(page, STUDENT_ID, STUDENT_PW);
    await stubLetterState(page, []);
    await page.click('#mail-btn');

    const card = page.locator('.letter-card').first();
    await expect(card.locator('.mail-dot')).toBeVisible();
    await expect(card.locator('.letter-body')).toBeHidden();

    await card.click();
    await expect(card.locator('.letter-body')).toBeVisible();
    await expect(card.locator('.letter-body')).toContainText('11.19');
    await expect(card.locator('.mail-dot')).toBeHidden();
  });

  test('อ่าน /letterReads ไม่ได้ → ไม่เด้ง และหน้าแรกยังใช้งานได้ตามปกติ', async ({ page }) => {
    await loginAs(page, STUDENT_ID, STUDENT_PW);
    await page.evaluate(() => { window.getLetterReads = async () => { throw new Error('permission-denied'); }; });
    await reenterDashboard(page);

    await page.waitForTimeout(500);
    await expect(page.locator('#letter-modal')).toHaveCount(0);
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#mail-btn')).toBeVisible();
  });

});

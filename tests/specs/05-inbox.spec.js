const { test, expect } = require('@playwright/test');
const { loginAs } = require('../helpers/auth');

const STUDENT_ID = process.env.STUDENT_ID;
const STUDENT_PW = process.env.STUDENT_PASSWORD;

// จดหมายตัวอย่างสำหรับเทสต์กลไก — ไม่ใช่จดหมายที่ปล่อยจริง
// (LETTERS ที่ปล่อยจริงว่างอยู่ ฟีเจอร์จึงต้องทดสอบด้วยของปลอม ไม่งั้นเทสต์จะบังคับ
//  ให้ต้องมีประกาศค้างอยู่ในแอปตลอดเวลาเพียงเพื่อให้ตัวเองเขียว)
const FIXTURE = {
  id:         'e2e-fixture-letter',
  subject:    '📮 จดหมายทดสอบ',
  date:       '2026-01-15',
  popupUntil: '2026-01-31',
  body:       'บรรทัดแรกของจดหมายทดสอบ\nบรรทัดที่สองของจดหมายทดสอบ',
};

// ฉบับที่ "ขึ้นแค่ในกล่อง ไม่เด้ง" — ใช้กับเทสต์ที่ต้องกดของในหน้ากล่องจดหมาย
const FIXTURE_BOX_ONLY = { ...FIXTURE, id: 'e2e-fixture-box-only', popupUntil: null };

// สตับชั้น Firestore ทิ้ง เพื่อให้เทสต์ไม่ผูกกับสถานะจริงของผู้ใช้คนนี้
// (ถ้าเขาเคยกดอ่านไปแล้ว pop-up จะไม่เด้ง เทสต์จะแดงทั้งที่โค้ดถูก)
// และตรึง "วันนี้" ไว้ที่วันสุดท้ายที่จดหมายยังเด้งได้ — เทสต์จะได้ไม่พังเองเมื่อเลย popupUntil
//
// ยัดของเข้า window ได้เพราะ `function foo(){}` และ `var` ระดับบนสุดของ classic script
// กลายเป็น property ของ window (ต่างจาก `const`/`let` ที่เป็น script scope)
//
// ⚠️ ต้องสตับ "ก่อนล็อกอิน" เสมอ — initMailbox() ยิงทันทีที่ dashboard เรนเดอร์ครั้งแรก
// ถ้าสตับหลังจากนั้น มันจะคว้า readIds ตัวจริงไปแล้วแต่มาอ่าน LETTERS ของปลอม = เด้งมั่ว
function letterStubs(page, readIds = [], letters = [FIXTURE]) {
  return () => page.evaluate(({ ids, ls }) => {
    window.LETTERS        = ls;
    window.getLetterReads = async () => ids;
    window.markLetterRead = async () => {};
    const popup = ls.find(l => l.popupUntil);
    if (popup) window.todayISO = () => popup.popupUntil;
  }, { ids: readIds, ls: letters });
}

// กลับเข้า dashboard ใหม่เพื่อให้ initMailbox() ทำงานอีกรอบ
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

  test('ไม่มีจดหมายที่ปล่อยจริง → ไม่เด้ง ไม่มี badge และกล่องขึ้นว่ายังไม่มีจดหมาย', async ({ page }) => {
    // ประกาศระดับรุ่นย้ายไปอยู่ dashboard รุ่นแล้ว — แอปนี้จึงต้องอยู่ในสภาพกล่องว่างได้
    // โดยไม่พัง และต้องไม่เด้งอะไรใส่ผู้เรียนกลางการฝึก
    await loginAs(page, STUDENT_ID, STUDENT_PW);
    expect(await page.evaluate(() => LETTERS.length)).toBe(0);

    await page.waitForTimeout(500);
    await expect(page.locator('#letter-modal')).toHaveCount(0);
    await expect(page.locator('#mail-badge')).toBeHidden();

    await page.click('#mail-btn');
    await expect(page.locator('#letter-list')).toContainText('ยังไม่มีจดหมาย');
  });

  test('ยังไม่เคยอ่าน → pop-up เด้งเองที่หน้าแรก', async ({ page }) => {
    await loginAs(page, STUDENT_ID, STUDENT_PW, { beforeSubmit: letterStubs(page, []) });

    const modal = page.locator('#letter-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(FIXTURE.subject);
    await expect(modal).toContainText('บรรทัดที่สองของจดหมายทดสอบ');
  });

  test('อ่านแล้ว → ไม่เด้งซ้ำ', async ({ page }) => {
    await loginAs(page, STUDENT_ID, STUDENT_PW,
      { beforeSubmit: letterStubs(page, [FIXTURE.id]) });

    await page.waitForTimeout(500);
    await expect(page.locator('#letter-modal')).toHaveCount(0);
    await expect(page.locator('#mail-badge')).toBeHidden();
  });

  test('กดรับทราบ → ปิด และ badge หายไป', async ({ page }) => {
    await loginAs(page, STUDENT_ID, STUDENT_PW, { beforeSubmit: letterStubs(page, []) });

    await expect(page.locator('#mail-badge')).toBeVisible();
    await page.click('#letter-modal-ok');
    await expect(page.locator('#letter-modal')).toHaveCount(0);
    await expect(page.locator('#mail-badge')).toBeHidden();
  });

  test('กด Escape ก็นับว่าอ่านแล้ว — ไม่เด้งซ้ำเมื่อกลับเข้าหน้าแรก', async ({ page }) => {
    // ถ้าไม่นับ ผู้เรียนที่เผลอกด Esc จะโดนเด้งทุกครั้งที่เข้าหน้าแรก
    await loginAs(page, STUDENT_ID, STUDENT_PW, { beforeSubmit: letterStubs(page, []) });

    await expect(page.locator('#letter-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#letter-modal')).toHaveCount(0);

    await reenterDashboard(page);
    await page.waitForTimeout(500);
    await expect(page.locator('#letter-modal')).toHaveCount(0);
  });

  test('ในกล่องจดหมาย กดการ์ดแล้วกางเนื้อ และจุดยังไม่อ่านหายไป', async ({ page }) => {
    await loginAs(page, STUDENT_ID, STUDENT_PW,
      { beforeSubmit: letterStubs(page, [], [FIXTURE_BOX_ONLY]) });
    await page.click('#mail-btn');

    const card = page.locator('.letter-card').first();
    await expect(card.locator('.mail-dot')).toBeVisible();
    await expect(card.locator('.letter-body')).toBeHidden();

    await card.click();
    await expect(card.locator('.letter-body')).toBeVisible();
    await expect(card.locator('.letter-body')).toContainText('บรรทัดแรกของจดหมายทดสอบ');
    await expect(card.locator('.mail-dot')).toBeHidden();
  });

  test('อ่าน /letterReads ไม่ได้ → ไม่เด้ง และหน้าแรกยังใช้งานได้ตามปกติ', async ({ page }) => {
    // เคสจริง: rules ไม่ยอมให้อ่านตั้งแต่ครั้งแรก — ต้องเงียบ ไม่ใช่เดาว่ายังไม่อ่าน
    await loginAs(page, STUDENT_ID, STUDENT_PW, {
      beforeSubmit: () => page.evaluate((l) => {
        window.LETTERS        = [l];
        window.todayISO       = () => l.popupUntil;
        window.getLetterReads = async () => { throw new Error('permission-denied'); };
      }, FIXTURE),
    });

    await page.waitForTimeout(500);
    await expect(page.locator('#letter-modal')).toHaveCount(0);
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#mail-btn')).toBeVisible();
    await expect(page.locator('#mail-badge')).toBeHidden();
  });

});

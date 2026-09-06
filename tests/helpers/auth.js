// Shared login helper for all test specs

// beforeSubmit — hook สำหรับสตับของในหน้าเว็บ "ก่อน" กดล็อกอิน
// จำเป็นกับฟีเจอร์ที่ทำงานทันทีตอน dashboard เรนเดอร์ครั้งแรก (เช่น pop-up จดหมาย):
// สตับหลังล็อกอินจะชนกับงาน async ที่ยิงไปแล้ว ได้ผลไม่แน่นอน
async function loginAs(page, participantId, password, { beforeSubmit } = {}) {
  await page.goto('/#login');
  await page.waitForSelector('#login-id', { timeout: 10_000 });
  if (beforeSubmit) await beforeSubmit();
  await page.fill('#login-id', participantId);
  await page.fill('#login-pw', password);
  await page.click('#login-btn');
  // Wait until redirected away from login
  await page.waitForFunction(
    () => !window.location.hash.includes('login'),
    { timeout: 20_000 }
  );
}

async function logout(page) {
  await page.click('#logout-btn');
  await page.waitForSelector('#login-btn', { timeout: 10_000 });
}

module.exports = { loginAs, logout };

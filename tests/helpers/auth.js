// Shared login helper for all test specs

async function loginAs(page, participantId, password) {
  await page.goto('/#login');
  await page.waitForSelector('#login-id', { timeout: 10_000 });
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

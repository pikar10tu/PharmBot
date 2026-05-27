const { defineConfig, devices } = require('@playwright/test');
require('dotenv').config({ path: './tests/.env.test' });

module.exports = defineConfig({
  testDir: './tests/specs',
  timeout: 60_000,
  retries: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'th-TH',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'npx serve . -p 3000 --no-clipboard',
    port: 3000,
    reuseExistingServer: true,
    cwd: __dirname,
  },
});

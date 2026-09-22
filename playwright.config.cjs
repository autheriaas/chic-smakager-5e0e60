const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: '*.spec.cjs', workers: 1,
  use: { baseURL: 'http://127.0.0.1:8899', headless: true },
  outputDir: 'test-results',
  webServer: { command: 'node tests/serve-static.cjs', url: 'http://127.0.0.1:8899', reuseExistingServer: false },
});

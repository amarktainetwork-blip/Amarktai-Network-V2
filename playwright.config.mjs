import { defineConfig } from 'playwright/test'

export default defineConfig({
  outputDir: 'test-results',
  reporter: [
    ['line'],
    ['html', {
      open: 'never',
      outputFolder: process.env.PLAYWRIGHT_HTML_OUTPUT_DIR || 'playwright-report',
    }],
  ],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
})

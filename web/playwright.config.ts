import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    // Existing specs assert Chinese copy; English specs switch language explicitly.
    locale: 'zh-CN',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'msedge' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'msedge' } },
  ],
})
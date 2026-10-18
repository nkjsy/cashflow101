import { defineConfig, devices } from '@playwright/test'

// Windows uses the preinstalled Edge; elsewhere use Playwright's Chromium, or PW_CHROMIUM_PATH if set.
const browserChannel = process.platform === 'win32'
  ? { channel: 'msedge' }
  : process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}

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
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...browserChannel } },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...browserChannel } },
  ],
})
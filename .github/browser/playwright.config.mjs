import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /browser-smoke\.spec\.mjs/,
  timeout: 35_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  // The fixture is intentionally compact, so one worker now stays comfortably
  // inside the 25-minute job budget and avoids WebKit resource/context races.
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: process.env.CI ? [['line']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // retain-on-failure video still records every passing test before deleting
    // it. Across the seven-project WebKit/Chromium matrix that creates avoidable
    // encoder/process pressure and has caused late WebKit target crashes. Keep
    // the retained trace + failure screenshot as deterministic diagnostics.
    video: 'off',
  },
  projects: [
    {
      name: 'phone-webkit',
      use: {
        browserName: 'webkit',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'phone-landscape-webkit',
      use: {
        browserName: 'webkit',
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'tablet-webkit',
      use: {
        browserName: 'webkit',
        viewport: { width: 834, height: 1194 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'tablet-landscape-webkit',
      use: {
        browserName: 'webkit',
        viewport: { width: 1194, height: 834 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'android-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 2.625,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'desktop-webkit',
      use: {
        browserName: 'webkit',
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
});

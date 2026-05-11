import { defineConfig, devices } from "@playwright/test";

const USE_BUILD = process.env.E2E_USE_BUILD === "1";

export default defineConfig({
  testDir: "./e2e",
  // When E2E_USE_BUILD=1, start a fresh production server. Dev-mode runs
  // assume the user already has `npm run dev` going on the configured port.
  webServer: USE_BUILD
    ? {
        command: "npm run build && npm start -- --port 5050",
        port: 5050,
        timeout: 240_000,
        reuseExistingServer: false,
      }
    : undefined,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  // Dev-mode compilation can be slow on first page hit (especially without
  // Turbopack), so generous timeouts. CI should run against `next build && next start`
  // for much faster runs.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5050",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    // Always start from a clean cookie jar so tests don't inherit a session
    // from a parallel dev/MCP browser.
    storageState: { cookies: [], origins: [] },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";

// Dedicated loopback port; never reuse a production or another development server.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "publication.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:18143", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm exec next dev --webpack --hostname 127.0.0.1 --port 18143",
    url: "http://127.0.0.1:18143",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
});

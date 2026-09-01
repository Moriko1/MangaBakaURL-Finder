import { defineConfig } from "@playwright/test";

export default defineConfig({
  fullyParallel: false,
  reporter: process.env.CI ? "github" : "list",
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    trace: "retain-on-failure",
  },
  workers: 1,
});

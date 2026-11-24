import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? {
          launchOptions: {
            executablePath: process.env.CHROMIUM_PATH,
            args: [
              "--no-sandbox",
              "--disable-dev-shm-usage",
              "--single-process",
              "--no-zygote",
              "--disable-gpu",
            ],
          },
        }
      : {}),
  },
  reporter: "list",
});

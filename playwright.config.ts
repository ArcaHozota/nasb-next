import { defineConfig, devices } from "@playwright/test";

// 画面を通したテスト(E2E)。バックエンドは起動せず、ブラウザ側で /api/** の応答を
// 差し替える(e2e/mock-api.ts)。本番と同じものを確かめるため、Dockerfile と同じく
// standalone のサーバー(.next/standalone/server.js)に public と .next/static を並べて起動する。
const PORT = 3100;
const START = [
  "rm -rf .next/standalone/public .next/standalone/.next/static",
  "cp -R public .next/standalone/public",
  "cp -R .next/static .next/standalone/.next/static",
  `PORT=${PORT} HOSTNAME=localhost node .next/standalone/server.js`,
].join(" && ");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI では build 済みのものを起動するだけにする(ワークフローで先に npm run build する)
    command: process.env.CI ? START : `npm run build && ${START}`,
    url: `http://localhost:${PORT}/home`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

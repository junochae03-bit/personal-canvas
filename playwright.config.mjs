// Playwright 설정 — 단일 smoke 테스트 (부트 → 프리셋 추가 → 갤러리 노출).
// 정적 파일은 Python http.server 로 serving (GH Actions runner 기본 제공).
// 로컬 실행: npm run e2e

export default {
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8765',
    headless: true,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 8765',
    port: 8765,
    timeout: 10000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
};

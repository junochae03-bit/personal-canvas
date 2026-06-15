import { chromium } from 'playwright-core';
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const p = await browser.newPage({ viewport: {width:1280, height:900} });
await p.goto('http://127.0.0.1:8765/', {waitUntil:'networkidle'});
await p.waitForSelector('#prompt');
await p.waitForTimeout(400);
await p.evaluate(() => window.setMainPane('settings'));
await p.waitForTimeout(300);
await p.evaluate(() => document.getElementById('wakeLockToggleBtn')?.scrollIntoView({block:'center'}));
await p.waitForTimeout(200);
await p.screenshot({path:'/tmp/wake_lock_card.png'});
// Wake Lock 미지원 환경(headless)이지만 토글 클릭 → 상태 변경·라벨 변경 확인
const result = await p.evaluate(async () => {
  const supports = 'wakeLock' in navigator;
  document.getElementById('wakeLockToggleBtn').click();
  await new Promise(r => setTimeout(r, 100));
  return {
    supports,
    ariaAfter: document.getElementById('wakeLockToggleBtn').getAttribute('aria-pressed'),
    labelAfter: document.getElementById('wakeLockToggleBtn').textContent.trim(),
    lsAfter: localStorage.getItem('nai_wake_lock'),
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();

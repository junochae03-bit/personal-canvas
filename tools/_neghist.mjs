import { chromium } from 'playwright-core';
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const p = await browser.newPage({ viewport: {width:1280, height:900} });
await p.goto('http://127.0.0.1:8765/', {waitUntil:'networkidle'});
await p.waitForSelector('#prompt');
await p.waitForTimeout(400);

// 두 항목 미리 기록
const recorded = await p.evaluate(() => {
  window.recordPromptHistory('1girl, masterpiece');
  window.recordPromptHistory('2girls, yuri, kiss');
  window.recordNegPromptHistory('lowres, bad anatomy');
  window.recordNegPromptHistory('text, watermark, blurry');
  return {
    p: window.state.promptHistory.length,
    n: window.state.negPromptHistory.length,
  };
});
console.log('기록:', JSON.stringify(recorded));

// 네거티브 히스토리 버튼 클릭 → 메뉴 표시 확인
await p.click('#negHistoryBtn');
await p.waitForTimeout(150);
const open = await p.evaluate(() => ({
  menu: document.getElementById('negHistoryMenu').style.display !== 'none',
  items: document.querySelectorAll('#negHistoryMenu [data-ph-idx]').length,
  firstText: document.querySelector('#negHistoryMenu [data-ph-idx="0"]')?.textContent?.trim().slice(0, 30),
}));
console.log('메뉴 열림:', JSON.stringify(open));
await p.screenshot({ path: '/tmp/neghist_menu.png' });

// 첫 항목 클릭 → 복원
await p.click('#negHistoryMenu [data-ph-idx="0"]');
await p.waitForTimeout(150);
const restored = await p.evaluate(() => ({
  negValue: document.getElementById('negPrompt').value,
  promptValue: document.getElementById('prompt').value,
  menuClosed: document.getElementById('negHistoryMenu').style.display === 'none',
}));
console.log('복원:', JSON.stringify(restored));

// 동시 열림 방지 — 프롬프트 히스토리 열고 네거티브 히스토리 열면 프롬프트 메뉴는 닫혀야
await p.click('#promptHistoryBtn');
await p.waitForTimeout(100);
await p.click('#negHistoryBtn');
await p.waitForTimeout(100);
const exclusivity = await p.evaluate(() => ({
  prompt: document.getElementById('promptHistoryMenu').style.display !== 'none',
  neg: document.getElementById('negHistoryMenu').style.display !== 'none',
}));
console.log('동시열림 방지:', JSON.stringify(exclusivity));

await browser.close();

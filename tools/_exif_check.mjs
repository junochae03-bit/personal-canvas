import { chromium } from 'playwright-core';
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const p = await browser.newPage({ viewport: {width:1280, height:800} });
await p.goto('http://127.0.0.1:8765/', {waitUntil:'networkidle'});
await p.waitForSelector('#prompt');
await p.waitForTimeout(400);

// 시나리오 1: V4 nested 메타 — top-level prompt/uc 없이 v4_negative_prompt 만
const r1 = await p.evaluate(() => {
  document.getElementById('prompt').value = '';
  document.getElementById('negPrompt').value = '';
  const meta = {
    v4_prompt: { caption: { base_caption: '1girl, masterpiece, V4' } },
    v4_negative_prompt: { caption: { base_caption: 'lowres, V4 nested' } },
    seed: 99001,
    model: 'nai-diffusion-4-5-full',
  };
  const restored = window.applyParsedMetaToForm({ parsed: meta });
  return {
    prompt: document.getElementById('prompt').value,
    neg: document.getElementById('negPrompt').value,
    seed: document.getElementById('seed').value,
    restored,
  };
});
console.log('[V4 nested]', JSON.stringify(r1));

// 시나리오 2: top-level neg(우리 앱이 저장한 형태) — 회귀 확인
const r2 = await p.evaluate(() => {
  document.getElementById('prompt').value = '';
  document.getElementById('negPrompt').value = '';
  const meta = { prompt: 'top prompt', neg: 'top neg', seed: 42 };
  const restored = window.applyParsedMetaToForm({ parsed: meta });
  return {
    prompt: document.getElementById('prompt').value,
    neg: document.getElementById('negPrompt').value,
    restored,
  };
});
console.log('[top-level legacy]', JSON.stringify(r2));

// 시나리오 3: 외부 NAI 공식 — uc 키 (V3)
const r3 = await p.evaluate(() => {
  document.getElementById('prompt').value = '';
  document.getElementById('negPrompt').value = '';
  const meta = { prompt: 'V3 prompt', uc: 'V3 uc', seed: 77 };
  const restored = window.applyParsedMetaToForm({ parsed: meta });
  return { neg: document.getElementById('negPrompt').value, restored };
});
console.log('[V3 uc]', JSON.stringify(r3));

await browser.close();

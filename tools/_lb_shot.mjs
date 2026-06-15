import { chromium } from 'playwright-core';
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const m = await browser.newPage({ viewport: {width: 390, height: 844}, deviceScaleFactor: 2 });
await m.goto('http://127.0.0.1:8765/', {waitUntil:'networkidle'});
await m.waitForSelector('#prompt');
await m.waitForTimeout(400);

// 더미 이미지 시드 + 라이트박스 열기
await m.evaluate(async () => {
  const cv = document.createElement('canvas'); cv.width=512; cv.height=768;
  const ctx = cv.getContext('2d');
  // 핑크 그라데이션 (스샷 분위기 유사)
  const g = ctx.createLinearGradient(0,0,0,768);
  g.addColorStop(0, '#fce7f0'); g.addColorStop(1, '#f4a5c2');
  ctx.fillStyle = g; ctx.fillRect(0,0,512,768);
  ctx.fillStyle = '#fff'; ctx.font='bold 48px sans-serif'; ctx.textAlign='center';
  ctx.fillText('테스트', 256, 384);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  await window.DB.newSession('lightbox 테스트');
  const id = await window.DB.saveImage(blob, '테스트.png', '캐릭터#1', 'test prompt', {seed:1234, model:'nai-diffusion-4-5-full'});
  window.setMainPane('gallery');
  await new Promise(r => setTimeout(r, 800));
  const sid = window.DB.currentSessionId;
  window.openLightbox(id, sid);
});
await m.waitForTimeout(1200);
await m.screenshot({path:'/tmp/lb_mobile_before.png'});
console.log('done');
await browser.close();

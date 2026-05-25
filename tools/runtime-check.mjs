// 실사용 런타임 점검 하네스 — 콘솔/페이지 에러 캡처 + 주요 플로우 자동 조작 + 성능 측정.
// 시스템 chromium(v1194) executablePath 로 구동.
import { chromium } from 'playwright-core';

// 시스템 chromium 경로 — 환경마다 다름. PW_CHROME 환경변수로 오버라이드 가능.
//   실행: (python3 -m http.server 8765 &) && PW_CHROME=/path/to/chrome node tools/runtime-check.mjs
const EXEC = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.PW_URL || 'http://127.0.0.1:8765/';
const IGNORE = /novelai|fetch|net::|frame-ancestors|content security policy|x-frame-options|serviceworker|manifest|preload|favicon|the user aborted/i;

const errors = [];
const slow = [];

function logErr(src, msg){ if(!IGNORE.test(msg)) errors.push(`[${src}] ${msg}`); }

async function timed(label, fn){
  const t = Date.now();
  try { await fn(); } catch(e){ errors.push(`[flow:${label}] ${e.message||e}`); }
  const ms = Date.now() - t;
  if(ms > 1500) slow.push(`${label}: ${ms}ms`);
  return ms;
}

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const page = await browser.newPage({ viewport: {width: 1280, height: 900} });
page.on('pageerror', e => logErr('pageerror', e.message || String(e)));
page.on('console', m => { if(m.type() === 'error') logErr('console', m.text()); });

// 1) 부트
await timed('boot', async () => {
  await page.goto(URL, {waitUntil: 'networkidle', timeout: 20000});
  await page.waitForSelector('#prompt', {timeout: 10000});
  await page.waitForTimeout(800);
});

// 2) 메인 탭 순회 (preview/gallery/presets/templates/tags/settings)
for(const pane of ['gallery','presets','templates','tags','settings','preview']){
  await timed('pane:'+pane, async () => {
    await page.evaluate(p => window.setMainPane && window.setMainPane(p), pane);
    await page.waitForTimeout(250);
  });
}

// 3) RC 빌더 열기 + 카테고리 추가 + 적용 토글
await timed('rc-builder', async () => {
  await page.evaluate(() => window.setMainPane && window.setMainPane('edit'));
  await page.evaluate(() => window.rcToggleBuilder && window.rcToggleBuilder(true));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.rcAddCategory && window.rcAddCategory('test'));
  await page.waitForTimeout(150);
  // 적용 토글
  await page.evaluate(() => { const t = document.getElementById('rcEnableToggle'); if(t){ t.checked = true; t.dispatchEvent(new Event('change')); } });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.rcToggleBuilder && window.rcToggleBuilder(false));
});

// 4) 캐릭터 추가/제거
await timed('characters', async () => {
  await page.evaluate(() => window.addCharacter && window.addCharacter());
  await page.evaluate(() => window.addCharacter && window.addCharacter());
  await page.waitForTimeout(150);
  await page.evaluate(() => window.removeCharacter && window.removeCharacter(0));
  await page.waitForTimeout(100);
});

// 5) 모달 열고 닫기 (confirmModal 재사용 stale 핸들러 점검)
await timed('modals', async () => {
  await page.evaluate(() => window.openStatsModal && window.openStatsModal());
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
});

// 6) 테마 전환 (고대비 회귀 점검은 시각이라 스킵, 에러만)
await timed('themes', async () => {
  for(const th of ['dark','midnight','teal','rose','light']){
    await page.evaluate(t => { if(window.state){ window.state.theme = t; document.documentElement.setAttribute('data-theme', t); } }, th);
    await page.waitForTimeout(60);
  }
});

// 7) 갤러리 정렬 전환
await timed('gallery-sort', async () => {
  await page.evaluate(() => window.setMainPane && window.setMainPane('gallery'));
  await page.waitForTimeout(150);
  for(const s of ['new','old','liked','seed_asc','model','label','session']){
    await page.evaluate(v => { const sel = document.getElementById('gallerySort'); if(sel){ sel.value = v; sel.dispatchEvent(new Event('change')); } }, s);
    await page.waitForTimeout(80);
  }
});

// 8) 메모리: ObjectURL 누수 대략 점검 — loadGallery 반복 호출 후 detached blob URL 수
const leakInfo = await page.evaluate(async () => {
  if(!window.loadGallery) return 'no loadGallery';
  for(let i=0;i<5;i++){ await window.loadGallery(); }
  return 'loadGallery x5 ok';
});

await browser.close();

console.log('\n===== 런타임 점검 결과 =====');
console.log('치명 에러:', errors.length);
errors.slice(0, 40).forEach(e => console.log('  ✗', e));
console.log('느린 작업(>1.5s):', slow.length);
slow.forEach(s => console.log('  🐢', s));
console.log('메모리 점검:', leakInfo);
console.log('===========================');
process.exit(errors.length ? 1 : 0);

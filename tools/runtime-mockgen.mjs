// 실사용 시뮬레이션 — DB.saveImage 로 실제 PNG blob + 현실적 메타를 직접 주입해 갤러리를 채운 뒤
// 결과 처리 파이프라인 전체(갤러리·라이트박스·통계·좋아요/싫어요·휴지통·정렬·EXIF)를 실제 코드로 반복 구동.
// NovelAI 네트워크/디코드 라이브러리(CDN 차단) 없이도 핵심 사용자 경로 검증.
import { chromium } from 'playwright-core';
import { appendFileSync, writeFileSync } from 'node:fs';

const EXEC = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.PW_URL || 'http://127.0.0.1:8765/';
const LOG = process.env.MG_LOG || '/tmp/mg.log';
const IGNORE = /novelai|net::|frame-ancestors|content security policy|x-frame-options|serviceworker|manifest|preload|favicon|the user aborted|quota|jszip|messagepack|pako|cdnjs|unpkg|jsdelivr/i;

writeFileSync(LOG, '');   // 초기화
const errors = [];
function logErr(src, msg){ if(!IGNORE.test(msg)) errors.push(`[${src}] ${msg}`); }
function say(s){ try { appendFileSync(LOG, s+'\n'); } catch(_){ /* ignore */ } console.log(s); }   // 즉시 파일 기록 (중단돼도 보존)

let browser;
try {
const _b = browser = await chromium.launch({ executablePath: EXEC, headless: true });
const page = await browser.newPage({ viewport: {width: 1280, height: 900} });
page.on('pageerror', e => logErr('pageerror', e.message || String(e)));
page.on('console', m => { if(m.type() === 'error') logErr('console', m.text()); });

await page.goto(URL, {waitUntil: 'networkidle', timeout: 20000});
await page.waitForSelector('#prompt', {timeout: 10000});
await page.waitForTimeout(600);

async function step(label, fn){
  const before = errors.length;
  try { await fn(); } catch(e){ errors.push(`[${label}] ${e.message||e}`); }
  await page.waitForTimeout(120);
  say(`${errors.length>before?'✗':'✓'} ${label}${errors.length>before?` (+${errors.length-before})`:''}`);
}

// ── 0) 18장 주입 (시드·모델·프롬프트·캐릭터 다양화) ──
await step('inject 18 images via DB.saveImage', async () => {
  const n = await page.evaluate(async () => {
    const models = ['nai-diffusion-4-5-full','nai-diffusion-3','nai-diffusion-4-full'];
    const prompts = ['1girl, masterpiece','2girls, detailed','1boy, male focus','landscape, scenery','(masterpiece:1.3), 1girl'];
    const chars = [['러브라이브_마키'],['보컬로이드_미쿠'],[],['원신_라이덴'],['러브라이브_마키','보컬로이드_미쿠']];
    function mkBlob(i){
      const c = document.createElement('canvas'); c.width=128; c.height=128;
      const x = c.getContext('2d'); x.fillStyle=`hsl(${(i*37)%360},65%,55%)`; x.fillRect(0,0,128,128);
      x.fillStyle='#fff'; x.font='24px sans-serif'; x.fillText('#'+i,40,70);
      return new Promise(r=>c.toBlob(r,'image/png'));
    }
    let saved = 0;
    for(let i=1;i<=18;i++){
      const blob = await mkBlob(i);
      const meta = {
        prompt: prompts[i%prompts.length], neg: 'bad anatomy',
        model: models[i%models.length], seed: 1000000+i*7, steps: 28, cfg: 5,
        cfgRescale: 0, sampler: 'k_euler_ancestral', schedule: 'karras', w: 1024, h: 1024,
        characters: chars[i%chars.length],
        charPrompts: chars[i%chars.length].map(nm => ({name:nm, prompt:'1girl, '+nm, neg:''})),
      };
      await window.DB.saveImage(blob, `test_${i}.png`, `테스트 #${i}`, meta.prompt, meta);
      saved++;
    }
    await window.loadGallery();
    return saved;
  });
  say(`   주입 완료: ${n}장`);
});

const galN = await page.evaluate(async () => (await window.DB.getAllImagesForStats()).length);
say(`   갤러리 총: ${galN}장`);

// ── 1) 좋아요 5회 + 싫어요 5회 (카드 버튼) ──
await step('like x5 + dislike x5 (cards)', async () => {
  await page.evaluate(() => window.setMainPane && window.setMainPane('gallery'));
  await page.waitForTimeout(400);
  const cards = await page.$$('#galleryGrid .g-item');
  for(let i=0;i<Math.min(5,cards.length);i++){
    const b = await cards[i].$('[data-act="like"]'); if(b) await b.click();
    await page.waitForTimeout(60);
  }
  for(let i=5;i<Math.min(10,cards.length);i++){
    const b = await cards[i].$('[data-act="dislike"]'); if(b) await b.click();
    await page.waitForTimeout(60);
  }
  const stats = await page.evaluate(async () => {
    const all = await window.DB.getAllImagesForStats();
    return {liked: all.filter(x=>x.liked).length, disliked: all.filter(x=>x.disliked).length};
  });
  say(`   ❤️ ${stats.liked} · 👎 ${stats.disliked}`);
});

// ── 2) 라이트박스 nav 10회 + 카운터 정합 ──
await step('lightbox nav x10 + counter', async () => {
  await page.evaluate(() => {
    const c = document.querySelector('#galleryGrid .g-item');
    if(c) window.openLightbox(parseInt(c.dataset.id), parseInt(c.dataset.sid));
  });
  await page.waitForTimeout(400);
  for(let i=0;i<10;i++){ await page.keyboard.press('ArrowRight'); await page.waitForTimeout(90); }
  const counter = await page.evaluate(() => document.getElementById('lbCounter')?.textContent || '');
  say(`   카운터: "${counter}" (전체 ${galN}장과 비교)`);
  // EXIF 정보 패널 토글
  await page.evaluate(() => document.getElementById('lbInfoBtn')?.click());
  await page.waitForTimeout(200);
  const meta = await page.evaluate(() => (document.getElementById('lbMeta')?.textContent||'').slice(0,80));
  say(`   메타 일부: ${meta.replace(/\s+/g,' ')}`);
  await page.keyboard.press('Escape');
});

// ── 3) 통계 모달 5회 열고닫기 (캐시·집계 안정성) ──
await step('stats modal x5', async () => {
  for(let i=0;i<5;i++){
    await page.evaluate(() => window.openStatsModal && window.openStatsModal());
    await page.waitForTimeout(400);
    if(i===0){
      const intro = await page.evaluate(() => document.getElementById('statsIntro')?.textContent||'');
      const seeds = await page.evaluate(() => document.getElementById('statsTopSeeds')?.children.length||0);
      say(`   ${intro} · TopSeeds행=${seeds}`);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  }
});

// ── 4) 정렬 8종 ──
await step('sort x8', async () => {
  await page.evaluate(() => window.setMainPane && window.setMainPane('gallery'));
  for(const s of ['new','old','liked','seed_asc','seed_desc','model','label','session']){
    await page.evaluate(v => { const sel=document.getElementById('gallerySort'); if(sel){ sel.value=v; sel.dispatchEvent(new Event('change')); } }, s);
    await page.waitForTimeout(110);
  }
});

// ── 5) 필터 토글 (좋아요만/싫어요만) ──
await step('filters', async () => {
  for(const id of ['galLikeToggle','galDislikeToggle']){
    await page.evaluate(i => document.getElementById(i)?.click(), id);
    await page.waitForTimeout(250);
    const visible = await page.$$eval('#galleryGrid .g-item', els => els.length);
    say(`   ${id} ON → ${visible}장 표시`);
    await page.evaluate(i => document.getElementById(i)?.click(), id);
    await page.waitForTimeout(150);
  }
});

// ── 6) EXIF 복원 (카드 ↻) ──
await step('EXIF restore to form', async () => {
  await page.evaluate(() => {
    const c = document.querySelector('#galleryGrid .g-item');
    const b = c?.querySelector('[data-act="exif"]');
    if(b) b.click();
  });
  await page.waitForTimeout(300);
  // confirmDialog 확인 누르기
  await page.evaluate(() => { const ok=document.getElementById('confirmOk'); if(ok && ok.offsetParent) ok.click(); });
  await page.waitForTimeout(300);
  const prompt = await page.evaluate(() => document.getElementById('prompt')?.value||'');
  say(`   복원된 프롬프트: "${prompt.slice(0,40)}"`);
});

// ── 7) 휴지통 이동 5장 + 비우기 ──
await step('trash 5 + empty', async () => {
  await page.evaluate(async () => {
    const all = await window.DB.getAllImagesForStats();
    for(let i=0;i<Math.min(5,all.length);i++) await window.DB.trashImage(all[i].id);
    await window.loadGallery();
  });
  await page.waitForTimeout(300);
  const trashed = await page.evaluate(async () => {
    const tx = window.DB.tx(window.DB.IMG,'readonly');
    return await new Promise(r => { const rq = tx.objectStore(window.DB.IMG).getAll(); rq.onsuccess=()=>r(rq.result.filter(i=>i.deletedAt).length); rq.onerror=()=>r(-1); });
  });
  say(`   휴지통: ${trashed}장`);
});

// ── 8) loadGallery 10회 반복 (ObjectURL 누수·안정성) ──
await step('loadGallery x10', async () => {
  await page.evaluate(async () => { for(let i=0;i<10;i++) await window.loadGallery(); });
});

say('\n치명 에러: ' + errors.length);
errors.slice(0,50).forEach(e => say('  ✗ ' + e));
say('================================');
} catch(fatal){
  say('FATAL: ' + (fatal?.stack || fatal?.message || fatal));
} finally {
  try { if(browser) await browser.close(); } catch(_){ /* ignore */ }
}
process.exit(errors.length ? 1 : 0);

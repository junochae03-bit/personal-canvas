import { chromium } from 'playwright-core';
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const p = await browser.newPage({ viewport: {width:1280, height:800} });
await p.goto('http://127.0.0.1:8765/', {waitUntil:'networkidle'});
await p.waitForSelector('#prompt');
await p.waitForTimeout(400);

const cases = await p.evaluate(() => {
  const results = {};
  // 시나리오 1: 캐릭터 자동 라벨 (이미 #N 포함된 형태)
  results['char_auto'] = window.makeFilename({label: '블아_노조미#1', _labelIsName: true, meta: {}});
  // 시나리오 2: 사용자 라벨 (#N 없음 → 큐 인덱스 자동 추가)
  results['user_label'] = window.makeFilename({label: '내라벨', _labelIsName: true, meta: {}});
  // 시나리오 3: 라벨 없음 → defaultName
  results['nolabel'] = window.makeFilename({label: '1', _labelIsName: false, meta: {}});
  // 시나리오 4: 패턴 명시 → 기존 동작 보존
  document.getElementById('fnamePattern').value = '{date}_{seed}';
  results['pattern_explicit'] = window.makeFilename({label: 'X', seed: 12345, meta: {model:'nai-diffusion-4-5-full'}});
  document.getElementById('fnamePattern').value = '';
  // 시나리오 5: 라벨에 공백/특수문자 정리
  results['safe_clean'] = window.makeFilename({label: '블아 / 노조미#2', _labelIsName: true, meta: {}});
  return results;
});
console.log(JSON.stringify(cases, null, 2));

await browser.close();

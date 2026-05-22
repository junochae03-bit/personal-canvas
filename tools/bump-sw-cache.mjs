// SW CACHE_NAME 자동 버저닝 — index.html 의 SHA-256 8자를 sw.js 의 CACHE_NAME 토큰에 치환.
// HTML 이 변경되면 자동으로 캐시 이름이 바뀌어 stale 캐시가 invalidate 됨.
//
// 사용: npm run bump-sw-cache (수동) 또는 CI 워크플로에서 호출.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HTML_PATH = ROOT + 'index.html';
const SW_PATH = ROOT + 'sw.js';

const html = readFileSync(HTML_PATH);
const hash = createHash('sha256').update(html).digest('hex').slice(0, 8);

let sw = readFileSync(SW_PATH, 'utf8');
const re = /const\s+CACHE_NAME\s*=\s*['"]nai-studio-[^'"]+['"]/;
const m = sw.match(re);
if(!m){
  console.error('CACHE_NAME 패턴을 sw.js 에서 찾지 못함');
  process.exit(1);
}
const next = `const CACHE_NAME = 'nai-studio-${hash}'`;
if(m[0] === next){
  console.log(`CACHE_NAME 이미 최신: nai-studio-${hash}`);
  process.exit(0);
}
sw = sw.replace(re, next);
writeFileSync(SW_PATH, sw);
console.log(`✓ CACHE_NAME → nai-studio-${hash} (이전: ${m[0].match(/nai-studio-[^'"]+/)[0]})`);

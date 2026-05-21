// SRI hash 자동 주입 — index.html 의 외부 <script src=...> 에 integrity 속성 추가/갱신.
// CDN 3종(jszip, msgpack, pako)을 fetch 해서 SHA-384 계산. 네트워크 필요.
//
// 사용: npm run sri
// CI: .github/workflows/update-integrity.yml (workflow_dispatch)

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HTML_PATH = ROOT + 'index.html';

const TARGETS = [
  // 매치되는 src 패턴 + 다운로드 URL (둘이 같아도 패턴에 정규식 메타 문자가 있을 수 있어 별도 보관)
  {
    label: 'jszip',
    matchSrc: /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\/[\d.]+\/jszip\.min\.js/,
    url: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  },
  {
    label: 'msgpack',
    matchSrc: /https:\/\/unpkg\.com\/@msgpack\/msgpack@[^"'\s]+/,
    url: 'https://unpkg.com/@msgpack/msgpack@3.0.0-beta2/dist.es5+umd/msgpack.min.js',
  },
  {
    label: 'pako',
    matchSrc: /https:\/\/cdn\.jsdelivr\.net\/npm\/pako@[\d.]+\/dist\/pako\.min\.js/,
    url: 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
  },
];

async function sha384(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`fetch ${url}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return 'sha384-' + createHash('sha384').update(buf).digest('base64');
}

async function main(){
  let html = readFileSync(HTML_PATH, 'utf8');
  let changes = 0;
  for(const t of TARGETS){
    let sri;
    try { sri = await sha384(t.url); }
    catch(e){ console.error(`✗ ${t.label}: ${e.message}`); continue; }
    // <script ...src="...t.url..." ...></script> 찾기
    const tagRe = new RegExp(`<script\\s+[^>]*src=["']${t.matchSrc.source}[^>]*></script>`, 'i');
    const m = html.match(tagRe);
    if(!m){
      console.warn(`✗ ${t.label}: <script> 태그를 찾지 못함 (패턴: ${t.matchSrc})`);
      continue;
    }
    const tag = m[0];
    let newTag;
    if(/\bintegrity=/i.test(tag)){
      newTag = tag.replace(/\bintegrity=["'][^"']*["']/i, `integrity="${sri}"`);
    } else {
      // crossorigin 앞에 integrity 삽입 (없으면 src 뒤)
      if(/\bcrossorigin=/i.test(tag)){
        newTag = tag.replace(/\bcrossorigin=/i, `integrity="${sri}" crossorigin=`);
      } else {
        newTag = tag.replace(/></, ` integrity="${sri}"><`);
      }
    }
    if(newTag !== tag){
      html = html.replace(tag, newTag);
      changes++;
      console.log(`✓ ${t.label}: ${sri.slice(0, 20)}…`);
    } else {
      console.log(`= ${t.label}: 이미 최신`);
    }
  }
  if(changes > 0){
    writeFileSync(HTML_PATH, html);
    console.log(`\nindex.html 업데이트 — integrity ${changes} 개 변경`);
  } else {
    console.log('\n변경 없음');
  }
  return changes;
}

main().catch(e => { console.error(e); process.exit(1); });

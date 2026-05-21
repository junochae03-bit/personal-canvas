// 가벼운 자체 lint — 외부 의존 0, Node 내장 fs만 사용.
// ESLint 미설치 환경에서도 핵심 안티패턴을 막기 위한 미니멀 검증.
// 검증 항목 (모두 코드베이스 합의):
//   1. eval / new Function 금지 (보안)
//   2. var 금지 (let/const 강제)
//   3. js/pure/* 에는 window/document/localStorage 참조 금지 (순수성)
//   4. 빈 catch 신규 추가 금지 (`catch(_){}` 형태) — _swallow 헬퍼 사용 권장
//   5. CSP 메타 태그 존재 확인
//   6. index.html 외부 <script src=...> 는 모두 crossorigin 속성 필수
//
// 종료 코드: 0=pass, 1=fail. CI 에서 npm run lint 로 호출.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
let failures = 0;
const fail = (file, msg) => { console.error(`✗ ${file}: ${msg}`); failures++; };
const ok = msg => console.log(`✓ ${msg}`);

function walk(dir, out = []){
  for(const name of readdirSync(dir)){
    const p = join(dir, name);
    const s = statSync(p);
    if(s.isDirectory()){
      if(name === '.git' || name === 'node_modules') continue;
      walk(p, out);
    } else {
      out.push(p);
    }
  }
  return out;
}

const allFiles = walk(ROOT);
const jsFiles = allFiles.filter(p => /\.m?js$/.test(p) && !p.includes('/node_modules/') && !p.endsWith('/tools/lint.mjs'));
const htmlFiles = allFiles.filter(p => p.endsWith('.html'));
const pureFiles = allFiles.filter(p => p.includes('/js/pure/') && p.endsWith('.mjs'));

// 1. eval / new Function (소스 코드에서만 — 문자열 컨텐츠도 포함되니 보수적)
for(const f of [...jsFiles, ...htmlFiles]){
  const src = readFileSync(f, 'utf8');
  // 정규식 안의 'eval' 같은 false positive 방지: 단어 경계 + (
  if(/\beval\s*\(/.test(src.replace(/<!--[\s\S]*?-->/g, ''))){
    fail(f, 'eval( 사용 금지');
  }
  if(/\bnew\s+Function\s*\(/.test(src)){
    fail(f, 'new Function( 사용 금지');
  }
}

// 2. var 금지 (.mjs 만 — 인라인 JS 는 legacy 코드라 점진 마이그레이션)
for(const f of jsFiles){
  if(!f.endsWith('.mjs')) continue;
  const src = readFileSync(f, 'utf8');
  // 주석/문자열 제외 단순화: \bvar 가 \s*[a-zA-Z_$] 로 이어지는 문장
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    if(/^\s*var\s+[a-zA-Z_$]/.test(ln)){
      fail(f, `L${i+1} var 선언 — let/const 사용`);
    }
  });
}

// 3. js/pure/* 순수성 — DOM/스토리지 참조 금지
const FORBIDDEN_IN_PURE = ['window.', 'document.', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator.'];
for(const f of pureFiles){
  const src = readFileSync(f, 'utf8');
  for(const tok of FORBIDDEN_IN_PURE){
    if(src.includes(tok)){
      fail(f, `pure 모듈에 ${tok} 참조 (DOM/스토리지 의존 금지)`);
    }
  }
}

// 4. 신규 빈 catch — 화이트리스트(_swallow / vibrate / focus / scrollIntoView 같은 best-effort)
//    index.html 의 기존 17 케이스는 점진 정리 중이므로 카운트만 보고 경고.
for(const f of [...jsFiles, ...htmlFiles]){
  const src = readFileSync(f, 'utf8');
  const matches = [...src.matchAll(/catch\s*\(\s*_?\s*\)\s*\{\s*\}/g)];
  if(f.endsWith('.mjs') && matches.length > 0){
    fail(f, `빈 catch ${matches.length}개 — _swallow(e, ctx) 사용 권장`);
  }
}

// 5. index.html CSP 메타 + 외부 script crossorigin
for(const f of htmlFiles){
  const src = readFileSync(f, 'utf8');
  if(!/<meta\s+http-equiv=["']Content-Security-Policy["']/i.test(src)){
    fail(f, 'CSP <meta http-equiv="Content-Security-Policy"> 누락');
  }
  // <script src="http..."> 마다 crossorigin 속성 확인
  const scripts = [...src.matchAll(/<script\b[^>]*\bsrc=["']https?:\/\/[^"']+["'][^>]*>/gi)];
  for(const m of scripts){
    if(!/crossorigin/i.test(m[0])){
      fail(f, `외부 script 에 crossorigin 누락: ${m[0].slice(0, 100)}`);
    }
  }
}

// 6. 단일 소스 강제 — index.html 인라인이 js/pure/* 의 핵심 함수와 시그니처/로직 일치해야.
//    .mjs 의 export 제거 + 공백 정규화 후 인라인 본문에 substring 포함되는지 확인.
function normalizeFn(src){
  return src
    .replace(/^\s*export\s+/gm, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function extractFn(src, name){
  // function name(...){ ... } 의 본문 추출 (단순 brace balance)
  const re = new RegExp(`function\\s+${name}\\s*\\(([^)]*)\\)\\s*\\{`);
  const m = src.match(re);
  if(!m) return null;
  let depth = 1, i = m.index + m[0].length;
  while(i < src.length && depth > 0){
    if(src[i] === '{') depth++;
    else if(src[i] === '}') depth--;
    i++;
  }
  return src.slice(m.index, i);
}
const MIRRORED = [
  {mod: 'js/pure/prompt.mjs', fn: 'parseFreePromptTokens'},
  {mod: 'js/pure/prompt.mjs', fn: 'dedupePromptTags'},
  {mod: 'js/pure/korean.mjs', fn: 'toChosung'},
  {mod: 'js/pure/korean.mjs', fn: 'isAllChosung'},
  {mod: 'js/pure/korean.mjs', fn: 'koMatch'},
];
const inlineSrc = readFileSync(join(ROOT, 'index.html'), 'utf8');
for(const {mod, fn} of MIRRORED){
  const modSrc = readFileSync(join(ROOT, mod), 'utf8');
  const modFn = extractFn(modSrc, fn);
  const inlineFn = extractFn(inlineSrc, fn);
  if(!modFn) { fail(mod, `${fn} 함수를 찾을 수 없음`); continue; }
  if(!inlineFn) { fail('index.html', `${fn} 인라인 미러 누락 — ${mod} 와 동기화 필요`); continue; }
  if(normalizeFn(modFn) !== normalizeFn(inlineFn)){
    fail('index.html', `${fn} 인라인이 ${mod} 와 불일치 — 단일 소스 위반`);
  }
}

// 6. 결과 요약
if(failures === 0){
  ok(`lint passed — ${jsFiles.length} JS files, ${htmlFiles.length} HTML files`);
  process.exit(0);
} else {
  console.error(`\n✗ lint failed — ${failures} issue(s)`);
  process.exit(1);
}

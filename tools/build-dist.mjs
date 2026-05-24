// dist/ 디렉터리에 네이티브 앱(Capacitor) 또는 정적 호스팅용 웹 자산 복사.
// 의존성 0 — Node 내장 fs 만 사용. node tools/build-dist.mjs 로 실행.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DIST = join(ROOT, 'dist');

// 복사할 자산 — Capacitor webDir 가 가리키는 위치에 그대로 배치
const ASSETS = [
  'index.html',
  'sw.js',
  'tags-danbooru.json',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
];
const DIRS = [
  'js',   // js/pure/*.mjs — 인라인 동형 모듈
];

function copyDir(src, dst){
  mkdirSync(dst, {recursive: true});
  for(const name of readdirSync(src)){
    const sp = join(src, name);
    const dp = join(dst, name);
    const s = statSync(sp);
    if(s.isDirectory()) copyDir(sp, dp);
    else copyFileSync(sp, dp);
  }
}

function main(){
  if(existsSync(DIST)) rmSync(DIST, {recursive: true, force: true});
  mkdirSync(DIST, {recursive: true});
  for(const f of ASSETS){
    const src = join(ROOT, f);
    if(!existsSync(src)){
      console.error(`✗ 자산 누락: ${f}`);
      process.exit(1);
    }
    copyFileSync(src, join(DIST, f));
    console.log(`✓ ${f}`);
  }
  for(const d of DIRS){
    const src = join(ROOT, d);
    if(!existsSync(src)) continue;
    copyDir(src, join(DIST, d));
    console.log(`✓ ${d}/`);
  }
  console.log(`\n✓ dist 빌드 완료 → ${DIST}`);
}

main();

// 순수 함수 단위 테스트 — Node 18+ 내장 test runner 사용
// 실행: npm test  (또는 node --test test/)
//
// ⚠ fmtDate 테스트는 로컬 TZ 의존이므로 npm test 가 TZ=UTC 로 고정 (package.json).
//   직접 `node --test` 호출 시에도 동일 TZ 가정.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { esc, clamp, fmtBytes, fmtDate, debounce, BYTES_KB, BYTES_MB, BYTES_GB } from '../js/pure/utils.mjs';
import { parseFreePromptTokens, dedupePromptTags, parseSeqInput } from '../js/pure/prompt.mjs';
import { getCharGroup, groupCharsByWork } from '../js/pure/chars.mjs';
import { RAND_SEED_MAX, randomSeed, parseSeedInput } from '../js/pure/seed.mjs';
import { MEGAPIXEL, isSmallTier, aspectRatio, snapTo8 } from '../js/pure/image.mjs';

// ────────────── utils ──────────────
test('esc: HTML 특수문자 5종 이스케이프', () => {
  assert.equal(esc('<div class="a">b&c\'</div>'),
    '&lt;div class=&quot;a&quot;&gt;b&amp;c&#39;&lt;/div&gt;');
});
test('esc: null/undefined → 빈 문자열', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

test('clamp: 범위 밖은 끝값으로 잘림', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('fmtBytes: 단위 전환', () => {
  assert.equal(fmtBytes(512), '512B');
  assert.equal(fmtBytes(2048), '2.0KB');
  assert.equal(fmtBytes(3 * 1048576), '3.0MB');
  assert.equal(fmtBytes(2 * 1073741824), '2.00GB');
});

test('fmtDate: M/D HH:MM 포맷 (TZ=UTC 가정)', () => {
  // package.json 의 test 스크립트가 TZ=UTC 설정 — 로컬에서도 동일하게.
  // UTC 2026-05-19 07:05 → 5/19 07:05
  const ts = Date.UTC(2026, 4, 19, 7, 5);
  assert.equal(fmtDate(ts), '5/19 07:05');
});

test('BYTES_* 상수: KB/MB/GB 정의', () => {
  assert.equal(BYTES_KB, 1024);
  assert.equal(BYTES_MB, 1024 * 1024);
  assert.equal(BYTES_GB, 1024 * 1024 * 1024);
});

test('debounce: 마지막 호출만 실행', async () => {
  let calls = 0;
  const f = debounce(() => calls++, 30);
  f(); f(); f();
  await new Promise(r => setTimeout(r, 60));
  assert.equal(calls, 1);
});

// ────────────── prompt ──────────────
test('parseFreePromptTokens: 단순 콤마 분리', () => {
  assert.deepEqual(parseFreePromptTokens('a, b, c'), ['a','b','c']);
});
test('parseFreePromptTokens: 가중치 내부 콤마 보호', () => {
  assert.deepEqual(parseFreePromptTokens('1.3::red, blue::, green'),
    ['1.3::red, blue::', 'green']);
});
test('parseFreePromptTokens: 빈 토큰·공백 제거', () => {
  assert.deepEqual(parseFreePromptTokens('a, ,  , b'), ['a','b']);
});

test('dedupePromptTags: 대소문자·공백 정규화 후 중복 제거', () => {
  assert.equal(dedupePromptTags('Red, red, RED, blue'), 'Red, blue');
  assert.equal(dedupePromptTags('hello  world, Hello World'), 'hello  world');
});
test('dedupePromptTags: 빈 입력 그대로', () => {
  assert.equal(dedupePromptTags(''), '');
  assert.equal(dedupePromptTags('   '), '   ');
});

test('parseSeqInput: ## 헤더 블록 분리', () => {
  const r = parseSeqInput('## A\nprompt1\n## B\nprompt2');
  assert.deepEqual(r, [
    {label:'A', prompt:'prompt1'},
    {label:'B', prompt:'prompt2'},
  ]);
});
test('parseSeqInput: 빈 라벨 → BlockN 자동', () => {
  const r = parseSeqInput('## \nfoo\n##\nbar');
  assert.equal(r[0].label, 'Block1');
  assert.equal(r[1].label, 'Block2');
});
test('parseSeqInput: 빈 프롬프트 블록 제거', () => {
  const r = parseSeqInput('## A\n\n## B\nbar');
  assert.equal(r.length, 1);
  assert.equal(r[0].label, 'B');
});

// ────────────── chars ──────────────
test('getCharGroup: 대괄호 prefix 우선', () => {
  assert.equal(getCharGroup('[원신] 푸리나'), '원신');
  assert.equal(getCharGroup('[ LWA ] 앗코'), 'LWA');
});
test('getCharGroup: 첫 _ 앞 토큰', () => {
  assert.equal(getCharGroup('붕스_삼칠_존호'), '붕스');
  assert.equal(getCharGroup('LWA_앗코'), 'LWA');
});
test('getCharGroup: 패턴 없음 → 기타', () => {
  assert.equal(getCharGroup('캐릭터1'), '기타');
  assert.equal(getCharGroup(''), '기타');
  assert.equal(getCharGroup(null), '기타');
});

test('groupCharsByWork: 3명 미만 그룹은 기타로 흡수', () => {
  const list = [
    {name:'[원신] 푸리나'}, {name:'[원신] 호두'}, {name:'[원신] 종려'},  // 3명 → 별도 그룹
    {name:'[블루] 시로코'}, {name:'[블루] 호시노'},  // 2명 → 기타
    {name:'단독캐릭'},  // 패턴 없음 → 기타
  ];
  const r = groupCharsByWork(list);
  const names = r.map(g => g.group);
  assert.deepEqual(names, ['원신', '기타']);  // 원신 먼저(많음), 기타 마지막
  assert.equal(r[0].items.length, 3);
  assert.equal(r[1].items.length, 3);  // 블루 2 + 단독 1
});

test('groupCharsByWork: 그룹 내부 이름순 정렬', () => {
  const list = [
    {name:'[원신] 푸리나'}, {name:'[원신] 가나'}, {name:'[원신] 나비아'},
  ];
  const r = groupCharsByWork(list);
  const order = r[0].items.map(p => p.name);
  assert.deepEqual(order, ['[원신] 가나', '[원신] 나비아', '[원신] 푸리나']);
});

test('groupCharsByWork: 빈 입력 → 빈 결과', () => {
  assert.deepEqual(groupCharsByWork([]), []);
});

test('groupCharsByWork: 그룹 정렬 — 항목수 내림차순, 기타 마지막', () => {
  const list = [
    // A: 5명, B: 4명, 기타: 3명 (2개 작은 그룹 + 1 단독)
    {name:'[A]1'}, {name:'[A]2'}, {name:'[A]3'}, {name:'[A]4'}, {name:'[A]5'},
    {name:'[B]1'}, {name:'[B]2'}, {name:'[B]3'}, {name:'[B]4'},
    {name:'[C]1'}, {name:'[C]2'},  // 2명 → 기타
    {name:'단독'},
  ];
  const r = groupCharsByWork(list);
  assert.deepEqual(r.map(g => g.group), ['A', 'B', '기타']);
  assert.equal(r[0].items.length, 5);
  assert.equal(r[1].items.length, 4);
  assert.equal(r[2].items.length, 3);
});

// ────────────── seed ──────────────
test('RAND_SEED_MAX: uint32 max', () => {
  assert.equal(RAND_SEED_MAX, 0xFFFFFFFF);
});
test('randomSeed: 0..uint32 정수 범위', () => {
  const s = randomSeed();
  assert.equal(Number.isInteger(s), true);
  assert.ok(s >= 0 && s <= RAND_SEED_MAX);
});
test('randomSeed: 결정적 rng 주입 가능', () => {
  assert.equal(randomSeed(() => 0), 0);
  // rng → 0.5 면 결과는 MAX의 절반 근처 (Math.floor 영향 ±1)
  const half = randomSeed(() => 0.5);
  assert.ok(half >= Math.floor(RAND_SEED_MAX * 0.5) - 1 && half <= Math.floor(RAND_SEED_MAX * 0.5) + 1);
});
test('parseSeedInput: 빈/-1/null → 새 랜덤', () => {
  const fixedRng = () => 0.5;
  assert.equal(parseSeedInput('', fixedRng), Math.floor(0.5 * RAND_SEED_MAX));
  assert.equal(parseSeedInput('-1', fixedRng), Math.floor(0.5 * RAND_SEED_MAX));
  assert.equal(parseSeedInput(null, fixedRng), Math.floor(0.5 * RAND_SEED_MAX));
});
test('parseSeedInput: 유효 정수 그대로', () => {
  assert.equal(parseSeedInput('12345'), 12345);
  assert.equal(parseSeedInput('0'), 0);
});
test('parseSeedInput: 비숫자·음수 → 랜덤 폴백', () => {
  const fixedRng = () => 0;
  assert.equal(parseSeedInput('abc', fixedRng), 0);
  assert.equal(parseSeedInput('-42', fixedRng), 0);
});

// ────────────── image ──────────────
test('MEGAPIXEL: 1024*1024', () => {
  assert.equal(MEGAPIXEL, 1048576);
});
test('isSmallTier: 1MP & 28 steps 경계', () => {
  assert.equal(isSmallTier(1024, 1024, 28), true);
  assert.equal(isSmallTier(1024, 1024, 29), false);
  assert.equal(isSmallTier(1025, 1024, 28), false);
  assert.equal(isSmallTier(512, 768, 20), true);
});
test('aspectRatio: gcd 단순화', () => {
  assert.equal(aspectRatio(1920, 1080), '16:9');
  assert.equal(aspectRatio(1024, 1024), '1:1');
  assert.equal(aspectRatio(832, 1216), '13:19');
  assert.equal(aspectRatio(0, 100), '');
});
test('snapTo8: 8의 배수로 반올림 + 최소 64', () => {
  assert.equal(snapTo8(100), 104);
  assert.equal(snapTo8(96), 96);
  assert.equal(snapTo8(10), 64);   // floor
  assert.equal(snapTo8(0), 64);
});

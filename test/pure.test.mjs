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
import { toChosung, isAllChosung, koMatch, highlightMatch } from '../js/pure/korean.mjs';
import { pickFirst, sanitizeCharacter, sanitizeCharacters, extractNaiFields } from '../js/pure/naiMeta.mjs';
import { expandRandomChoices, listRandomChoices, countRandomCombinations, hasCameraAngle, pickWeightedOption, guessCategoryLabel, compileCategoriesToText } from '../js/pure/randomChoice.mjs';

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

// ────────────── korean ──────────────
test('toChosung: 한글 음절 → 초성', () => {
  assert.equal(toChosung('푸리나'), 'ㅍㄹㄴ');
  assert.equal(toChosung('마스터'), 'ㅁㅅㅌ');
  assert.equal(toChosung('붕스타'), 'ㅂㅅㅌ');
  assert.equal(toChosung('가'), 'ㄱ');
  assert.equal(toChosung('나비아'), 'ㄴㅂㅇ');
});
test('toChosung: 비한글은 그대로', () => {
  assert.equal(toChosung('Naga'), 'Naga');
  assert.equal(toChosung('hi 푸리나'), 'hi ㅍㄹㄴ');
  assert.equal(toChosung(''), '');
  assert.equal(toChosung(null), '');
});
test('isAllChosung: ㄱ-ㅎ + 공백만 true', () => {
  assert.equal(isAllChosung('ㅍㄹㄴ'), true);
  assert.equal(isAllChosung('ㅁㅅ'), true);
  assert.equal(isAllChosung('ㅍㄹㄴ '), true);
  assert.equal(isAllChosung('푸리나'), false);
  assert.equal(isAllChosung('hi'), false);
  assert.equal(isAllChosung('ㅍㅏ'), false);   // 모음 포함
  assert.equal(isAllChosung(''), false);
});
test('koMatch: 직접 매칭 우선', () => {
  assert.deepEqual(koMatch('푸리나', '푸리'), {match: true, kind: 'exact'});
  assert.deepEqual(koMatch('Furina', 'fur'), {match: true, kind: 'exact'});
});
test('koMatch: 초성 매칭은 쿼리가 전부 자음일 때만', () => {
  assert.deepEqual(koMatch('푸리나', 'ㅍㄹㄴ'), {match: true, kind: 'chosung'});
  assert.deepEqual(koMatch('마스터피스', 'ㅁㅅ'), {match: true, kind: 'chosung'});
  assert.deepEqual(koMatch('푸리나', 'ㄱㄴ'), {match: false, kind: 'none'});
  // 쿼리가 완성형 한글이면 초성 검색 안 함 (정확 매칭만)
  assert.deepEqual(koMatch('푸리나', '리나'), {match: true, kind: 'exact'});
});
test('koMatch: 빈 쿼리는 항상 매칭', () => {
  assert.deepEqual(koMatch('whatever', ''), {match: true, kind: 'exact'});
  assert.deepEqual(koMatch('', 'q'), {match: false, kind: 'none'});
});
test('highlightMatch: 직접 매칭 부분만 <mark>', () => {
  assert.equal(highlightMatch('푸리나', '리'), '푸<mark>리</mark>나');
  assert.equal(highlightMatch('Furina', 'rin'), 'Fu<mark>rin</mark>a');
});
test('highlightMatch: 초성 매칭은 전체 <mark>', () => {
  assert.equal(highlightMatch('푸리나', 'ㅍㄹㄴ'), '<mark>푸리나</mark>');
});
test('highlightMatch: HTML escape 적용', () => {
  assert.equal(highlightMatch('<script>', 'cr'), '&lt;s<mark>cr</mark>ipt&gt;');
});
test('highlightMatch: 빈 쿼리는 escape만', () => {
  assert.equal(highlightMatch('a<b', ''), 'a&lt;b');
});

// ────────────── naiMeta ──────────────
test('pickFirst: 후보 키 중 null/빈문자 아닌 첫 값', () => {
  const obj = {prompt: 'hi', neg: '', uc: 'ng', extra: null};
  assert.equal(pickFirst(obj, 'missing', 'prompt'), 'hi');
  assert.equal(pickFirst(obj, 'neg', 'uc'), 'ng');   // 빈문자 스킵
  assert.equal(pickFirst(obj, 'extra', 'missing'), null);
  assert.equal(pickFirst(null, 'a'), null);
});

test('sanitizeCharacter: 모든 문자열 slice + pos clamp', () => {
  const long = 'x'.repeat(5000);
  const c = sanitizeCharacter({
    name: long, appearance: long, action: long, neg: long, prompt: long,
    pos: {x: 5, y: -2},
  });
  assert.equal(c.name.length, 80);
  assert.equal(c.appearance.length, 2000);
  assert.equal(c.prompt.length, 4000);
  assert.equal(c.pos.x, 1);
  assert.equal(c.pos.y, 0);
  assert.equal(c.enabled, true);
});

test('sanitizeCharacter: pool 50개 cap + 항목 정제', () => {
  const pool = Array.from({length: 100}, (_, i) => ({name: `p${i}`, appearance: 'a'.repeat(3000)}));
  const c = sanitizeCharacter({pool});
  assert.equal(c.pool.length, 50);
  assert.equal(c.pool[0].appearance.length, 2000);
});

test('sanitizeCharacter: 결손/null 안전', () => {
  const c1 = sanitizeCharacter(null);
  assert.equal(c1.name, '');
  assert.deepEqual(c1.pos, {x: 0.5, y: 0.5});
  assert.deepEqual(c1.pool, []);
  const c2 = sanitizeCharacter({enabled: false});
  assert.equal(c2.enabled, false);
});

test('sanitizeCharacters: 6명 cap', () => {
  const arr = Array.from({length: 10}, (_, i) => ({name: `c${i}`}));
  const out = sanitizeCharacters(arr);
  assert.equal(out.length, 6);
  const out2 = sanitizeCharacters(arr, 3);
  assert.equal(out2.length, 3);
});

test('sanitizeCharacters: 비배열 → 빈배열', () => {
  assert.deepEqual(sanitizeCharacters(null), []);
  assert.deepEqual(sanitizeCharacters('x'), []);
});

test('extractNaiFields: NAI 내부 + 공식 포맷 모두 커버', () => {
  const v1 = extractNaiFields({prompt: 'A', neg: 'B', seed: 42, steps: '28', cfg: '5.5', model: 'nai-diffusion-4', sampler: 'k_euler', w: 1024, h: 1024});
  assert.equal(v1.prompt, 'A');
  assert.equal(v1.neg, 'B');
  assert.equal(v1.seed, 42);
  assert.equal(v1.steps, 28);
  assert.equal(v1.cfg, 5.5);
  assert.equal(v1.model, 'nai-diffusion-4');
  assert.equal(v1.width, 1024);
  assert.equal(v1.height, 1024);
});

test('extractNaiFields: A1111 호환 (negative_prompt/width)', () => {
  const v = extractNaiFields({prompt: 'A', negative_prompt: 'N', width: 768, height: 1024});
  assert.equal(v.neg, 'N');
  assert.equal(v.width, 768);
});

test('extractNaiFields: characters 자동 정제', () => {
  const v = extractNaiFields({
    prompt: 'P',
    characters: [{name: 'C1', appearance: 'x'.repeat(3000)}, {name: 'C2'}],
  });
  assert.equal(v.characters.length, 2);
  assert.equal(v.characters[0].appearance.length, 2000);
});

test('extractNaiFields: 잘못된 값 무시 (NaN seed, 빈 모델)', () => {
  const v = extractNaiFields({seed: 'abc', model: '', cfg: 'oops'});
  assert.equal(v.seed, undefined);
  assert.equal(v.model, undefined);
  assert.equal(v.cfg, undefined);
});

test('extractNaiFields: null/non-object 안전', () => {
  assert.deepEqual(extractNaiFields(null), {});
  assert.deepEqual(extractNaiFields('x'), {});
});

// ────────────── randomChoice ──────────────
test('expandRandomChoices: 단일 옵션', () => {
  assert.equal(expandRandomChoices('||A||', () => 0), 'A');
});
test('expandRandomChoices: 결정적 rng 로 옵션 선택', () => {
  const text = '||A|B|C||';
  assert.equal(expandRandomChoices(text, () => 0), 'A');
  assert.equal(expandRandomChoices(text, () => 0.5), 'B');
  assert.equal(expandRandomChoices(text, () => 0.99), 'C');
});
test('expandRandomChoices: 빈 옵션 = 빈 문자열', () => {
  // ||A|B| || → 4 옵션 중 마지막은 공백 → trim 시 빈 문자열
  assert.equal(expandRandomChoices('||A|B| ||', () => 0.99), '');
  assert.equal(expandRandomChoices('||A| ||', () => 0.99), '');
});
test('expandRandomChoices: 옵션 안 콤마 보존', () => {
  assert.equal(expandRandomChoices('||a, b|c, d||', () => 0), 'a, b');
  assert.equal(expandRandomChoices('||a, b|c, d||', () => 0.6), 'c, d');
});
test('expandRandomChoices: 가중치 표기 ::tag:: 보존', () => {
  assert.equal(expandRandomChoices('||2::angel::|2::demon::||', () => 0), '2::angel::');
  assert.equal(expandRandomChoices('||2::asymmetrical eyes::, -1::heterochromia::|empty eyes||', () => 0),
    '2::asymmetrical eyes::, -1::heterochromia::');
});
test('expandRandomChoices: 여러 패턴 같은 텍스트', () => {
  const rngSeq = [0, 0.99];   // 첫 매칭은 0, 둘째 매칭은 0.99
  let i = 0;
  const out = expandRandomChoices('||A|B||, ||X|Y||', () => rngSeq[i++]);
  assert.equal(out, 'A, Y');
});
test('expandRandomChoices: 패턴 없으면 그대로', () => {
  assert.equal(expandRandomChoices('plain prompt, no random', () => 0), 'plain prompt, no random');
  assert.equal(expandRandomChoices('', () => 0), '');
  assert.equal(expandRandomChoices(null, () => 0), null);
});
test('expandRandomChoices: 옵션 양끝 공백 trim', () => {
  assert.equal(expandRandomChoices('||  A  |  B  ||', () => 0), 'A');
});

test('listRandomChoices: 모든 매칭 + 옵션 수집', () => {
  const list = listRandomChoices('a, ||X|Y|Z||, b, ||P|Q||');
  assert.equal(list.length, 2);
  assert.deepEqual(list[0].options, ['X', 'Y', 'Z']);
  assert.deepEqual(list[1].options, ['P', 'Q']);
});
test('listRandomChoices: 패턴 없으면 빈 배열', () => {
  assert.deepEqual(listRandomChoices('plain'), []);
  assert.deepEqual(listRandomChoices(''), []);
});

test('countRandomCombinations: 옵션 수 곱', () => {
  assert.equal(countRandomCombinations('||A|B|C||, ||X|Y||'), 6);   // 3*2
  assert.equal(countRandomCombinations('||A|B|C|D|E||'), 5);
  assert.equal(countRandomCombinations('no patterns'), 1);
  assert.equal(countRandomCombinations(''), 1);
});

test('hasCameraAngle: 단독 카메라 앵글 감지', () => {
  assert.equal(hasCameraAngle('from above'), true);
  assert.equal(hasCameraAngle('from below'), true);
  assert.equal(hasCameraAngle('low angle, indoors'), true);
  assert.equal(hasCameraAngle('pov'), true);
});
test('hasCameraAngle: 다른 토큰과 결합된 건 안전 (false)', () => {
  assert.equal(hasCameraAngle('sex from behind'), false);
  assert.equal(hasCameraAngle('cat girl'), false);
  assert.equal(hasCameraAngle('smile'), false);
});
test('hasCameraAngle: 가중치 표기 안 본문 검사', () => {
  assert.equal(hasCameraAngle('2::from above::'), true);
  assert.equal(hasCameraAngle('1.5::low angle::'), true);
});
test('hasCameraAngle: null/빈 입력 안전', () => {
  assert.equal(hasCameraAngle(''), false);
  assert.equal(hasCameraAngle(null), false);
  assert.equal(hasCameraAngle(undefined), false);
});

test('pickWeightedOption: 균등 분포 (모두 weight 1)', () => {
  const opts = [{text:'A', weight:1}, {text:'B', weight:1}];
  assert.equal(pickWeightedOption(opts, () => 0).text, 'A');
  assert.equal(pickWeightedOption(opts, () => 0.99).text, 'B');
});
test('pickWeightedOption: 가중치 비례 선택', () => {
  // A=1, B=3 → A 25%, B 75%. rng=0.2 → A, rng=0.5 → B
  const opts = [{text:'A', weight:1}, {text:'B', weight:3}];
  assert.equal(pickWeightedOption(opts, () => 0.2).text, 'A');
  assert.equal(pickWeightedOption(opts, () => 0.5).text, 'B');
  assert.equal(pickWeightedOption(opts, () => 0.99).text, 'B');
});
test('pickWeightedOption: 모두 weight 0 → 균등 fallback', () => {
  const opts = [{text:'A', weight:0}, {text:'B', weight:0}, {text:'C', weight:0}];
  assert.equal(pickWeightedOption(opts, () => 0).text, 'A');
  assert.equal(pickWeightedOption(opts, () => 0.99).text, 'C');
});
test('pickWeightedOption: 빈 옵션 text 그대로 (사용 안 함 의미)', () => {
  const opts = [{text:'A', weight:1}, {text:'', weight:1}];
  assert.equal(pickWeightedOption(opts, () => 0.99).text, '');
});
test('pickWeightedOption: 비배열·빈 배열 → null', () => {
  assert.equal(pickWeightedOption([]), null);
  assert.equal(pickWeightedOption(null), null);
  assert.equal(pickWeightedOption('x'), null);
});

test('guessCategoryLabel: 종족 키워드 매칭', () => {
  const opts = [{text:'horse girl'}, {text:'cat girl'}, {text:'fox girl'}, {text:'elf'}];
  assert.equal(guessCategoryLabel(opts), '🐱 종족');
});
test('guessCategoryLabel: 체위 키워드 매칭', () => {
  const opts = [{text:'missionary'}, {text:'cowgirl position'}, {text:'doggystyle'}];
  assert.equal(guessCategoryLabel(opts), '🎬 체위');
});
test('guessCategoryLabel: 가중치 옵션도 매칭', () => {
  const opts = [{text:'2::angel::'}, {text:'2::fallen angel::'}, {text:'vampire'}];
  assert.equal(guessCategoryLabel(opts), '🐱 종족');
});
test('guessCategoryLabel: 콤마 포함 옵션 (표정)', () => {
  const opts = [
    {text:'tears, crying, closed eyes'},
    {text:'aroused, smile'},
    {text:'ahegao'},
  ];
  assert.equal(guessCategoryLabel(opts), '😢 표정');
});
test('guessCategoryLabel: 약한 매칭은 null', () => {
  const opts = [{text:'foo'}, {text:'bar'}, {text:'baz'}];
  assert.equal(guessCategoryLabel(opts), null);
});
test('guessCategoryLabel: 빈/비배열 → null', () => {
  assert.equal(guessCategoryLabel([]), null);
  assert.equal(guessCategoryLabel(null), null);
});

test('compileCategoriesToText: 활성 카테고리만 ||A|B|C|| 로 직렬화', () => {
  const cats = [
    {enabled: true, options: [{text:'A', weight:1}, {text:'B', weight:1}]},
    {enabled: false, options: [{text:'X', weight:1}]},
    {enabled: true, options: [{text:'P', weight:1}, {text:'Q', weight:1.5}]},
  ];
  assert.equal(compileCategoriesToText(cats), '||A|B||, ||P|1.5::Q::||');
});
test('compileCategoriesToText: 빈 옵션 그대로 인코딩', () => {
  const cats = [{enabled: true, options: [{text:'A', weight:1}, {text:'', weight:1}]}];
  assert.equal(compileCategoriesToText(cats), '||A|||');
});
test('compileCategoriesToText: 옵션 없는 카테고리 생략', () => {
  const cats = [
    {enabled: true, options: []},
    {enabled: true, options: [{text:'A', weight:1}]},
  ];
  assert.equal(compileCategoriesToText(cats), '||A||');
});


// NAI seed 처리 — uint32 범위. 빈 문자열·'-1'·NaN 입력은 새 랜덤 seed 로 폴백.
// index.html 인라인의 `Math.floor(Math.random() * 0xffffffff)` 16회 반복을 단일화.

export const RAND_SEED_MAX = 0xFFFFFFFF;

export function randomSeed(rng){
  const r = (typeof rng === 'function') ? rng() : Math.random();
  return Math.floor(r * RAND_SEED_MAX);
}

/**
 * 사용자 입력(seed) 해석. 빈 문자열/'-1'/null/undefined/비숫자 → 새 랜덤.
 * 음수 정수는 새 랜덤으로 fallback (NAI는 unsigned).
 */
export function parseSeedInput(raw, rng){
  if(raw === '' || raw === '-1' || raw == null) return randomSeed(rng);
  const n = parseInt(raw, 10);
  if(!Number.isFinite(n) || n < 0) return randomSeed(rng);
  return n;
}

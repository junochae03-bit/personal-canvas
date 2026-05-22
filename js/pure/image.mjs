// 이미지 해상도·종횡비 계산 — 순수 함수. NAI 비용 산정/모드 판정에 사용.

export const MEGAPIXEL = 1024 * 1024;     // 1MP = NAI small/normal 분기 기준
export const NAI_MAX_STEPS_SMALL = 28;    // small 모드 최대 steps

/**
 * NAI "small" tier 판정 — 1MP 이하 + steps ≤ 28.
 * 비용 산정 함수 anlasCostFor() 의 일부 로직을 분리.
 */
export function isSmallTier(width, height, steps){
  return (width * height) <= MEGAPIXEL && steps <= NAI_MAX_STEPS_SMALL;
}

/**
 * 종횡비 단순화 — gcd 기반. (1920, 1080) → "16:9"
 */
export function aspectRatio(w, h){
  if(!w || !h) return '';
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const g = gcd(w, h);
  return `${w/g}:${h/g}`;
}

/**
 * 8의 배수로 정렬 — NAI는 8 단위 해상도만 허용.
 */
export function snapTo8(n){
  return Math.max(64, Math.round(n / 8) * 8);
}

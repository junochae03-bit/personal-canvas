// 🃏 와일드카드 __name__ — 프롬프트의 __이름__ 을 해당 목록에서 한 줄 골라 치환.
// dynamic-prompts / NAI 와일드카드 스타일. 선택은 가중치·잠금 지원 (RC 빌더와 동일 모델).
//
// 사용 예:
//   "1girl, __outfit__, __background__"  → 매 생성마다 outfit/background 목록에서 한 줄씩 치환.
//
// 규칙:
// - 이름은 영문/숫자/밑줄/하이픈 ([A-Za-z0-9_-]). 예) people_count, time_weather.
// - 후보(줄) 안의 가중치 캡슐(1.5::tag::)·콤마는 그대로 보존 — "선택 weight" 와는 별개.
// - 알 수 없는 이름(목록 없음/빈 목록)은 토큰을 그대로 둔다 (오타 보존, 무음 삭제 방지).
// - rng 주입 가능 (테스트·결정적 재현).
// - 🔁 중첩 지원 — 옵션 안에 또 __name__ 이 있으면 재귀적으로 한 번 더 풀림.
//   상호/자기참조 무한 루프 방지를 위해 최대 5 단계까지만 (그 이후 토큰 그대로 둠).

// 와일드카드 이름 검증 — import/rename 시 사용.
export const WILDCARD_NAME_RE = /^[A-Za-z0-9_\-]+$/;
const WILDCARD_TOKEN_RE = /__([A-Za-z0-9_\-]+)__/g;

/** 텍스트에서 사용된 와일드카드 이름 목록 (중복 제거, 등장 순서 유지). */
export function extractWildcardNames(text){
  if(!text || typeof text !== 'string') return [];
  const out = [];
  const seen = new Set();
  WILDCARD_TOKEN_RE.lastIndex = 0;
  let m;
  while((m = WILDCARD_TOKEN_RE.exec(text)) !== null){
    const name = m[1];
    if(!seen.has(name)){ seen.add(name); out.push(name); }
  }
  return out;
}

/** 와일드카드 파일(텍스트) → 옵션 배열 [{text, weight}]. 한 줄 = 한 후보. 빈 줄·'#' 주석 제외. */
export function parseWildcardFile(text){
  if(!text || typeof text !== 'string') return [];
  return text.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(line => ({text: line, weight: 1}));
}

/**
 * 와일드카드 1개에서 한 줄 선택.
 *  - locked 이고 lockedIdx 가 유효하면 그 옵션 고정.
 *  - 아니면 가중치 기반 무작위 (weight<=0 은 제외, 모두 0 이면 균등 분포).
 * 반환: 선택된 text (옵션 없으면 '').
 */
export function pickWildcardLine(wc, rng){
  if(!wc) return '';
  const opts = Array.isArray(wc.options) ? wc.options : [];
  if(!opts.length) return '';
  const random = (typeof rng === 'function') ? rng : Math.random;
  if(wc.locked && Number.isInteger(wc.lockedIdx) && opts[wc.lockedIdx]){
    return String(opts[wc.lockedIdx].text || '');
  }
  const total = opts.reduce((s, o) => s + Math.max(0, Number(o?.weight) || 0), 0);
  if(total <= 0){
    return String(opts[Math.floor(random() * opts.length)]?.text || '');
  }
  const target = random() * total;
  let acc = 0;
  for(const o of opts){
    acc += Math.max(0, Number(o?.weight) || 0);
    if(target < acc) return String(o.text || '');
  }
  return String(opts[opts.length - 1]?.text || '');
}

/**
 * 텍스트의 모든 __name__ 치환. resolve(name) → 와일드카드 객체 {options,locked,lockedIdx} | null.
 *  - resolve 가 null/빈 옵션을 주면 토큰을 그대로 둔다.
 *  - onPick(name, picked) 콜백을 주면 치환 발생할 때마다 호출 — 메타 로그용.
 *  - 🔁 옵션 안에 또 __name__ 이 있으면 재귀 확장. _depth 는 내부 안전장치 (호출자 X).
 */
export function expandWildcards(text, resolve, rng, onPick, _depth){
  if(!text || typeof text !== 'string') return text;
  if(typeof resolve !== 'function') return text;
  const depth = (_depth | 0);
  if(depth >= 5) return text;
  return text.replace(WILDCARD_TOKEN_RE, (full, name) => {
    const wc = resolve(name);
    if(!wc || !Array.isArray(wc.options) || !wc.options.length) return full;
    const picked = pickWildcardLine(wc, rng);
    if(typeof onPick === 'function') onPick(name, picked);
    return expandWildcards(picked, resolve, rng, onPick, depth + 1);
  });
}

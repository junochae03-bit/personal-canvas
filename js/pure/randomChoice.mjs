// 🎲 NovelAI 동적 선택 문법 `||A|B|C||` — 매 호출마다 옵션 중 하나를 무작위 선택.
//
// 사용 예:
//   "a, ||X|Y|Z||, b"  → "a, X, b"  또는 "a, Y, b"  또는 "a, Z, b"
//   "||A|B| ||"        → "A" 또는 "B" 또는 ""  (마지막 공백 = 아무것도 사용 안 함)
//
// 규칙:
// - 옵션 분리자는 `|`. 옵션 안 콤마(,) 와 가중치 `2::tag::` 는 그대로 유지.
// - 옵션 양끝 공백은 trim. 빈 옵션은 ""(no-op).
// - 중첩된 ||...|| 는 지원 안 함 (단순 lazy 매칭).
// - 패턴 없으면 원본 그대로.
// - rng 주입 가능 (테스트·결정적 시드 재현).

const RC_PATTERN = /\|\|([^|]*(?:\|[^|]*)*?)\|\|/g;

export function expandRandomChoices(text, rng){
  if(!text || typeof text !== 'string') return text;
  const random = (typeof rng === 'function') ? rng : Math.random;
  return text.replace(RC_PATTERN, (full, inner) => {
    if(inner == null) return '';
    const options = inner.split('|');
    if(options.length === 0) return '';
    const choice = options[Math.floor(random() * options.length)];
    return (choice || '').trim();
  });
}

/**
 * 디버그용 — 텍스트의 모든 ||...|| 매칭과 그 옵션 목록을 수집.
 * 반환: [{offset, full, options: string[]}, ...]
 * UI 미리보기 ("어떤 옵션이 뽑힐 수 있는지") 또는 검증 용도.
 */
export function listRandomChoices(text){
  if(!text || typeof text !== 'string') return [];
  const out = [];
  let m;
  RC_PATTERN.lastIndex = 0;
  while((m = RC_PATTERN.exec(text)) !== null){
    const inner = m[1] == null ? '' : m[1];
    const options = inner.split('|').map(s => s.trim());
    out.push({offset: m.index, full: m[0], options});
  }
  return out;
}

/**
 * 전체 텍스트에서 가능한 조합의 총 수 (단순 곱셈).
 * 예: 3 패턴 × (4, 5, 3) 옵션 → 60. UI 미리보기에 카운트 표시용.
 * 패턴 0개면 1 반환 (= 한 가지 결과만 가능).
 */
export function countRandomCombinations(text){
  const list = listRandomChoices(text);
  if(!list.length) return 1;
  return list.reduce((acc, x) => acc * Math.max(1, x.options.length), 1);
}

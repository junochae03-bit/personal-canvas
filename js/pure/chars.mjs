// 캐릭터 프리셋 그룹화 — 작품/시리즈별 자동 묶음.
// 규칙: 같은 작품 prefix가 MIN_GROUP_SIZE 명 이상일 때만 별도 그룹, 미만은 "기타"로 흡수.

const MIN_GROUP_SIZE = 3;
const MISC = '기타';

/**
 * 캐릭터 이름에서 작품/시리즈 그룹을 추출.
 * 우선순위: [XXX] 대괄호 prefix → 첫 _ 앞 토큰 → MISC
 * 예) "[원신] 푸리나" → "원신"
 *     "붕스_삼칠_존호"  → "붕스"
 *     "캐릭터1"        → MISC
 */
export function getCharGroup(name){
  if(!name) return MISC;
  const trimmed = String(name).trim();
  const bracket = /^\[([^\]]+)\]/.exec(trimmed);
  if(bracket) return bracket[1].trim();
  const us = trimmed.indexOf('_');
  if(us > 0 && us < trimmed.length - 1) return trimmed.slice(0, us).trim();
  return MISC;
}

/**
 * 캐릭터 목록을 작품별로 묶음. 3명 미만 그룹은 "기타"로 통합.
 * 그룹 정렬: 항목수 내림차순, 동률 시 한글 가나다순. "기타"는 항상 마지막.
 * 그룹 내부: 이름순.
 */
export function groupCharsByWork(list){
  const map = new Map();
  for(const p of list){
    const g = getCharGroup(p.name);
    if(!map.has(g)) map.set(g, []);
    map.get(g).push(p);
  }
  const misc = map.get(MISC) || [];
  for(const [g, items] of [...map.entries()]){
    if(g === MISC) continue;
    if(items.length < MIN_GROUP_SIZE){
      misc.push(...items);
      map.delete(g);
    }
  }
  if(misc.length) map.set(MISC, misc);
  const arr = [...map.entries()].map(([group, items]) => ({group, items}));
  arr.sort((a, b) => {
    if(a.group === MISC) return 1;
    if(b.group === MISC) return -1;
    return b.items.length - a.items.length || a.group.localeCompare(b.group, 'ko');
  });
  for(const g of arr){ g.items.sort((a,b) => (a.name||'').localeCompare(b.name||'', 'ko')); }
  return arr;
}

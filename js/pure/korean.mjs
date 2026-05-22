// 한국어 검색 유틸 — 초성 검색 + 대소문자/공백 정규화.
// "ㅍㄹㄴ" 으로 "푸리나" 매칭, "마스" 로 "마스터피스" 매칭.
//
// 한글 음절 (U+AC00 ~ U+D7A3) → 초성 19개:
//   ㄱ ㄲ ㄴ ㄷ ㄸ ㄹ ㅁ ㅂ ㅃ ㅅ ㅆ ㅇ ㅈ ㅉ ㅊ ㅋ ㅌ ㅍ ㅎ
//   syllable_index = (code - 0xAC00) // 588
//   ※ 588 = 21 (중성) × 28 (종성 포함)

const HANGUL_CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const HANGUL_SYL_START = 0xAC00;
const HANGUL_SYL_END = 0xD7A3;
const HANGUL_SYL_PER_CHO = 588;   // 21 × 28

/** 문자열의 한글 음절을 초성으로 치환. 비한글 문자는 그대로 유지. */
export function toChosung(s){
  if(!s) return '';
  let out = '';
  for(let i = 0; i < s.length; i++){
    const c = s.charCodeAt(i);
    if(c >= HANGUL_SYL_START && c <= HANGUL_SYL_END){
      const idx = Math.floor((c - HANGUL_SYL_START) / HANGUL_SYL_PER_CHO);
      out += HANGUL_CHO[idx];
    } else {
      out += s[i];
    }
  }
  return out;
}

/** 쿼리가 전부 한글 자음(ㄱ~ㅎ) 또는 공백이면 true → 초성 검색 모드. */
export function isAllChosung(s){
  if(!s) return false;
  return /^[ㄱ-ㅎ\s]+$/.test(s);
}

/**
 * 검색 매칭 — 우선순위:
 *   1) target 에 query 직접 포함 (대소문자 무시)
 *   2) query 가 전부 한글 자음일 때, target 의 초성에 포함
 * 반환: {match: bool, kind: 'exact'|'chosung'|'none'}
 */
export function koMatch(target, query){
  if(!query) return {match: true, kind: 'exact'};
  if(!target) return {match: false, kind: 'none'};
  const t = String(target).toLowerCase();
  const q = String(query).toLowerCase();
  if(t.includes(q)) return {match: true, kind: 'exact'};
  if(isAllChosung(q)){
    if(toChosung(t).includes(q)) return {match: true, kind: 'chosung'};
  }
  return {match: false, kind: 'none'};
}

/** HTML 이스케이프 — esc 와 동일 로직 (모듈 자체에 의존 없도록 중복 정의). */
function escHtml(s){
  return String(s||'').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );
}

/**
 * 검색어와 일치하는 부분을 <mark> 로 감싸서 반환 (HTML escape 포함).
 * 초성 매칭의 경우 음절 경계 정렬이 까다로워 전체 강조 처리.
 */
export function highlightMatch(text, query){
  const safe = escHtml(text);
  if(!query || !text) return safe;
  const q = String(query).trim();
  if(!q) return safe;
  // exact 매칭 (대소문자 무시) — 첫 번째 매칭만 강조
  const lower = String(text).toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if(idx >= 0){
    return escHtml(text.slice(0, idx))
      + '<mark>' + escHtml(text.slice(idx, idx + q.length)) + '</mark>'
      + escHtml(text.slice(idx + q.length));
  }
  // 초성 매칭이면 전체에 <mark> 표시 (단어 단위로 자르기 어려움)
  if(isAllChosung(q) && toChosung(text).toLowerCase().includes(q.toLowerCase())){
    return '<mark>' + safe + '</mark>';
  }
  return safe;
}

// 순수 유틸 — DOM·전역 상태 의존 X. Node 환경에서 단위 테스트 가능.
// index.html 인라인과 동일 시그니처 유지 (단일 소스 화는 다음 단계).

export const esc = s => String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const sleep = ms => new Promise(r=>setTimeout(r,ms));

export const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

export const fmtBytes = n =>
  n<1024 ? n+'B'
  : n<1048576 ? (n/1024).toFixed(1)+'KB'
  : n<1073741824 ? (n/1048576).toFixed(1)+'MB'
  : (n/1073741824).toFixed(2)+'GB';

export const fmtDate = ts => {
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

export function debounce(fn, ms){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}

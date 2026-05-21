// 순수 유틸 — DOM·전역 상태 의존 X. Node 환경에서 단위 테스트 가능.
// index.html 인라인과 동일 시그니처 유지 (단일 소스 화는 다음 단계).

// 바이트 단위 상수 — 매직넘버 1024/1048576/1073741824 흩어지는 것 방지.
export const BYTES_KB = 1024;
export const BYTES_MB = BYTES_KB * 1024;
export const BYTES_GB = BYTES_MB * 1024;

export const esc = s => String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const sleep = ms => new Promise(r=>setTimeout(r,ms));

export const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

export const fmtBytes = n =>
  n<BYTES_KB ? n+'B'
  : n<BYTES_MB ? (n/BYTES_KB).toFixed(1)+'KB'
  : n<BYTES_GB ? (n/BYTES_MB).toFixed(1)+'MB'
  : (n/BYTES_GB).toFixed(2)+'GB';

// fmtDate: 로컬 타임존 사용. 테스트에서는 TZ=UTC 고정해서 검증 (test/pure.test.mjs).
export const fmtDate = ts => {
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

export function debounce(fn, ms){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}

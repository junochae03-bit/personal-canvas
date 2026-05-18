// NAI Studio Service Worker — v1
// 전략:
//   1. HTML/JS/CSS는 stale-while-revalidate (먼저 캐시 응답, 백그라운드 갱신)
//   2. CDN 외부 라이브러리는 cache-first (한 번 받으면 오래 사용)
//   3. file:// 환경에선 SW 자체가 등록되지 않으므로 영향 없음
//   4. /api/ 등 NovelAI API 호출은 절대 캐시하지 않음 (네트워크 전용)

const CACHE_NAME = 'nai-studio-v1';
const CORE = [
  './',
  './index.html',
];
const CDN_PATTERNS = [
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(CORE).catch(err => {
      console.warn('[SW] precache failed', err);
    }))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if(e.data === 'SKIP_WAITING') self.skipWaiting();
  if(e.data === 'CLEAR_CACHE'){
    e.waitUntil(caches.delete(CACHE_NAME).then(() => self.clients.claim()));
  }
});

function shouldBypass(req){
  const url = new URL(req.url);
  // NovelAI / API 호출은 절대 캐시 금지
  if(url.hostname.includes('novelai.net')) return true;
  if(url.pathname.startsWith('/api/')) return true;
  // POST/PUT/DELETE 등 비-GET 무조건 통과
  if(req.method !== 'GET') return true;
  return false;
}

function isCDN(req){
  const h = new URL(req.url).hostname;
  return CDN_PATTERNS.some(p => h.includes(p));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(shouldBypass(req)) return;  // 기본 네트워크 처리

  if(isCDN(req)){
    // CDN: cache-first
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(resp => {
        if(resp && resp.ok && resp.type !== 'opaque'){
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(()=>{});
        } else if(resp && resp.type === 'opaque'){
          // CORS 없는 응답도 캐시 (CDN 라이브러리는 대부분 opaque일 수 있음)
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(()=>{});
        }
        return resp;
      }).catch(()=> cached || Response.error()))
    );
    return;
  }

  // 동일 출처: stale-while-revalidate
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(resp => {
        if(resp && resp.ok){
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(()=>{});
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

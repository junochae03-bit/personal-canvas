// NAI Studio Service Worker — v2
// 전략 (v1에서 변경):
//   1. HTML/네비게이션 = 네트워크 우선 (network-first) → 옛 캐시에 갇히는 문제 방지
//   2. JS/CSS/이미지 등 정적 자산 = stale-while-revalidate
//   3. CDN 외부 라이브러리 = cache-first (한 번 받고 오래 사용)
//   4. NovelAI API 등 동적 요청 = 캐시 우회
//   5. file:// 환경에선 SW 자체가 등록되지 않으므로 영향 없음

const CACHE_NAME = 'nai-studio-v2';
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
  if(url.hostname.includes('novelai.net')) return true;
  if(url.pathname.startsWith('/api/')) return true;
  if(req.method !== 'GET') return true;
  return false;
}

function isCDN(req){
  const h = new URL(req.url).hostname;
  return CDN_PATTERNS.some(p => h.includes(p));
}

function isHTMLNav(req){
  // 네비게이션 요청(주소창 입력·새로고침)이거나 HTML 문서 요청
  if(req.mode === 'navigate') return true;
  if(req.destination === 'document') return true;
  const accept = req.headers.get('accept') || '';
  if(accept.includes('text/html')) return true;
  // URL이 .html로 끝나거나 루트
  const url = new URL(req.url);
  if(url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) return true;
  return false;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(shouldBypass(req)) return;

  // 🌐 HTML / 네비게이션 — 네트워크 우선 (옛 캐시 갇힘 방지)
  if(isHTMLNav(req)){
    e.respondWith(
      fetch(req).then(resp => {
        if(resp && resp.ok){
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(()=>{});
        }
        return resp;
      }).catch(() => caches.match(req).then(cached => cached || new Response('오프라인 — 캐시된 페이지 없음', {status: 503, headers: {'Content-Type': 'text/plain;charset=utf-8'}})))
    );
    return;
  }

  if(isCDN(req)){
    // CDN: cache-first
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(resp => {
        if(resp && (resp.ok || resp.type === 'opaque')){
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(()=>{});
        }
        return resp;
      }).catch(()=> cached || Response.error()))
    );
    return;
  }

  // 동일 출처 정적 자산: stale-while-revalidate
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

// NAI Studio Service Worker — v6
// 전략:
//   1. HTML/네비게이션 = stale-while-revalidate + 새 빌드 감지 시 클라이언트에 알림
//      (네트워크 우선은 첫 페인트가 네트워크 RTT에 묶여서 느림. 캐시 즉시 반환 + BG로 갱신)
//   2. JS/CSS/이미지 등 정적 자산 = stale-while-revalidate
//   3. CDN 외부 라이브러리 = cache-first (한 번 받고 오래 사용)
//   4. NovelAI API 등 동적 요청 = 캐시 우회
//   5. file:// 환경에선 SW 자체가 등록되지 않으므로 영향 없음
//
// 캐시 버전 정책:
//   - CACHE_NAME 은 수동 증가가 원칙이나, 잊었을 때를 대비해 클라이언트가
//     ETag/Content-Length 변경을 감지하면 NEW_VERSION_AVAILABLE 메시지를
//     보내서 사용자에게 새로고침을 안내.

const CACHE_NAME = 'nai-studio-c3d1e87e';
const CORE = [
  './',
  './index.html',
  './tags-danbooru.json',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
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
    // 모든 캐시 일괄 삭제 + clients.claim + 완료 알림 — 트러블슈팅용.
    // 🐛 fix: 이전엔 일방적 삭제만 하고 사용자에게 피드백 없음 → CACHE_CLEARED 메시지 보냄.
    e.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      await self.clients.claim();
      const clients = await self.clients.matchAll({type: 'window'});
      for(const c of clients){
        try { c.postMessage({type: 'CACHE_CLEARED', deletedCount: keys.length}); } catch(_){}
      }
    })());
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
  if(req.mode === 'navigate') return true;
  if(req.destination === 'document') return true;
  const accept = req.headers.get('accept') || '';
  if(accept.includes('text/html')) return true;
  const url = new URL(req.url);
  if(url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) return true;
  return false;
}

// 새 빌드 감지 — Content-Length 또는 ETag 변경 시 클라이언트에 메시지 전파
async function notifyClientsOfUpdate(){
  const clients = await self.clients.matchAll({type: 'window'});
  for(const c of clients){
    try { c.postMessage({type: 'NEW_VERSION_AVAILABLE'}); } catch(_){}
  }
}

// 🛡 보안: 캡티브 포털·중간자가 200 으로 응답하는 경우 캐시 오염 방지.
//   동일 출처 + response.type === 'basic' (CORS·opaque 거부) 만 저장.
function _isSafeToCache(req, resp){
  if(!resp || !resp.ok) return false;
  try {
    if(new URL(req.url).origin !== self.location.origin) return false;
  } catch(_) { return false; }
  if(resp.type && resp.type !== 'basic') return false;
  return true;
}

function staleWhileRevalidate(req, opts){
  return caches.match(req).then(cached => {
    const network = fetch(req).then(async resp => {
      if(_isSafeToCache(req, resp)){
        const clone = resp.clone();
        // HTML이면 ETag/Content-Length 변경 감지 → 클라이언트에 알림
        if(opts?.notifyOnChange && cached){
          const oldEtag = cached.headers.get('etag');
          const newEtag = resp.headers.get('etag');
          const oldLen = cached.headers.get('content-length');
          const newLen = resp.headers.get('content-length');
          if((newEtag && oldEtag && newEtag !== oldEtag) || (newLen && oldLen && newLen !== oldLen)){
            notifyClientsOfUpdate();
          }
        }
        caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(()=>{});
      }
      return resp;
    }).catch(() => cached);
    return cached || network;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(shouldBypass(req)) return;

  // 🌐 HTML / 네비게이션 — stale-while-revalidate (캐시 즉시 반환 + 백그라운드 갱신)
  if(isHTMLNav(req)){
    e.respondWith(
      staleWhileRevalidate(req, {notifyOnChange: true})
        .then(r => r || new Response('오프라인 — 캐시된 페이지 없음', {status: 503, headers: {'Content-Type': 'text/plain;charset=utf-8'}}))
    );
    return;
  }

  if(isCDN(req)){
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
  e.respondWith(staleWhileRevalidate(req));
});

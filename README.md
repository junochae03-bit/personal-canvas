# personal-canvas

NAI Studio — NovelAI 이미지 생성 PWA (정적, GitHub Pages 배포).

## 개발

```bash
npm test         # 단위 테스트 (Node 18+, TZ=UTC 고정)
npm run check    # 인라인 + sw.js JS 문법 검증
npm run lint     # 자체 lint (eval/var/CSP/순수성 검증)
```

## 구조

- `index.html` — 메인 SPA (HTML/CSS/JS 인라인, 13K+줄)
- `sw.js` — Service Worker (SWR 캐시 전략 + 빌드 감지)
- `tags-danbooru.json` — 단부루 태그 사전 (지연 로드)
- `js/pure/` — 순수 함수 모듈 (Node·브라우저 양쪽에서 사용 가능, 테스트 대상)
  - `utils.mjs` — `esc`/`clamp`/`fmtBytes`/`fmtDate`/`debounce` + 바이트 단위 상수
  - `prompt.mjs` — 자유 프롬프트 토큰화·중복 제거·시퀀스 파싱
  - `chars.mjs` — 캐릭터 prefix 기반 작품 그룹화
  - `seed.mjs` — NAI seed 입력 파싱·랜덤 시드 생성
  - `image.mjs` — 해상도 tier 판정·종횡비·8 단위 스냅
  - `comic.mjs` — 만화 빌더 (레이아웃 5종·패널 마스크 좌표·말풍선 SVG·프로젝트 직렬화)
- `test/pure.test.mjs` — Node 내장 test runner 단위 테스트 (32 케이스)
- `tools/lint.mjs` — 의존성 없는 자체 lint 스크립트
- `.github/workflows/ci.yml` — push/PR 시 check + lint + test 자동 실행
- `ARCHITECTURE.md` — 모듈 경계·데이터 흐름·확장 가이드

## 보안

| 항목 | 구현 |
|---|---|
| API 키 저장 | IndexedDB + Web Crypto **AES-GCM 256** (12B 랜덤 IV) |
| PIN 보호 (선택) | **PBKDF2 250k iter** + 16B salt → AES-GCM key, 메모리 캐시 |
| Brute-force 방어 | 3회 실패부터 지수 백오프 (최대 ~128초 잠금) |
| 평문 폴백 | 제거됨 — Web Crypto 실패 시 저장 거부 + 구버전 자동 업그레이드 |
| CSP | `<meta http-equiv>` — `script/style/connect/object/frame-src` 화이트리스트 + base/form 잠금 |
| CDN 무결성 | 버전 핀 + `crossorigin="anonymous"` (SRI hash 는 `release.yml` 워크플로의 `npm run sri` 로 주입) |
| 전역 에러 바운더리 | `unhandledrejection` + `error` 전역 핸들러 + 토스트 표시 |

API 키는 **동일 도메인 XSS**에 대해서는 여전히 노출 가능하므로 PIN 모드 활성화를 권장합니다.

## 접근성

- 모든 모달에 `role="dialog" aria-modal="true" aria-labelledby` + JS focus trap + Esc 닫기
- 토스트 컨테이너는 `aria-live="polite"` (스크린리더 자동 안내)
- `user-scalable=no` 제거 (WCAG 2.1 핀치 줌 허용)
- 주요 `<img>` 에 `alt` 텍스트

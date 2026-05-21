# Architecture

> NAI Studio 는 GitHub Pages 정적 호스팅 제약(빌드 단계 없음)에 맞춰
> **단일 HTML 파일 + 사이드카 모듈** 구조를 채택합니다. 본 문서는 모듈 경계,
> 데이터 흐름, 확장 가이드를 정리합니다.

## 1. 파일 레이아웃

```
personal-canvas/
├── index.html          (~14k lines)  SPA — HTML 마크업 + 인라인 CSS + 인라인 JS
├── sw.js               Service Worker — SWR 캐시 + 새 빌드 감지
├── tags-danbooru.json  단부루 태그 사전 (66KB, 지연 로드)
├── js/pure/            ★ 순수 모듈 — Node 와 브라우저 양쪽에서 import 가능
│   ├── utils.mjs       esc / clamp / fmtBytes / fmtDate / debounce / BYTES_*
│   ├── prompt.mjs      parseFreePromptTokens / dedupePromptTags / parseSeqInput
│   ├── chars.mjs       getCharGroup / groupCharsByWork
│   ├── seed.mjs        randomSeed / parseSeedInput / RAND_SEED_MAX
│   └── image.mjs       isSmallTier / aspectRatio / snapTo8 / MEGAPIXEL
├── test/pure.test.mjs  Node 내장 test runner (TZ=UTC 고정)
└── tools/lint.mjs      외부 의존 0 자체 lint
```

## 2. index.html 내부 영역 (대략)

| 줄 범위 | 역할 |
|---|---|
| 1–35 | meta / CSP / CDN script / 폰트 |
| 36–1395 | 인라인 CSS (디자인 토큰 + 모달/갤러리/모바일 반응형) |
| 1396–2436 | 마크업 (탭, 모달, 폼) |
| 2437–3567 | PWA / SW 등록 / Modal focus trap / 토스트 / 전역 에러 바운더리 |
| 3568–4500 | NAI API 호출 (`naiGenerate`, `buildGenBody`) + EXIF 파서 |
| 4500–6500 | 프리셋 / 캐릭터 카드 / 빠른 추가 모달 |
| 6500–9000 | 갤러리 / 라이트박스 / 청크 렌더링 |
| 9000–11000 | 일괄 생성 큐 / 시나리오 / 템플릿 |
| 11000–13970 | 설정 / API 키 암호화 / PIN / 백업·복원 / 부트 |

## 3. 순수 모듈 규칙

`js/pure/*.mjs` 는 **DOM / 스토리지 / 네트워크 의존이 0** 이어야 합니다.
`tools/lint.mjs` 가 다음 토큰 사용을 금지합니다:

- `window.`, `document.`, `localStorage`, `sessionStorage`, `indexedDB`, `navigator.`

새 순수 로직(예: 프롬프트 빌더, EXIF 헤더 디코더, 종횡비 계산)은 가능한 한
인라인이 아니라 `js/pure/` 에 추가하고 테스트도 같이 작성합니다.
브라우저는 인라인 카피를 사용하지만, **동일 시그니처**를 유지해 향후 단일
소스로 합쳐질 수 있게 합니다.

## 4. 데이터 흐름

```
┌────────────────────────────────────────────────────────────┐
│ 사용자 입력 (프롬프트, 캐릭터, 시드, 옵션)                  │
└─────────────────┬──────────────────────────────────────────┘
                  ▼
        ┌──────────────────┐
        │  state (객체)    │ ◀── localStorage·IndexedDB 부트 시 복원
        └────────┬─────────┘
                 ▼
        ┌──────────────────┐
        │  buildGenBody()  │  ← prompt.mjs (토큰 정규화)
        └────────┬─────────┘     ← chars.mjs (그룹화)
                 ▼               ← seed.mjs (시드 결정)
        ┌──────────────────┐     ← image.mjs (해상도)
        │  naiGenerate()   │
        └────────┬─────────┘
                 ▼
   image.novelai.net (실패 시 api.novelai.net 폴백)
                 ▼
        ┌──────────────────┐
        │   EXIF 파서      │  PNG zTXt/iTXt → pako inflate → JSON
        └────────┬─────────┘
                 ▼
        ┌──────────────────┐
        │  IndexedDB 갤러리│  blob + thumb + meta
        └──────────────────┘
```

## 5. 보안 경계

- **신뢰 영역**: 사용자가 직접 입력한 프롬프트·라벨. `esc()` 로 escape 후에만 innerHTML.
- **준신뢰**: 자신의 갤러리에서 import 한 PNG·JSON. `applyParsedMetaToForm()` 이
  필드별 타입 강제 + `.slice(n)` 으로 길이 제한.
- **외부 신뢰 없음**: NAI API 응답. 바이너리만 사용, JSON parse 결과는 표시 전에 escape.
- **CDN 라이브러리**: 버전 고정 + CSP `script-src` 화이트리스트. SRI 는 빌드
  파이프라인 도입 시 추가 예정.

## 6. 성능 가이드

- 갤러리 가상 스크롤: `IntersectionObserver` 기반 청크 렌더(80개씩, `~9100`).
- 갤러리 세션 이미지: `DB._imgCache` 인메모리 캐시 — 검색 키타이핑마다 IDB 재조회 없음. `saveImage/deleteImage/deleteSession/clearAll` 가 `_invalidateImgCache(sid)` 자동 호출.
- 새 리스너는 `_listenerScope()` 유틸로 묶어 한 번에 해제:
  ```js
  const scope = _listenerScope();
  scope.on(document, 'mousemove', onMove);
  scope.on(modal, 'click', onBackdrop);
  // 완료/취소 시:
  scope.dispose();   // 모든 리스너 즉시 해제 (AbortController 기반)
  ```
- innerHTML 대량 갱신 대신 `<template>` 클론 + DocumentFragment 권장.
- 이미지 태그는 가능하면 `loading="lazy" decoding="async"` (라이트박스/베이스 입력처럼 즉시 필요한 경우 제외).
- Service Worker 는 NovelAI API 를 명시적으로 우회 (`sw.js:48`).

## 7. 신규 기능 추가 체크리스트

1. 순수 로직은 `js/pure/` 에 모듈로 — 테스트 같이 작성.
2. 사용자 입력을 DOM 에 넣을 때는 항상 `esc()` 또는 `textContent`.
3. 모달은 `.modal-bg role="dialog" aria-modal="true" aria-labelledby="..."`
   패턴 유지 — focus trap 이 자동 부착됨.
4. 외부 fetch URL 은 CSP `connect-src` 에 추가.
5. 새 매직 넘버는 파일 상단 `const` 로 추출하거나 `js/pure/` 상수로.
6. 빈 catch 금지 — `_swallow(e, 'ctx')` 사용.
7. `console.log` 는 디버그용 최소화, 영구 로그는 `console.warn`/`error`.

## 8. 알려진 제약

- **단일 파일 인라인 SPA**: 코드 스플리팅 불가. 추후 빌드 도입 시 분리.
- **SRI 누락**: 빌드 단계가 없어 자동 hash 계산 불가. CSP + 버전 핀으로 보완.
- **localStorage 평문**: API 키는 IDB 암호화. UI 상태 (zoom, view 등) 만 평문.

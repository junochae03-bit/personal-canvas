# personal-canvas

NAI Studio — NovelAI 이미지 생성 PWA (정적, GitHub Pages 배포).

## 개발

```bash
# 단위 테스트 (Node 18+)
npm test

# JS 문법 검증 (인라인 + sw.js)
npm run check
```

## 구조

- `index.html` — 메인 SPA (HTML/CSS/JS 인라인)
- `sw.js` — Service Worker (SWR 캐시 전략)
- `tags-danbooru.json` — 단부루 태그 사전 (지연 로드)
- `js/pure/` — 순수 함수 모듈 (테스트 가능, Node 환경에서 import)
- `test/` — Node 내장 test runner 기반 단위 테스트
- `.github/workflows/ci.yml` — push/PR 시 lint + test 자동 실행

## 보안

- API 키는 IndexedDB + Web Crypto AES-GCM 으로 암호화 저장
- 옵션: 설정 → 보안에서 PIN 보호 활성화 가능 (PBKDF2 250k iter)

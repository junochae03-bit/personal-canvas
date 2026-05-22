// 🎞 만화(컷) 빌더 — 순수 함수. 레이아웃 좌표·말풍선 SVG·프로젝트 직렬화.
// DOM·네트워크·스토리지 의존 0. Node·브라우저 양쪽에서 import 가능.
//
// 흐름:
//   1. LAYOUTS 에서 페이지 레이아웃 선택
//   2. getPanelMaskCoords() 로 각 패널 영역 → NAI 인페인트용 마스크 좌표
//   3. 패널마다 NAI infill 직렬 호출 (이전 결과 = 다음 베이스, 체이닝)
//   4. 완료 후 bubbleSvgString() 로 말풍선 SVG 합성
//   5. serializeProject() 로 갤러리 메타에 저장

// 패널 좌표: x/y/w/h 는 페이지 전체 픽셀 기준 사각형.
// gutter 는 패널 사이 검은 보더 두께(픽셀) — 베이스 페이지 템플릿에 그릴 때 사용.
// 패널 안쪽 좌표는 보더 빼고 그림 영역만 가리킴 (마스크 흰색 영역).
//
// 해상도 선정 기준:
//   - NAI v4 무료: 1MP (예: 832×1216, 1024×1024, 1216×832)
//   - NAI v4 Opus: 1.5MP+
//   - 모든 레이아웃을 1MP 안에 맞춤 (Opus 없이도 동작)
export const LAYOUTS = [
  {
    id: '2v', name: '세로 2칸', w: 832, h: 1216, gutter: 12,
    panels: [
      {x: 0, y: 0, w: 832, h: 600},
      {x: 0, y: 616, w: 832, h: 600},
    ],
  },
  {
    id: '3v', name: '세로 3칸 (인스타툰)', w: 832, h: 1216, gutter: 12,
    panels: [
      {x: 0, y: 0, w: 832, h: 397},
      {x: 0, y: 409, w: 832, h: 398},
      {x: 0, y: 819, w: 832, h: 397},
    ],
  },
  {
    id: '4grid', name: '4컷 그리드', w: 1024, h: 1024, gutter: 12,
    panels: [
      {x: 0, y: 0, w: 506, h: 506},
      {x: 518, y: 0, w: 506, h: 506},
      {x: 0, y: 518, w: 506, h: 506},
      {x: 518, y: 518, w: 506, h: 506},
    ],
  },
  {
    id: '1wide', name: '와이드 1컷', w: 1216, h: 832, gutter: 0,
    panels: [
      {x: 0, y: 0, w: 1216, h: 832},
    ],
  },
  {
    id: '3split', name: '큰 위 + 작은 아래 2', w: 832, h: 1216, gutter: 12,
    panels: [
      {x: 0, y: 0, w: 832, h: 700},
      {x: 0, y: 712, w: 410, h: 504},
      {x: 422, y: 712, w: 410, h: 504},
    ],
  },
];

export const BUBBLE_SHAPES = ['round', 'spike', 'thought'];
export const BUBBLE_TAIL_DIRS = ['bl', 'br', 'tl', 'tr', 'none'];

const SCHEMA_VERSION = 1;
const MAX_TEXT_LEN = 500;        // 말풍선 1개 최대 글자
const MAX_BUBBLES = 100;         // 페이지당 말풍선 cap
const MAX_PROMPT_LEN = 4000;     // 패널 1개 프롬프트 cap
const MIN_BUBBLE_W = 40;
const MIN_BUBBLE_H = 30;
const DEFAULT_BUBBLE_W = 120;
const DEFAULT_BUBBLE_H = 80;

/** 레이아웃 ID 로 정의 가져오기. 없으면 null. */
export function getLayout(layoutId){
  return LAYOUTS.find(l => l.id === layoutId) || null;
}

/**
 * 패널 인덱스에 해당하는 마스크 좌표 {x,y,w,h}.
 * 마스크 PNG 는 페이지 전체 (layout.w × layout.h) 크기로 만들고
 * 이 영역만 흰색으로 칠해서 NAI 인페인트 (흰색 = 새로 그림, 검정 = 보존).
 */
export function getPanelMaskCoords(layout, panelIndex){
  if(!layout || !Array.isArray(layout.panels)) return null;
  const p = layout.panels[panelIndex];
  if(!p) return null;
  return {x: p.x, y: p.y, w: p.w, h: p.h};
}

/**
 * 말풍선 텍스트 워드랩. 단어 경계 우선, 한 단어가 cap 초과면 강제 분할.
 * 한국어처럼 공백 없는 텍스트도 안전하게 줄바꿈.
 * 입력 '\n' 는 강제 줄바꿈으로 보존.
 */
export function wrapBubbleText(text, maxCharsPerLine){
  if(!text) return [];
  const cap = Math.max(1, Math.floor(maxCharsPerLine || 12));
  const lines = [];
  for(const para of String(text).split('\n')){
    if(!para){ lines.push(''); continue; }
    let cur = '';
    for(const word of para.split(/(\s+)/)){
      if(!word) continue;
      // 한 단어가 cap 초과 → 강제 분할 (CJK 글자 단위)
      if(word.length > cap){
        if(cur){ lines.push(cur.trim()); cur = ''; }
        for(let i = 0; i < word.length; i += cap){
          const chunk = word.slice(i, i + cap);
          if(i + cap >= word.length){ cur = chunk; }
          else lines.push(chunk);
        }
        continue;
      }
      if((cur + word).length > cap){
        lines.push(cur.trim());
        cur = word.trimStart();
      } else {
        cur += word;
      }
    }
    if(cur.trim()) lines.push(cur.trim());
  }
  return lines;
}

function escXml(s){
  return String(s||'').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])
  );
}

/**
 * 말풍선 도형 SVG <g> 마크업 생성.
 * shape: 'round' (대사) | 'spike' (외침) | 'thought' (생각)
 * 꼬리는 MVP 에서 생략 — 도형만. (꼬리 분기는 별도 단계에서 추가.)
 */
// 꼬리(tail) SVG — 도형 외곽에서 방향(tailDir)으로 빠져나옴.
// 'spike' 와 'none' 은 꼬리 없음. round=삼각형, thought=작은 원 2개 (큰→작은).
// 본체보다 먼저 stack 에 올려서 본체가 위쪽 stroke 를 자연스럽게 덮도록.
function bubbleTailSvg(shape, tailDir, cx, cy, rx, ry){
  if(shape === 'spike' || tailDir === 'none' || !BUBBLE_TAIL_DIRS.includes(tailDir)) return '';
  const dx = tailDir.endsWith('l') ? -1 : 1;
  const dy = tailDir.startsWith('t') ? -1 : 1;
  const angle = Math.atan2(dy * ry, dx * rx);   // 타원 외곽 매개변수 각도
  const off = Math.min(rx, ry) * 0.65;          // 꼬리 길이
  const sx = cx + Math.cos(angle) * rx * 0.92;
  const sy = cy + Math.sin(angle) * ry * 0.92;
  const tipX = cx + Math.cos(angle) * (rx + off);
  const tipY = cy + Math.sin(angle) * (ry + off);
  if(shape === 'thought'){
    const m1x = (sx + tipX) / 2, m1y = (sy + tipY) / 2;
    const r1 = Math.max(4, off * 0.22);
    const r2 = Math.max(3, off * 0.13);
    return `<circle cx="${m1x.toFixed(1)}" cy="${m1y.toFixed(1)}" r="${r1.toFixed(1)}" fill="white" stroke="black" stroke-width="3"/>`
      + `<circle cx="${tipX.toFixed(1)}" cy="${tipY.toFixed(1)}" r="${r2.toFixed(1)}" fill="white" stroke="black" stroke-width="3"/>`;
  }
  // round — 본체 옆 양 점 + 꼬리 끝, 삼각형
  const perp = Math.PI / 2;
  const wing = Math.min(rx, ry) * 0.22;
  const ax = sx + Math.cos(angle + perp) * wing;
  const ay = sy + Math.sin(angle + perp) * wing;
  const bx = sx + Math.cos(angle - perp) * wing;
  const by = sy + Math.sin(angle - perp) * wing;
  return `<polygon points="${ax.toFixed(1)},${ay.toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}" fill="white" stroke="black" stroke-width="3" stroke-linejoin="round"/>`;
}

export function bubbleSvgString(bubble){
  if(!bubble || typeof bubble !== 'object') return '';
  const x = Number(bubble.x) || 0;
  const y = Number(bubble.y) || 0;
  const w = Math.max(MIN_BUBBLE_W, Number(bubble.w) || DEFAULT_BUBBLE_W);
  const h = Math.max(MIN_BUBBLE_H, Number(bubble.h) || DEFAULT_BUBBLE_H);
  const text = String(bubble.text || '');
  const shape = BUBBLE_SHAPES.includes(bubble.shape) ? bubble.shape : 'round';
  const tailDir = BUBBLE_TAIL_DIRS.includes(bubble.tailDir) ? bubble.tailDir : 'bl';
  const cx = x + w/2, cy = y + h/2;
  const rx = w/2, ry = h/2;

  const tail = bubbleTailSvg(shape, tailDir, cx, cy, rx, ry);

  let body;
  if(shape === 'round'){
    body = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white" stroke="black" stroke-width="3"/>`;
  } else if(shape === 'spike'){
    // 톱니 외곽 — 외침·충격용. 24 점 (12 외점·12 내점 교차)
    const points = [];
    const N = 24;
    for(let i = 0; i < N; i++){
      const angle = (i / N) * Math.PI * 2 - Math.PI/2;
      const r = (i % 2 === 0) ? 1.0 : 0.78;
      const px = cx + Math.cos(angle) * rx * r;
      const py = cy + Math.sin(angle) * ry * r;
      points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    body = `<polygon points="${points.join(' ')}" fill="white" stroke="black" stroke-width="3"/>`;
  } else { // thought — 점선 타원
    body = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white" stroke="black" stroke-width="3" stroke-dasharray="6 4"/>`;
  }

  // 텍스트 (워드랩 → tspan 줄별)
  const fontSize = Math.max(11, Math.min(20, Math.floor(h / 8)));
  const maxChars = Math.max(4, Math.floor(w / (fontSize * 0.65)));
  const lines = wrapBubbleText(text, maxChars);
  const lineH = fontSize * 1.25;
  const totalH = lines.length * lineH;
  const startY = cy - totalH/2 + lineH * 0.75;
  const textEls = lines.map((line, i) =>
    `<tspan x="${cx}" y="${(startY + i * lineH).toFixed(1)}">${escXml(line)}</tspan>`
  ).join('');
  const textSvg = lines.length
    ? `<text text-anchor="middle" font-family="Pretendard, sans-serif" font-size="${fontSize}" fill="black">${textEls}</text>`
    : '';

  // 꼬리는 본체보다 먼저 (본체가 위에서 자연스럽게 덮음)
  return `<g class="comic-bubble" data-shape="${shape}">${tail}${body}${textSvg}</g>`;
}

/**
 * 만화 프로젝트 직렬화 — 갤러리 메타 저장용. JSON 가능한 객체 반환.
 * 모든 문자열 길이 cap·숫자 타입 강제·도형 화이트리스트. 외부 데이터 안전.
 * project: {layoutId, panels:[{prompt}], bubbles:[{shape, x, y, w, h, text, tailDir}]}
 */
export function serializeProject(project){
  if(!project || typeof project !== 'object') return null;
  const layout = getLayout(project.layoutId);
  if(!layout) return null;
  const panels = Array.isArray(project.panels)
    ? project.panels.slice(0, layout.panels.length).map(p => ({
        prompt: String(p?.prompt || '').slice(0, MAX_PROMPT_LEN),
      }))
    : [];
  // 양수 + finite 면 min 으로 clamp, 그 외(음수·NaN·0) 는 default 로 폴백 — 일관된 sanitize.
  const dim = (v, minV, defV) => {
    const n = Number(v);
    if(!Number.isFinite(n) || n <= 0) return defV;
    return Math.max(minV, n);
  };
  const bubbles = Array.isArray(project.bubbles)
    ? project.bubbles.slice(0, MAX_BUBBLES).map(b => ({
        shape: BUBBLE_SHAPES.includes(b?.shape) ? b.shape : 'round',
        x: Number.isFinite(Number(b?.x)) ? Number(b.x) : 0,
        y: Number.isFinite(Number(b?.y)) ? Number(b.y) : 0,
        w: dim(b?.w, MIN_BUBBLE_W, DEFAULT_BUBBLE_W),
        h: dim(b?.h, MIN_BUBBLE_H, DEFAULT_BUBBLE_H),
        text: String(b?.text || '').slice(0, MAX_TEXT_LEN),
        tailDir: BUBBLE_TAIL_DIRS.includes(b?.tailDir) ? b.tailDir : 'bl',
      }))
    : [];
  return {
    schemaVersion: SCHEMA_VERSION,
    layoutId: project.layoutId,
    panels,
    bubbles,
  };
}

/**
 * 직렬화된 JSON 을 다시 프로젝트 객체로. schemaVersion 검증 + 재 sanitize.
 * 불일치·null·비-객체 → null.
 */
export function parseProject(data){
  if(!data || typeof data !== 'object') return null;
  if(data.schemaVersion !== SCHEMA_VERSION) return null;
  return serializeProject(data);
}

/**
 * 페이지 템플릿 SVG — 빈 만화 페이지. 흰 배경 + 검은 패널 보더.
 * 브라우저: SVG → Image → Canvas → PNG b64 로 변환해 state.baseImage 에 주입.
 * borderPx 는 패널 사이 검은 선의 두께. layout.gutter 가 두 패널 사이 공백이므로
 * 보더는 gutter 의 절반 가량으로 그려서 패널 영역을 침범하지 않게 함.
 */
export function pageTemplateSvg(layout){
  if(!layout) return '';
  const border = Math.max(2, Math.floor((layout.gutter || 12) * 0.7));
  const half = border / 2;
  // 외곽 검은 테두리 + 각 패널 영역 안쪽 흰색 + 패널 보더.
  // stroke 가 좌표 중심 기준이므로 inset 처리로 패널 안쪽 흰색 영역을 보존.
  const panelRects = layout.panels.map(p =>
    `<rect x="${p.x + half}" y="${p.y + half}" width="${p.w - border}" height="${p.h - border}" `
    + `fill="white" stroke="black" stroke-width="${border}"/>`
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.w}" height="${layout.h}" viewBox="0 0 ${layout.w} ${layout.h}">`
    + `<rect width="${layout.w}" height="${layout.h}" fill="black"/>`
    + panelRects
    + `</svg>`;
}

/**
 * 패널 마스크 SVG — 지정 패널만 흰색(인페인트 영역), 나머지 검은색(보존).
 * NAI 마스크 규약: 흰 = 새로 그림, 검정 = 원본 유지.
 * 마스크는 패널 보더를 살짝 침범해서(featherPx) NAI 가 경계를 자연스럽게 만들도록.
 */
export function panelMaskSvg(layout, panelIndex, featherPx){
  if(!layout) return '';
  const p = layout.panels[panelIndex];
  if(!p) return '';
  const f = (typeof featherPx === 'number' && featherPx >= 0) ? featherPx : 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.w}" height="${layout.h}" viewBox="0 0 ${layout.w} ${layout.h}">`
    + `<rect width="${layout.w}" height="${layout.h}" fill="black"/>`
    + `<rect x="${p.x - f}" y="${p.y - f}" width="${p.w + 2*f}" height="${p.h + 2*f}" fill="white"/>`
    + `</svg>`;
}

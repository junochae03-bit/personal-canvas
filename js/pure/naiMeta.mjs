// NAI 메타 정제 — 외부 PNG/EXIF/import 데이터에서 신뢰 못 할 필드를 안전화.
// prototype pollution + size attack + 타입 강제. js/pure/ 순수 모듈 (DOM 없음).
//
// 사용 예 (index.html 인라인):
//   const m = sanitizeNaiMeta(parsedJsonFromExif);
//   if(m.prompt) $('prompt').value = m.prompt;
//   state.characters = sanitizeCharacters(m.characters);

const STR_LIMITS = {
  prompt: 4000,
  neg: 4000,
  characterField: 2000,   // appearance/action/neg per char
  name: 80,
};
const MAX_CHARS = 6;
const MAX_POOL = 50;

function clamp01(v){
  const n = parseFloat(v);
  if(!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/** 여러 후보 키 중 null/빈문자 아닌 첫 값 반환. */
export function pickFirst(obj, ...keys){
  if(!obj || typeof obj !== 'object') return null;
  for(const k of keys){
    const v = obj[k];
    if(v != null && v !== '') return v;
  }
  return null;
}

/**
 * 중첩 경로(여러 후보) 중 null/빈문자 아닌 첫 문자열 값.
 * 사용 예: pickNestedString(meta, ['v4_negative_prompt','caption','base_caption'])
 * NAI V4 페이로드는 prompt/negative 가 nested object(caption.base_caption) 에 있어 top-level pick 으로는 못 찾음.
 */
export function pickNestedString(root, ...paths){
  if(!root || typeof root !== 'object') return null;
  for(const path of paths){
    if(!Array.isArray(path)) continue;
    let v = root;
    for(const k of path){
      v = (v && typeof v === 'object') ? v[k] : null;
      if(v == null) break;
    }
    if(typeof v === 'string' && v !== '') return v;
  }
  return null;
}

/**
 * 단일 캐릭터 객체 정제 — 모든 문자열은 slice로 길이 제한, pos는 [0,1] 클램프.
 * pool 배열도 재귀적으로 정제 (단, 중첩 캐릭터는 허용 안 함).
 */
export function sanitizeCharacter(c){
  if(!c || typeof c !== 'object') c = {};
  return {
    enabled: c.enabled !== false,
    name: String(c.name || '').slice(0, STR_LIMITS.name),
    appearance: String(c.appearance || '').slice(0, STR_LIMITS.characterField),
    action: String(c.action || '').slice(0, STR_LIMITS.characterField),
    neg: String(c.neg || '').slice(0, STR_LIMITS.characterField),
    prompt: String(c.prompt || '').slice(0, STR_LIMITS.prompt),
    pos: c.pos && typeof c.pos === 'object' ? {
      x: clamp01(c.pos.x),
      y: clamp01(c.pos.y),
    } : {x: 0.5, y: 0.5},
    pool: Array.isArray(c.pool) ? c.pool.slice(0, MAX_POOL).map(p => ({
      name: String(p?.name || '').slice(0, STR_LIMITS.name),
      appearance: String(p?.appearance || '').slice(0, STR_LIMITS.characterField),
      action: String(p?.action || '').slice(0, STR_LIMITS.characterField),
      neg: String(p?.neg || '').slice(0, STR_LIMITS.characterField),
    })) : [],
    poolIdx: Math.max(0, parseInt(c.poolIdx, 10) || 0),
  };
}

/** 캐릭터 배열 — 최대 MAX_CHARS, 각 항목 정제. 비배열은 빈 배열. */
export function sanitizeCharacters(arr, max){
  if(!Array.isArray(arr)) return [];
  const cap = (typeof max === 'number' && max > 0) ? Math.min(max, MAX_CHARS) : MAX_CHARS;
  return arr.slice(0, cap).map(sanitizeCharacter);
}

/**
 * 최상위 NAI 메타에서 자주 쓰는 필드 추출 (NAI 내부 / 공식 / A1111 모두 커버).
 * 반환 객체는 신뢰 가능한 값들만 포함 — undefined/'' 은 생략.
 */
export function extractNaiFields(parsed){
  if(!parsed || typeof parsed !== 'object') return {};
  const out = {};
  const setStr = (key, max, ...candidates) => {
    const v = pickFirst(parsed, ...candidates);
    if(v != null) out[key] = String(v).slice(0, max);
  };
  const setNum = (key, ...candidates) => {
    const v = pickFirst(parsed, ...candidates);
    if(v != null){
      const n = Number(v);
      if(Number.isFinite(n)) out[key] = n;
    }
  };
  setStr('prompt', STR_LIMITS.prompt, 'prompt');
  setStr('neg', STR_LIMITS.prompt, 'neg', 'uc', 'negative_prompt');
  // 🐛 NAI V4 fallback — top-level 키가 없거나 비었으면 v4_(negative_)prompt 의 nested base_caption 탐색.
  //   V4 모델 PNG는 prompt/uc 가 객체 안에 있어 top-level pickFirst 로는 못 찾는다.
  if(!out.prompt){
    const v = pickNestedString(parsed, ['v4_prompt','caption','base_caption'], ['v4_prompt','base_caption']);
    if(v != null) out.prompt = String(v).slice(0, STR_LIMITS.prompt);
  }
  if(!out.neg){
    const v = pickNestedString(parsed, ['v4_negative_prompt','caption','base_caption'], ['v4_negative_prompt','base_caption']);
    if(v != null) out.neg = String(v).slice(0, STR_LIMITS.prompt);
  }
  setNum('seed', 'seed');
  setStr('model', 64, 'model');
  setNum('steps', 'steps');
  setNum('cfg', 'cfg', 'scale');
  setNum('cfgRescale', 'cfg_rescale');
  setStr('sampler', 64, 'sampler');
  setStr('schedule', 64, 'schedule', 'noise_schedule');
  setNum('width', 'w', 'width');
  setNum('height', 'h', 'height');
  if(Array.isArray(parsed.characters)) out.characters = sanitizeCharacters(parsed.characters);
  return out;
}

// 🎲 NovelAI 동적 선택 문법 `||A|B|C||` — 매 호출마다 옵션 중 하나를 무작위 선택.
//
// 사용 예:
//   "a, ||X|Y|Z||, b"  → "a, X, b"  또는 "a, Y, b"  또는 "a, Z, b"
//   "||A|B| ||"        → "A" 또는 "B" 또는 ""  (마지막 공백 = 아무것도 사용 안 함)
//
// 규칙:
// - 옵션 분리자는 `|`. 옵션 안 콤마(,) 와 가중치 `2::tag::` 는 그대로 유지.
// - 옵션 양끝 공백은 trim. 빈 옵션은 ""(no-op).
// - 중첩된 ||...|| 는 지원 안 함 (단순 lazy 매칭).
// - 패턴 없으면 원본 그대로.
// - rng 주입 가능 (테스트·결정적 시드 재현).

const RC_PATTERN = /\|\|([^|]*(?:\|[^|]*)*?)\|\|/g;

export function expandRandomChoices(text, rng){
  if(!text || typeof text !== 'string') return text;
  const random = (typeof rng === 'function') ? rng : Math.random;
  return text.replace(RC_PATTERN, (full, inner) => {
    if(inner == null) return '';
    const options = inner.split('|');
    if(options.length === 0) return '';
    const choice = options[Math.floor(random() * options.length)];
    return (choice || '').trim();
  });
}

/**
 * 디버그용 — 텍스트의 모든 ||...|| 매칭과 그 옵션 목록을 수집.
 * 반환: [{offset, full, options: string[]}, ...]
 * UI 미리보기 ("어떤 옵션이 뽑힐 수 있는지") 또는 검증 용도.
 */
export function listRandomChoices(text){
  if(!text || typeof text !== 'string') return [];
  const out = [];
  let m;
  RC_PATTERN.lastIndex = 0;
  while((m = RC_PATTERN.exec(text)) !== null){
    const inner = m[1] == null ? '' : m[1];
    const options = inner.split('|').map(s => s.trim());
    out.push({offset: m.index, full: m[0], options});
  }
  return out;
}

/**
 * 전체 텍스트에서 가능한 조합의 총 수 (단순 곱셈).
 * 예: 3 패턴 × (4, 5, 3) 옵션 → 60. UI 미리보기에 카운트 표시용.
 * 패턴 0개면 1 반환 (= 한 가지 결과만 가능).
 */
export function countRandomCombinations(text){
  const list = listRandomChoices(text);
  if(!list.length) return 1;
  return list.reduce((acc, x) => acc * Math.max(1, x.options.length), 1);
}

// 🎥 카메라 앵글·구도 토큰 — 다른 체위·표정과 모순 자주 발생.
// 사용자 의도(설명문): "카메라 앵글은 일부러 제외 — NAI 가 알아서 매칭하도록 위임".
// 단독 옵션으로 들어가면 경고. 'sex from behind' 같이 다른 토큰과 결합된 건 안전.
const CAMERA_ANGLE_TOKENS = [
  /^from above$/i, /^from below$/i, /^from side$/i, /^from front$/i,
  /\blow angle\b/i, /\bhigh angle\b/i, /\bdutch angle\b/i,
  /^bird'?s[-\s]?eye view$/i, /^worm'?s[-\s]?eye view$/i,
  /^pov$/i, /^point of view$/i, /\bforeshortening\b/i,
  /^wide shot$/i, /^close[-\s]?up$/i, /^medium shot$/i,
  /^full body$/i, /^cowboy shot$/i, /^upper body$/i, /^lower body$/i,
];

/**
 * 옵션 텍스트가 카메라 앵글 토큰을 (단독으로) 포함하는지.
 * 옵션 내부를 콤마로 split → 가중치 표기 ::body:: 만 추출 → 카메라 앵글 매칭.
 * 예: "from above" → true
 *     "sex from behind, indoors" → false (sex from behind 는 단독 카메라 앵글 아님)
 *     "2::from above::" → true (가중치 보존, 본문 검사)
 */
export function hasCameraAngle(optionText){
  if(!optionText || typeof optionText !== 'string') return false;
  const tokens = optionText.split(',').map(t => t.trim()).filter(Boolean);
  return tokens.some(tok => {
    const m = tok.match(/^-?\d+(?:\.\d+)?::([\s\S]*?)::$/);
    const body = (m ? m[1] : tok).trim();
    return CAMERA_ANGLE_TOKENS.some(re => re.test(body));
  });
}

/**
 * 가중치 기반 랜덤 선택. options: [{text, weight}].
 * weight 가 0 이하면 그 옵션은 선택 안 됨. 모두 0 이하면 균등 분포.
 * 빈 text 옵션도 그대로 반환 (호출자가 "사용 안 함" 의미로 처리).
 */
export function pickWeightedOption(options, rng){
  if(!Array.isArray(options) || options.length === 0) return null;
  const random = (typeof rng === 'function') ? rng : Math.random;
  const total = options.reduce((s, o) => s + Math.max(0, Number(o?.weight) || 0), 0);
  if(total <= 0){
    return options[Math.floor(random() * options.length)];
  }
  const target = random() * total;
  let acc = 0;
  for(const o of options){
    acc += Math.max(0, Number(o?.weight) || 0);
    if(target < acc) return o;
  }
  return options[options.length - 1];
}

// 📚 카테고리 자동 분류 휴리스틱 — 임포트 시 옵션 내용을 분석해 라벨 자동 추측.
// 사용자 컨텍스트(NSFW 야쓰 템플릿) + 일반 NAI 카테고리 양쪽 커버.
// 매칭 규칙: 한 옵션의 콤마 split 토큰이 키워드(부분일치)와 만나면 점수 +1.
// 점수 가장 높은 라벨 채택. 동률 시 사전 순서.
export const RC_CATEGORY_HEURISTICS = [
  {label: '🎬 체위',      keywords: ['missionary','cowgirl position','doggystyle','sex from behind','mating press','full nelson','piledriver','amazon position','standing sex','reverse cowgirl','prone bone','top-down bottom-up','suspended congress','folded','upright straddle','m legs','v arms']},
  {label: '😈 야쓰 종류',  keywords: ['happy sex','rough sex','rape','implied sex','stealth sex','consensual','dubcon','noncon']},
  {label: '😢 표정',      keywords: ['tears','crying','aroused','ahegao','torogao','fucked silly','wide-eyed','biting own lip','glaring','smile','naughty face','seductive smile','disgust','annoyed','dazed','exhausted','mind break','licking lips','clenched teeth']},
  {label: '👁 눈 모양',    keywords: ['heart-shaped pupils','rolled-up eyes','crazy eyes','asymmetrical eyes','heterochromia','empty eyes','closed eyes','half-closed eyes']},
  {label: '💋 키스',      keywords: ['imminent kiss','after kiss','french kiss','forced kiss','tongue out','kiss']},
  {label: '💦 침',        keywords: ['saliva','drooling','saliva trail','saliva drip']},
  {label: '💢 절정',      keywords: ['orgasm','female orgasm','forced orgasm','mutual orgasm']},
  {label: '🐱 종족',      keywords: ['horse girl','cat girl','demon girl','fox girl','elf','dark elf','dragon girl','rabbit girl','wolf girl','android','angel','fallen angel','fairy','vampire','cow girl','draph','erune','kyuubi','sheep girl','hume','dryad','human','snake girl']},
  {label: '👧 여성 타입',   keywords: ['loli','oppai loli','mature female','mature woman','young adult','teenager','milf']},
  {label: '🍒 가슴 크기',   keywords: ['flat chest','small breasts','medium breasts','large breasts','huge breasts','gigantic breasts']},
  {label: '🧍 체형',       keywords: ['petite','skinny','curvy','plump','fat','thick','slim','muscular','athletic']},
  {label: '🍑 가슴 상태',   keywords: ['bouncing breasts','hanging breasts','breasts apart','bouncing','breast smother','sideboob']},
  {label: '🌸 유두',       keywords: ['nipples','nipple slip','inverted nipples','covered nipples','puffy nipples','large areolae']},
  {label: '🌿 음모',       keywords: ['female pubic hair','pubic hair peek','pubic hair']},
  {label: '🌐 옷·노출',     keywords: ['nude','clothed female nude male','clothed male nude female','partially nude','topless']},
  {label: '🍆 삽입',       keywords: ['vaginal','anal','double penetration','deep penetration','covered penetration','penetration']},
  {label: '💧 사정',       keywords: ['cum in pussy','cum in anal','cum overflow','ejaculation','implied ejaculation','facial','bukkake','cum on body']},
  {label: '💦 애액',       keywords: ['pussy juice','pussy juice trail','squirting','female ejaculation','wet pussy','dripping']},
  {label: '🎥 카메라 앵글', keywords: ['from above','from below','from side','from front','low angle','high angle','dutch angle','bird\'s-eye view','worm\'s-eye view','pov','foreshortening','wide shot','close-up','medium shot','full body','cowboy shot','upper body','lower body']},
  {label: '🏞 배경',       keywords: ['simple background','location','indoors','outdoors','classroom','bedroom','bathroom','beach','park','street','forest','school','office','kitchen','library','hospital','hotel','dungeon','cafe','restaurant']},
  {label: '💡 조명',       keywords: ['cinematic lighting','soft lighting','dramatic lighting','rim light','backlit','sunset lighting','moonlight','candlelight','volumetric lighting']},
];

/**
 * 옵션 배열을 보고 가장 적합한 카테고리 라벨 추측.
 * 매칭 없으면 null 반환 (호출자가 기본 이름 사용).
 */
export function guessCategoryLabel(options){
  if(!Array.isArray(options) || options.length === 0) return null;
  let bestScore = 0, bestLabel = null;
  for(const heur of RC_CATEGORY_HEURISTICS){
    let score = 0;
    for(const opt of options){
      const txt = String(opt?.text || '').toLowerCase();
      if(!txt) continue;
      // 가중치 표기 제거 후 본문 검사
      const body = txt.replace(/-?\d+(?:\.\d+)?::|::/g, ' ');
      for(const kw of heur.keywords){
        if(body.includes(kw.toLowerCase())){ score++; break; }
      }
    }
    if(score > bestScore){
      bestScore = score;
      bestLabel = heur.label;
    }
  }
  // 매칭이 옵션 수의 30% 이상일 때만 라벨 적용 (너무 약한 매칭은 잡음)
  if(bestScore >= Math.max(2, Math.ceil(options.length * 0.3))) return bestLabel;
  return null;
}

/**
 * 카테고리들을 ||A|B|C|| 텍스트로 컴파일. 빌더 → prompt textarea / 캐릭터 프리셋 변환용.
 * 가중치 != 1.0 인 옵션은 `1.5::tag::` 형태로 인코딩.
 * 활성 카테고리만 포함. 옵션 없는 카테고리는 생략.
 */
export function compileCategoriesToText(categories){
  if(!Array.isArray(categories)) return '';
  const blocks = [];
  for(const cat of categories){
    if(!cat || cat.enabled === false) continue;
    const opts = cat.options || [];
    if(!opts.length) continue;
    const tokens = opts.map(o => {
      const text = String(o?.text || '');
      const w = Number(o?.weight);
      if(Number.isFinite(w) && w !== 1.0 && text.trim()){
        return `${w}::${text}::`;
      }
      return text;
    });
    blocks.push(`||${tokens.join('|')}||`);
  }
  return blocks.join(', ');
}

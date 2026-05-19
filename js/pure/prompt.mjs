// 프롬프트 파싱 — 자유 입력 텍스트에서 태그/시퀀스 분리.
// `1.3::tag::` 가중치 문법 인지 → :: 안의 콤마는 분리자가 아님.

/**
 * 자유 프롬프트 텍스트를 콤마 기준으로 토큰화.
 * 가중치 표기 `:: ... ::` 내부의 콤마는 분리자가 아님.
 */
export function parseFreePromptTokens(text){
  const tokens = [];
  let cur = '';
  let inWeight = false;
  let i = 0;
  while(i < text.length){
    const c = text[i];
    if(c === ':' && text[i+1] === ':'){
      inWeight = !inWeight;
      cur += '::';
      i += 2;
    } else if(c === ',' && !inWeight){
      const t = cur.trim();
      if(t) tokens.push(t);
      cur = '';
      i++;
    } else {
      cur += c;
      i++;
    }
  }
  if(cur.trim()) tokens.push(cur.trim());
  return tokens;
}

/** 같은 태그(대소문자/공백 무시)가 두 번 이상 나오면 첫 번째만 남김. */
export function dedupePromptTags(text){
  if(!text || !text.trim()) return text;
  const tokens = parseFreePromptTokens(text);
  const seen = new Set();
  const out = [];
  for(const tok of tokens){
    const norm = tok.toLowerCase().replace(/\s+/g, ' ').trim();
    if(!norm) continue;
    if(seen.has(norm)) continue;
    seen.add(norm);
    out.push(tok);
  }
  return out.join(', ');
}

/**
 * 시퀀스 입력(`## 라벨` 헤더로 블록 분리) → [{label, prompt}] 배열.
 * 빈 프롬프트는 제외.
 */
export function parseSeqInput(text){
  const lines = text.split('\n');
  const items = [];
  let cur = null;
  for(const line of lines){
    const m = line.match(/^\s*##\s*(.*)$/);
    if(m){
      if(cur) items.push(cur);
      cur = {label: m[1].trim() || ('Block'+(items.length+1)), prompt:''};
    } else {
      if(!cur) cur = {label:'A', prompt:''};
      cur.prompt += (cur.prompt ? '\n' : '') + line;
    }
  }
  if(cur) items.push(cur);
  return items.map(it => ({label: it.label, prompt: it.prompt.trim()})).filter(it => it.prompt);
}

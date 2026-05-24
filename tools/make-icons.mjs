// 의존성 0 — Node 내장 zlib 으로 PNG 파일 직접 생성.
// PWA manifest 가 참조할 정적 icon-192.png / icon-512.png 를 만든다.
// WebAPK 생성에는 비트맵(PNG) 아이콘이 필요 — SVG·data: URL 은 거부됨.
//
// 디자인: 둥근 사각 배경(cream #ebe2cd) + 두꺼운 보더(orange #a25a1f) + 가운데 'NAI' 점.
// 텍스트 렌더링은 Node에 없어서 도형으로만 표현. 사용자가 원하면 나중에 PNG 교체 가능.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, constants as zc } from 'node:zlib';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// PNG 헬퍼 — chunk 작성 (length + type + data + CRC32).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for(let i = 0; i < 256; i++){
    let c = i;
    for(let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();
function crc32(buf){
  let c = 0xffffffff;
  for(let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// 디자인: cream 바탕 + orange 두꺼운 보더 + 가운데 orange 원.
const C_BG = [0xeb, 0xe2, 0xcd, 0xff];       // cream
const C_FG = [0xa2, 0x5a, 0x1f, 0xff];       // orange
const BORDER_RATIO = 0.06;                     // 6% of size = border thickness
const CORNER_RATIO = 0.18;                     // 18% rounded corner
const DOT_RATIO = 0.10;                        // 중앙 점 크기

function makePng(size){
  const border = Math.round(size * BORDER_RATIO);
  const corner = Math.round(size * CORNER_RATIO);
  const dotR = Math.round(size * DOT_RATIO);
  const cx = size / 2, cy = size / 2;
  // RGBA 픽셀 버퍼 (filter byte per row 포함)
  const rowLen = size * 4 + 1;
  const raw = Buffer.alloc(rowLen * size);
  // 둥근 사각 안인지 + 보더 안인지 + 중앙 점인지 판정.
  const inRoundRect = (x, y, r) => {
    // 모서리 반경 r 의 둥근 사각 — 코너만 원 거리 검사.
    if(x >= r && x < size - r) return y >= 0 && y < size;
    if(y >= r && y < size - r) return x >= 0 && x < size;
    // 네 모서리: 가장 가까운 코너 중심까지 거리.
    const ccx = x < r ? r : (size - 1 - r);
    const ccy = y < r ? r : (size - 1 - r);
    const dx = x - ccx, dy = y - ccy;
    return dx * dx + dy * dy <= r * r;
  };
  for(let y = 0; y < size; y++){
    raw[y * rowLen] = 0;   // filter type = 0 (none)
    for(let x = 0; x < size; x++){
      const i = y * rowLen + 1 + x * 4;
      const inOuter = inRoundRect(x, y, corner);
      if(!inOuter){
        // 투명 (배경 — Android adaptive icon 호환)
        raw[i] = 0; raw[i+1] = 0; raw[i+2] = 0; raw[i+3] = 0;
        continue;
      }
      // 보더 영역 (외곽 - 보더두께 까지 안쪽이 cream)
      const inInner = inRoundRect(x, y, Math.max(0, corner - border));
      // 내부 경계 계산: 보더만큼 안쪽 사각 + 둥근모서리 보정.
      const inside = x >= border && x < size - border && y >= border && y < size - border && inRoundRect(x, y, Math.max(0, corner - border));
      // 중앙 점.
      const ddx = x - cx, ddy = y - cy;
      const inDot = ddx * ddx + ddy * ddy <= dotR * dotR;
      let c;
      if(inDot) c = C_FG;
      else if(inside) c = C_BG;
      else c = C_FG;   // 보더
      raw[i] = c[0]; raw[i+1] = c[1]; raw[i+2] = c[2]; raw[i+3] = c[3];
    }
  }
  // IHDR: 13 bytes
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;     // bit depth
  ihdr[9] = 6;     // color type RGBA
  ihdr[10] = 0;    // compression
  ihdr[11] = 0;    // filter
  ihdr[12] = 0;    // interlace
  const idat = deflateSync(raw, {level: zc.Z_BEST_COMPRESSION});
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for(const size of [192, 512]){
  const png = makePng(size);
  const out = join(ROOT, `icon-${size}.png`);
  writeFileSync(out, png);
  console.log(`✓ icon-${size}.png (${png.length.toLocaleString()}B)`);
}
console.log('\n✓ PWA icons generated');

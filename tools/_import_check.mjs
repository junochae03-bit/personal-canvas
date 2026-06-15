import { chromium } from 'playwright-core';
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const p = await browser.newPage({ viewport: {width:1280, height:900} });
await p.goto('http://127.0.0.1:8765/', {waitUntil:'networkidle'});
await p.waitForSelector('#prompt');
await p.waitForTimeout(400);

const result = await p.evaluate(async () => {
  async function makePng(label, withMeta){
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#a25a1f'; ctx.fillRect(0,0,256,256);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif'; ctx.fillText(label, 20, 130);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    if(!withMeta) return new File([blob], `${label}.png`, {type:'image/png'});
    const buf = new Uint8Array(await blob.arrayBuffer());
    const comment = JSON.stringify({
      v4_prompt: {caption: {base_caption: 'imported V4 prompt'}},
      v4_negative_prompt: {caption: {base_caption: 'imported V4 negative'}},
      seed: 9999, model: 'nai-diffusion-4-5-full',
    });
    const enc = new TextEncoder();
    const key = enc.encode('Comment');
    const txt = enc.encode(comment);
    const data = new Uint8Array(key.length + 1 + txt.length);
    data.set(key, 0); data[key.length] = 0; data.set(txt, key.length + 1);
    const len = data.length;
    const header = new Uint8Array([(len>>>24)&255,(len>>>16)&255,(len>>>8)&255,len&255,116,69,88,116]);
    function crc32(arr){
      let c, table=[];
      for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);table[n]=c;}
      let crc=0xffffffff;
      for(let i=0;i<arr.length;i++) crc = table[(crc^arr[i])&255] ^ (crc>>>8);
      return (crc ^ 0xffffffff) >>> 0;
    }
    const typed = new Uint8Array(data.length + 4);
    typed.set([116,69,88,116], 0); typed.set(data, 4);
    const crcv = crc32(typed);
    const crc = new Uint8Array([(crcv>>>24)&255,(crcv>>>16)&255,(crcv>>>8)&255,crcv&255]);
    const out = new Uint8Array(buf.length + header.length + data.length + 4);
    out.set(buf.subarray(0, 33), 0);
    out.set(header, 33);
    out.set(data, 33 + header.length);
    out.set(crc, 33 + header.length + data.length);
    out.set(buf.subarray(33), 33 + header.length + data.length + 4);
    return new File([out], `${label}.png`, {type:'image/png'});
  }
  async function makeJpg(label){
    const cv = document.createElement('canvas'); cv.width=256; cv.height=256;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#5d8a30'; ctx.fillRect(0,0,256,256);
    ctx.fillStyle='#fff'; ctx.font='bold 24px sans-serif'; ctx.fillText(label,20,130);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
    return new File([blob], `${label}.jpg`, {type:'image/jpeg'});
  }
  const files = [
    await makePng('with_v4_meta', true),
    await makePng('no_meta', false),
    await makeJpg('jpeg_image'),
  ];
  await window.DB.newSession('테스트 세션');
  const prevSid = window.DB.currentSessionId;
  await window.importImagesToGallery(files);
  const sessions = await window.DB.getSessions();
  const importSes = sessions.find(s => s.label === '📥 가져온 이미지');
  const imgs = await window.DB.getSessionImages(importSes.id);
  const meta = imgs.find(i => /with_v4_meta/.test(i.label))?.meta || {};
  return {
    sessionCount: sessions.length,
    importedCount: imgs.length,
    extractedPrompt: meta.prompt,
    extractedNeg: meta.neg,
    extractedSeed: meta.seed,
    mode: meta.mode,
    sidRestored: window.DB.currentSessionId === prevSid,
  };
});
console.log(JSON.stringify(result, null, 2));

await p.evaluate(() => window.setMainPane('gallery'));
await p.waitForTimeout(1000);
await p.screenshot({path:'/tmp/import_gallery.png', fullPage:false});
await browser.close();

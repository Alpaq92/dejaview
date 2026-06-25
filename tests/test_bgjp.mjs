// Synthetic BGjp conformance test: wrap a real JPEG as a DjVu BGjp background,
// then decode it through the full pipeline (IFF parse -> bgJpeg extraction ->
// pure-JS JPEG decode -> compositing). Usage: node tests/test_bgjp.mjs <jpeg>
import { readFileSync, writeFileSync } from 'node:fs';
import { DjVuDoc } from '../src/document.js';
import { renderPage } from '../src/render.js';
import { decodeJpeg } from '../src/jpeg.js';
import { encodeRGBPNG } from './png.mjs';

const cc = (s) => [...s].map((c) => c.charCodeAt(0));
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (id, data) => { const o = cc(id).concat(u32(data.length), data); if (data.length & 1) o.push(0); return o; };

function buildBGjpDjVu(jpeg, w, h) {
  const info = [(w >> 8) & 255, w & 255, (h >> 8) & 255, h & 255, 21, 0, 100, 0, 22, 0];
  const body = cc('DJVU').concat(chunk('INFO', info), chunk('BGjp', [...jpeg]));
  const file = cc('AT&T').concat(cc('FORM'), u32(body.length), body);
  return new Uint8Array(file);
}

const jpegPath = process.argv[2];
if (!jpegPath) { console.log('usage: node tests/test_bgjp.mjs <baseline.jpg>  (no JPEG fixture is committed)'); process.exit(0); }
const jpeg = new Uint8Array(readFileSync(jpegPath));
const probe = decodeJpeg(jpeg);
const djvu = buildBGjpDjVu(jpeg, probe.width, probe.height);
writeFileSync(new URL('../refs_mit/synthetic_bgjp.djvu', import.meta.url), djvu);

const layers = new DjVuDoc(djvu).decodePageLayers(0);
console.log(`page ${layers.info.width}×${layers.info.height}, bgJpeg=${layers.bgJpeg ? layers.bgJpeg.length + 'B' : 'MISSING'}, jb2=${!!layers.jb2}`);

// Node has no createImageBitmap, so this exercises the pure-JS fallback path.
const pm = decodeJpeg(layers.bgJpeg);
layers.bg = { getPixmap: () => pm };
const img = renderPage(layers, 1);
let nonwhite = 0;
for (let i = 0; i < img.rgba.length; i += 4) if (img.rgba[i] < 250 || img.rgba[i + 1] < 250 || img.rgba[i + 2] < 250) nonwhite++;
writeFileSync(new URL('../refs/bgjp_composited.png', import.meta.url), encodeRGBPNG(img.rgba, img.width, img.height));
console.log(`composited ${img.width}×${img.height}, non-white ${(100 * nonwhite / (img.rgba.length / 4)).toFixed(0)}%`);
console.log(layers.bgJpeg && img.width === probe.width && img.height === probe.height ? 'PASS' : 'FAIL');

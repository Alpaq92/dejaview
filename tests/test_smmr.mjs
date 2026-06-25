// Synthetic Smmr (MMR/G4) conformance test. Encodes a known bitmap with our
// test-only T.6 encoder, then proves the full path: raw G4 -> src/mmr.js (round
// trip), wrapped in a DjVu Smmr chunk -> DjVuDoc (end to end). A pdf.js cross
// check is added in test_smmr_oracle.mjs.
import { writeFileSync } from 'node:fs';
import { decodeMMR } from '../src/mmr.js';
import { DjVuDoc } from '../src/document.js';
import { encodeG4, buildSmmrChunk } from './g4enc.mjs';
import { encodeRGBPNG } from './png.mjs';
import { CCITTFaxDecoder } from './ccitt_oracle.mjs';

const W = 220, HT = 140;
const bmp = new Uint8Array(W * HT);
for (let y = 0; y < HT; y++) {
  for (let x = 0; x < W; x++) {
    let v = 0;
    if (y >= 18 && y < 58 && x >= 40 && x < 184) v = 1;                               // wide rect: V0 + makeup
    if (y >= 78 && y < 120 && x >= 16 && x < 204 && Math.floor(x / 7) % 2 === 0) v ^= 1; // vertical stripes
    bmp[y * W + x] = v;
  }
}
for (let y = 0; y < HT; y++) {                                                          // diagonal: VR1/VL1 + H crossings
  const x = 12 + Math.floor((y * 190) / HT);
  if (x < W) bmp[y * W + x] = 1;
  if (x + 1 < W) bmp[y * W + x + 1] = 1;
}
for (let y = 124; y < 130; y++) for (let x = 0; x < W; x++) bmp[y * W + x] = 1;          // full-width bar: black + white makeup runs

const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const MODE = { 1: 'H', 2: 'V0', 3: 'VR1', 4: 'VR2', 5: 'VR3', 6: 'VL1', 7: 'VL2', 8: 'VL3' };

const { data, counts } = encodeG4(bmp, W, HT);
console.log(`encoded ${W}×${HT} -> ${data.length} bytes of G4`);
console.log('modes used: ' + Object.entries(counts).map(([k, n]) => `${MODE[k] || k}=${n}`).join(' ') + ` (makeup codes=${counts.mk || 0})`);

// 1) round trip through our decoder (raw chunk)
const chunk = buildSmmrChunk(data, W, HT);
const m = decodeMMR(chunk);
const rt = eq(m.data, bmp);
console.log(`round trip (src/mmr.js): ${m.width}×${m.height}, pixels ${rt ? 'MATCH' : 'DIFFER'}`);

// 2) end to end through DjVuDoc (synthetic Smmr DjVu)
const cc = (s) => [...s].map((c) => c.charCodeAt(0));
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ck = (id, d) => { const o = cc(id).concat(u32(d.length), [...d]); if (d.length & 1) o.push(0); return o; };
const info = [(W >> 8) & 255, W & 255, (HT >> 8) & 255, HT & 255, 21, 0, 100, 0, 22, 0];
const body = cc('DJVU').concat(ck('INFO', info), ck('Smmr', chunk));
const djvu = new Uint8Array(cc('AT&T').concat(cc('FORM'), u32(body.length), body));
const layers = new DjVuDoc(djvu).decodePageLayers(0);
const e2e = layers.mask && eq(layers.mask.data, bmp);
console.log(`end to end (DjVuDoc): mask ${layers.mask ? layers.mask.width + '×' + layers.mask.height : 'MISSING'}, pixels ${e2e ? 'MATCH' : 'DIFFER'}`);

// 3) independent cross-check: decode the same raw G4 with pdf.js's CCITTFaxDecoder
function decodeWithOracle(g4, width, height) {
  let pos = 0;
  const dec = new CCITTFaxDecoder({ next: () => (pos < g4.length ? g4[pos++] : -1) },
    { K: -1, Columns: width, Rows: height, BlackIs1: true, EncodedByteAlign: false, EndOfBlock: false });
  const bpr = (width + 7) >> 3;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let bx = 0; bx < bpr; bx++) {
      const b = dec.readNextChar();
      if (b < 0) break;
      for (let k = 0; k < 8; k++) { const x = bx * 8 + k; if (x < width) out[y * width + x] = (b >> (7 - k)) & 1; }
    }
  }
  return out;
}
const oracle = decodeWithOracle(data, W, HT);
const oN = eq(oracle, bmp), oI = eq(oracle.map((v) => v ^ 1), bmp);
const oracleOk = oN || oI;
console.log(`pdf.js oracle (CCITTFaxDecoder): pixels ${oN ? 'MATCH' : oI ? 'MATCH (inverted polarity)' : 'DIFFER'}`);

// dump a PNG to eyeball (black ink on white)
const rgba = new Uint8Array(W * HT * 4);
for (let i = 0; i < W * HT; i++) { const g = m.data[i] ? 0 : 255; rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g; rgba[i * 4 + 3] = 255; }
writeFileSync(new URL('../refs/smmr_decoded.png', import.meta.url), encodeRGBPNG(rgba, W, HT));

const ok = rt && e2e && oracleOk && counts[2] && (counts[3] || counts[6]) && counts[1] && counts.mk;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);

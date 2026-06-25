// Decode a page's Sjbz (JB2 mask), report stats, and write a PNG preview.
import { readFileSync, writeFileSync } from 'node:fs';
import { DjVuDocument, parseInfo } from '../src/iff.js';
import { decodeJB2Image } from '../src/jb2.js';
import { encodeGrayPNG, maskToGrayPreview } from './png.mjs';

const file = new URL('../samples/commons_example.djvu', import.meta.url);
const pageIdx = process.argv[2] ? parseInt(process.argv[2], 10) - 1 : 2; // default page 3
const u8 = new Uint8Array(readFileSync(file));
const doc = new DjVuDocument(u8);
const page = doc.pages[pageIdx];
const info = parseInfo(page.child('INFO'));
const sjbz = page.child('Sjbz');
console.log(`Page ${pageIdx + 1}: ${info.width}×${info.height}, Sjbz ${sjbz.bytes.length} bytes`);

const t0 = process.hrtime.bigint();
const dec = decodeJB2Image(sjbz.bytes);
const t1 = process.hrtime.bigint();
console.log(`decoded in ${(Number(t1 - t0) / 1e6).toFixed(0)} ms`);
console.log(`image: ${dec.image_columns}×${dec.image_rows}, shapes: ${dec.shapes.length}, blits: ${dec.blits.length}`);

const { width: W, height: H, mask } = dec.renderMask();
let ink = 0;
for (let i = 0; i < mask.length; i++) ink += mask[i];
console.log(`ink coverage: ${(100 * ink / mask.length).toFixed(2)}%`);

const { gray, outW, outH } = maskToGrayPreview(mask, W, H, 850);
const png = encodeGrayPNG(gray, outW, outH);
const outPath = new URL(`../refs/page${pageIdx + 1}_mask.png`, import.meta.url);
writeFileSync(outPath, png);
console.log(`wrote ${outW}×${outH} preview PNG`);

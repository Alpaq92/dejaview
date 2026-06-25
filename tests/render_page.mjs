// Full page pipeline via the high-level API -> color PNG (uses the live renderer).
import { readFileSync, writeFileSync } from 'node:fs';
import { DjVuDoc } from '../src/document.js';
import { renderPage } from '../src/render.js';
import { encodeRGBPNG, downscaleRGBA } from './png.mjs';

const file = new URL('../samples/commons_example.djvu', import.meta.url);
const pageIdx = process.argv[2] ? parseInt(process.argv[2], 10) - 1 : 0;
const doc = new DjVuDoc(new Uint8Array(readFileSync(file)));

const t0 = process.hrtime.bigint();
const layers = doc.decodePageLayers(pageIdx);
const composed = renderPage(layers, 1); // subsample 1 = full resolution
const t1 = process.hrtime.bigint();

console.log(`Page ${pageIdx + 1}: ${composed.width}×${composed.height}`);
console.log(`  mask blits ${layers.jb2 ? layers.jb2.blits.length : 0}, FGbz ${layers.fgbz ? `${layers.fgbz.palette.length} colors` : 'none'}, BG44 ${layers.bg ? 'yes' : 'no'}`);
console.log(`  full pipeline ${(Number(t1 - t0) / 1e6).toFixed(0)} ms`);

const { rgba, outW, outH } = downscaleRGBA(composed.rgba, composed.width, composed.height, 850);
writeFileSync(new URL(`../refs/page${pageIdx + 1}_full.png`, import.meta.url), encodeRGBPNG(rgba, outW, outH));
console.log(`  wrote ${outW}×${outH} composited preview PNG`);

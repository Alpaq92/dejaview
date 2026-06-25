// Decode every page of a document, report failures + timing, and dump a few
// page previews so output can be eyeballed.
import { readFileSync, writeFileSync } from 'node:fs';
import { DjVuDoc } from '../src/document.js';
import { renderPage, subsampleForWidth } from '../src/render.js';
import { encodeRGBPNG } from './png.mjs';

const file = process.argv[2];
const u8 = new Uint8Array(readFileSync(file));
const t0 = process.hrtime.bigint();
const doc = new DjVuDoc(u8);
console.log(`${file}: ${doc.pageCount} pages`);

const dumps = new Set([0, Math.floor(doc.pageCount / 2), doc.pageCount - 1]);
let ok = 0, fail = 0, totalMs = 0;
const base = file.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');

for (let i = 0; i < doc.pageCount; i++) {
  const ts = process.hrtime.bigint();
  try {
    const layers = doc.decodePageLayers(i);
    const ss = subsampleForWidth(layers.info.width, 850);
    const img = renderPage(layers, ss);
    const ms = Number(process.hrtime.bigint() - ts) / 1e6;
    totalMs += ms;
    ok++;
    if (dumps.has(i)) {
      writeFileSync(new URL(`../refs/stress_${base}_p${i + 1}.png`, import.meta.url), encodeRGBPNG(img.rgba, img.width, img.height));
      console.log(`  page ${i + 1}: ${layers.info.width}×${layers.info.height} -> ${img.width}×${img.height} in ${ms.toFixed(0)} ms  [dumped]`);
    }
  } catch (e) {
    fail++;
    console.log(`  page ${i + 1}: FAILED — ${e.message}`);
  }
}
const wall = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`decoded ${ok}/${doc.pageCount} ok, ${fail} failed; ${totalMs.toFixed(0)} ms decode (${(totalMs / doc.pageCount).toFixed(0)} ms/page avg), ${wall.toFixed(0)} ms wall`);

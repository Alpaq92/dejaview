// End-to-end: DjVuDoc -> decodePageLayers -> renderPage (scaled) -> PNG.
import { readFileSync, writeFileSync } from 'node:fs';
import { DjVuDoc } from '../src/document.js';
import { renderPage, subsampleForWidth } from '../src/render.js';
import { encodeRGBPNG } from './png.mjs';

const u8 = new Uint8Array(readFileSync(new URL('../samples/commons_example.djvu', import.meta.url)));
const doc = new DjVuDoc(u8);
console.log(`pages: ${doc.pageCount}, titles: ${JSON.stringify(doc.titles)}`);

for (let i = 0; i < doc.pageCount; i++) {
  const t0 = process.hrtime.bigint();
  const layers = doc.decodePageLayers(i);
  const ss = subsampleForWidth(layers.info.width, 850);
  const img = renderPage(layers, ss);
  const t1 = process.hrtime.bigint();
  console.log(`page ${i + 1}: ${layers.info.width}×${layers.info.height} -> render ${img.width}×${img.height} (subsample ${ss}) in ${(Number(t1 - t0) / 1e6).toFixed(0)} ms; words=${countWords(layers.text.page)}`);
  writeFileSync(new URL(`../refs/pipe_page${i + 1}.png`, import.meta.url), encodeRGBPNG(img.rgba, img.width, img.height));
}

function countWords(zone) {
  if (!zone) return 0;
  let n = zone.type === 6 ? 1 : 0;
  for (const c of zone.children) n += countWords(c);
  return n;
}

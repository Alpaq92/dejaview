// Validate the hidden-text zone parser against the sample.
import { readFileSync } from 'node:fs';
import { DjVuDocument } from '../src/iff.js';
import { parseText, collectZones, zoneText, ZoneType } from '../src/text.js';

const u8 = new Uint8Array(readFileSync(new URL('../samples/commons_example.djvu', import.meta.url)));
const doc = new DjVuDocument(u8);

doc.pages.forEach((page, i) => {
  const chunk = page.child('TXTz') || page.child('TXTa');
  if (!chunk) { console.log(`Page ${i + 1}: no text`); return; }
  const { text, page: pz } = parseText(chunk);
  const words = collectZones(pz, ZoneType.WORD);
  const lines = collectZones(pz, ZoneType.LINE);
  console.log(`\nPage ${i + 1}: ${text.length} chars, ${lines.length} lines, ${words.length} words`);
  console.log(`  text: "${text.replace(/\s+/g, ' ').trim().slice(0, 90)}"`);
  const sample = words.slice(0, 4).map((w) => `"${zoneText(text, w)}"@(${w.xmin},${w.ymin},${w.xmax},${w.ymax})`);
  console.log(`  first words: ${sample.join('  ')}`);
});

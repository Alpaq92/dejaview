// Summarize a DjVu file's structure: form type, components, chunk types,
// and flags for features that stress the decoder (shared dicts, MMR, JPEG).
import { readFileSync } from 'node:fs';
import { DjVuDocument, parseInfo } from '../src/iff.js';

const file = process.argv[2];
const u8 = new Uint8Array(readFileSync(file));
const doc = new DjVuDocument(u8);
console.log(`${file}`);
console.log(`top form: ${doc.type}, pages: ${doc.pages.length}, components: ${doc.components.length}, DIRM: ${!!doc.dirm}`);

const chunkCounts = {};
let djvi = 0;
for (const c of doc.components) {
  if (c.formType === 'DJVI') djvi++;
  for (const ch of c.children) chunkCounts[ch.id] = (chunkCounts[ch.id] || 0) + 1;
}
console.log('DJVI (shared) components:', djvi);
console.log('chunk types across components:', Object.entries(chunkCounts).map(([k, v]) => `${k}×${v}`).join(', '));

const flag = (id) => chunkCounts[id] ? 'YES' : 'no';
console.log(`features → Djbz(shared dict): ${flag('Djbz')}  INCL: ${flag('INCL')}  Smmr(MMR): ${flag('Smmr')}  BGjp(JPEG bg): ${flag('BGjp')}  FGjp: ${flag('FGjp')}  FG44: ${flag('FG44')}  BG44: ${flag('BG44')}  FGbz: ${flag('FGbz')}`);

// First page detail
const p0 = doc.pages[0];
if (p0) {
  const info = p0.child('INFO') ? parseInfo(p0.child('INFO')) : null;
  console.log(`page 1: ${info ? info.width + '×' + info.height + ' @' + info.dpi : '?'}; chunks: ${p0.children.map((c) => c.name).join(', ')}`);
}

// Decode a page's BG44 (IW44 background) and write an RGB PNG preview.
import { readFileSync, writeFileSync } from 'node:fs';
import { DjVuDocument, parseInfo } from '../src/iff.js';
import { decodeIW44 } from '../src/iw44.js';
import { encodeRGBPNG, downscaleRGBA } from './png.mjs';

const file = new URL('../samples/commons_example.djvu', import.meta.url);
const pageIdx = process.argv[2] ? parseInt(process.argv[2], 10) - 1 : 0;
const u8 = new Uint8Array(readFileSync(file));
const doc = new DjVuDocument(u8);
const page = doc.pages[pageIdx];
const info = parseInfo(page.child('INFO'));
const bg = page.childrenWith('BG44');
console.log(`Page ${pageIdx + 1}: ${info.width}×${info.height}, BG44 chunks: ${bg.length} (${bg.map((c) => c.bytes.length).join(', ')} bytes)`);
if (!bg.length) { console.log('no BG44 on this page'); process.exit(0); }

const t0 = process.hrtime.bigint();
const img = decodeIW44(bg.map((c) => c.bytes));
const pm = img.getPixmap();
const t1 = process.hrtime.bigint();
console.log(`IW44 ${pm.width}×${pm.height}, crcb_delay=${img.crcb_delay}, crcb_half=${img.crcb_half}, decoded+reconstructed in ${(Number(t1 - t0) / 1e6).toFixed(0)} ms`);

const { rgba, outW, outH } = downscaleRGBA(pm.rgba, pm.width, pm.height, 850);
const png = encodeRGBPNG(rgba, outW, outH);
writeFileSync(new URL(`../refs/page${pageIdx + 1}_bg.png`, import.meta.url), png);
console.log(`wrote ${outW}×${outH} background preview PNG`);

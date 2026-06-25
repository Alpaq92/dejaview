// Generate src/zp_table.js from DjvuNet's ZPCodec.cs CreateDefaultTable() (MIT).
// These are the ZP coder's format-defined adaptation constants (Bottou's
// ZP-coder); identical across every conformant DjVu implementation. Sourced
// from the MIT-licensed DjvuNet so the project carries no GPL lineage.
//
// Run: node tools/gen_zptable.mjs   (needs refs_mit/ZPCodec.cs from DjvuNet)
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../refs_mit/ZPCodec.cs', import.meta.url), 'utf8');
const start = src.indexOf('CreateDefaultTable');
if (start < 0) throw new Error('CreateDefaultTable not found');

const re = /new ZPTable\(\s*0x([0-9a-fA-F]+)\s*,\s*0x([0-9a-fA-F]+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g;
re.lastIndex = start;
const rows = [];
let m;
while ((m = re.exec(src))) {
  rows.push([parseInt(m[1], 16), parseInt(m[2], 16), +m[3], +m[4]]); // P, M, Up, Down
  if (rows.length === 251) break;
}
if (rows.length !== 251) throw new Error(`expected 251 ZP states, got ${rows.length}`);
while (rows.length < 256) rows.push([0, 0, 0, 0]);

const col = (k) => rows.map((r) => r[k]).join(',');
const out = `// AUTO-GENERATED from DjvuNet ZPCodec.cs CreateDefaultTable() (MIT-licensed).
// The ZP coder's format-defined adaptation table (251 states, padded to 256).
// Regenerate with: node tools/gen_zptable.mjs
export const ZP_P  = Uint16Array.from([${col(0)}]);
export const ZP_M  = Uint16Array.from([${col(1)}]);
export const ZP_UP = Uint8Array.from([${col(2)}]);
export const ZP_DN = Uint8Array.from([${col(3)}]);
`;
writeFileSync(new URL('../src/zp_table.js', import.meta.url), out);
console.log(`wrote src/zp_table.js (${rows.length} rows, 251 defined) from DjvuNet (MIT)`);
const ok = rows[0][0] === 0x8000 && rows[0][2] === 84 && rows[0][3] === 145
  && rows[3][0] === 0x6bbd && rows[250][2] === 230 && rows[250][3] === 246;
console.log('spot-check', ok ? 'PASS' : 'FAIL');
if (!ok) process.exit(1);

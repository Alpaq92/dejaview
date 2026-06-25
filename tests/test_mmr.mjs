// Smoke-test the MMR decoder with hand-built G4 streams. (No real Smmr sample
// is available, so this exercises the header, bit source, mode table, and the
// reference-line machinery via the simplest case: all-white lines = one V0 each.)
import { decodeMMR } from '../src/mmr.js';

function hdr(w, h, flags) {
  return [0x4d, 0x4d, 0x52, flags, (w >> 8) & 255, w & 255, (h >> 8) & 255, h & 255];
}

// 16x4 all white: 4 V0 codes ("1" each) = 0b11110000 = 0xF0
let r = decodeMMR(new Uint8Array([...hdr(16, 4, 0x00), 0xF0]));
let ink = r.data.reduce((a, v) => a + v, 0);
console.log(`all-white 16x4: ${r.width}x${r.height}, ink=${ink} (expect 0) — ${r.width === 16 && r.height === 4 && ink === 0 ? 'PASS' : 'FAIL'}`);

// Same, but inverted: white becomes ink, so every pixel is set.
r = decodeMMR(new Uint8Array([...hdr(16, 4, 0x01), 0xF0]));
ink = r.data.reduce((a, v) => a + v, 0);
console.log(`inverted 16x4:  ${r.width}x${r.height}, ink=${ink} (expect ${16 * 4}) — ${ink === 16 * 4 ? 'PASS' : 'FAIL'}`);

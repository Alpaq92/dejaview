// Test-only CCITT Group 4 (ITU-T T.6 / DjVu "Smmr" MMR) encoder. NOT shipped —
// it exists only to generate conformance fixtures for the Smmr decoder
// (src/mmr.js). It is pass-free (vertical + horizontal modes only): that is still
// valid T.6, and it avoids the decoder's after-pass line-terminator path so the
// stream decodes identically on src/mmr.js and on the pdf.js oracle. Bits are
// packed MSB-first — the order both decoders read.
import { MR_CODES, W_CODES, B_CODES } from '../src/mmr_tables.js';

// Mode ids — must match the values in src/mmr.js.
const H = 1, V0 = 2, VR1 = 3, VR2 = 4, VR3 = 5, VL1 = 6, VL2 = 7, VL3 = 8;
const VMODE = { '0': V0, '1': VR1, '2': VR2, '3': VR3, '-1': VL1, '-2': VL2, '-3': VL3 };

// value -> {bits,len}, with the codeword right-aligned (tables store it left-aligned in nbits).
function encodeMap(codes, nbits) {
  const m = new Map();
  for (const [code, len, val] of codes) if (len !== 0) m.set(val, { bits: code >>> (nbits - len), len });
  return m;
}
const MODE = encodeMap(MR_CODES, 7);
const WHITE = encodeMap(W_CODES, 13);
const BLACK = encodeMap(B_CODES, 13);
const makeups = (m) => [...m.keys()].filter((v) => v >= 64).sort((a, b) => a - b);
const WMK = makeups(WHITE), BMK = makeups(BLACK);

class BitWriter {
  constructor() { this.bytes = []; this.cur = 0; this.n = 0; }
  put(bits, len) {
    for (let i = len - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | ((bits >>> i) & 1);
      if (++this.n === 8) { this.bytes.push(this.cur); this.cur = 0; this.n = 0; }
    }
  }
  finish() { if (this.n) { this.bytes.push((this.cur << (8 - this.n)) & 0xff); this.cur = this.n = 0; } return Uint8Array.from(this.bytes); }
}

// Emit a run of `len` pixels of `color` (0=white,1=black): makeup codes (>=64) then a terminating code.
function emitRun(w, color, len, counts) {
  const map = color ? BLACK : WHITE, mk = color ? BMK : WMK;
  while (len >= 64) {
    let m = mk[0];
    for (const v of mk) { if (v <= len) m = v; else break; }
    const c = map.get(m); w.put(c.bits, c.len); len -= m;
    if (counts) counts.mk = (counts.mk || 0) + 1;
  }
  const t = map.get(len); w.put(t.bits, t.len);
}

const put = (w, mode) => { const c = MODE.get(mode); w.put(c.bits, c.len); };
const firstGT = (arr, x, width) => { for (const p of arr) if (p > x) return p; return width; };

// Colour-change positions on a row, with an imaginary white pixel before index 0.
function changes(row, width) {
  const out = []; let prev = 0;
  for (let i = 0; i < width; i++) if (row[i] !== prev) { out.push(i); prev = row[i]; }
  return out;
}

function encodeLine(w, cur, ref, width, counts) {
  const cce = changes(cur, width), rce = changes(ref, width);
  let a0 = -1, color = 0;
  while (a0 < width) {
    const a1 = firstGT(cce, a0, width);
    // b1 = first reference change right of a0 whose colour is opposite to a0's.
    let b1 = width;
    for (const p of rce) if (p > a0 && ref[p] === (color ^ 1)) { b1 = p; break; }
    const d = a1 - b1;
    if (d >= -3 && d <= 3) {
      put(w, VMODE[d]); counts[VMODE[d]] = (counts[VMODE[d]] || 0) + 1;
      a0 = a1; color ^= 1;
    } else {
      const a2 = firstGT(cce, a1, width);
      put(w, H); counts[H] = (counts[H] || 0) + 1;
      emitRun(w, color, a1 - (a0 < 0 ? 0 : a0), counts);
      emitRun(w, color ^ 1, a2 - a1, counts);
      a0 = a2;
    }
  }
}

/** Encode a bilevel bitmap (Uint8 width*height, 1=black) to a raw T.6 bitstream. */
export function encodeG4(bitmap, width, height) {
  const w = new BitWriter();
  const counts = {};
  let ref = new Uint8Array(width); // imaginary all-white line above row 0
  for (let y = 0; y < height; y++) {
    const cur = bitmap.subarray(y * width, (y + 1) * width);
    encodeLine(w, cur, ref, width, counts);
    ref = cur;
  }
  return { data: w.finish(), counts };
}

/** Wrap a raw T.6 stream as a DjVu Smmr chunk: "MMR\0" magic + width16 + height16. */
export function buildSmmrChunk(g4, width, height) {
  const head = [0x4d, 0x4d, 0x52, 0x00, (width >> 8) & 255, width & 255, (height >> 8) & 255, height & 255];
  const out = new Uint8Array(head.length + g4.length);
  out.set(head, 0); out.set(g4, head.length);
  return out;
}

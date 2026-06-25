// Tiny grayscale PNG encoder (Node-only, for test visualization).
import { deflateSync } from 'node:zlib';

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length, false);
  out[4] = type.charCodeAt(0); out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2); out[7] = type.charCodeAt(3);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
  return out;
}

/** Encode an 8-bit grayscale image (gray: Uint8Array length w*h) to PNG bytes. */
export function encodeGrayPNG(gray, w, h) {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w, false);
  dv.setUint32(4, h, false);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 0;   // color type: grayscale
  // raw with per-row filter byte 0
  const raw = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    raw.set(gray.subarray(y * w, y * w + w), y * (w + 1) + 1);
  }
  const idat = deflateSync(raw);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Encode an RGB image (rgba: 4 bytes/pixel, length w*h*4) to PNG bytes. */
export function encodeRGBPNG(rgba, w, h) {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w, false);
  dv.setUint32(4, h, false);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: truecolor RGB
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    let o = y * (w * 3 + 1);
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw[o++] = rgba[i]; raw[o++] = rgba[i + 1]; raw[o++] = rgba[i + 2];
    }
  }
  const idat = deflateSync(raw);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Downscale an RGBA image to a smaller RGBA preview by block averaging. */
export function downscaleRGBA(rgba, W, H, targetW = 850) {
  const scale = Math.max(1, Math.ceil(W / targetW));
  const outW = Math.ceil(W / scale);
  const outH = Math.ceil(H / scale);
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = 0; dy < scale; dy++) {
        const y = oy * scale + dy; if (y >= H) break;
        for (let dx = 0; dx < scale; dx++) {
          const x = ox * scale + dx; if (x >= W) break;
          const i = (y * W + x) * 4;
          r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++;
        }
      }
      const o = (oy * outW + ox) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { rgba: out, outW, outH };
}

/** Downscale a top-origin bilevel mask to a grayscale preview (255=white). */
export function maskToGrayPreview(mask, W, H, targetW = 850) {
  const scale = Math.max(1, Math.ceil(W / targetW));
  const outW = Math.ceil(W / scale);
  const outH = Math.ceil(H / scale);
  const gray = new Uint8Array(outW * outH).fill(255);
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      let ink = 0, n = 0;
      for (let dy = 0; dy < scale; dy++) {
        const y = oy * scale + dy;
        if (y >= H) break;
        for (let dx = 0; dx < scale; dx++) {
          const x = ox * scale + dx;
          if (x >= W) break;
          ink += mask[y * W + x];
          n++;
        }
      }
      gray[oy * outW + ox] = n ? Math.round(255 * (1 - ink / n)) : 255;
    }
  }
  return { gray, outW, outH };
}

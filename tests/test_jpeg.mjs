// Smoke-test the vendored pure-JS JPEG decoder in Node.
import { readFileSync } from 'node:fs';
import { decodeJpeg } from '../src/jpeg.js';

const path = process.argv[2];
if (!path) { console.log('usage: node tests/test_jpeg.mjs <baseline.jpg>  (no JPEG fixture is committed)'); process.exit(0); }
const img = decodeJpeg(new Uint8Array(readFileSync(path)));
const expect = img.width * img.height * 4;
console.log(`decoded ${img.width}×${img.height}, rgba=${img.rgba.length} (expect ${expect})`);
console.log(`first pixel rgba: ${img.rgba[0]},${img.rgba[1]},${img.rgba[2]},${img.rgba[3]}`);
console.log(img.width > 0 && img.rgba.length === expect ? 'PASS' : 'FAIL');

// Node test harness. Validates the foundation (IFF + ZP + BZZ) against the
// Commons sample by parsing structure and extracting hidden TXTz text.
import { readFileSync } from 'node:fs';
import { DjVuDocument, parseInfo } from '../src/iff.js';
import { bzzDecompress } from '../src/bzz.js';
import { ByteStream } from '../src/bytestream.js';

const file = process.argv[2] || new URL('../samples/commons_example.djvu', import.meta.url);
const buf = readFileSync(file);
const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

const doc = new DjVuDocument(u8);
console.log(`Document type: ${doc.type}, pages: ${doc.pageCount}, components: ${doc.components.length}`);

function preview(bytes, n = 400) {
  const s = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    out += (c === 10 || c === 9 || c >= 32) ? ch : '·';
    if (out.length >= n) break;
  }
  return out.replace(/[\r\n]+/g, ' ⏎ ');
}

let okPages = 0;
doc.pages.forEach((page, idx) => {
  const info = page.child('INFO') ? parseInfo(page.child('INFO')) : null;
  const chunkIds = page.children.map((c) => c.name).join(', ');
  console.log(`\n── Page ${idx + 1} ──`);
  console.log(`  INFO: ${info ? `${info.width}×${info.height} @ ${info.dpi}dpi, v${info.version}, γ${info.gamma}, orient ${info.orientation}` : '(none)'}`);
  console.log(`  chunks: ${chunkIds}`);

  const txtz = page.child('TXTz');
  const txta = page.child('TXTa');
  if (txtz) {
    const raw = bzzDecompress(new ByteStream(txtz.bytes));
    console.log(`  TXTz: ${txtz.bytes.length} compressed → ${raw.length} bytes decompressed`);
    console.log(`  text preview: "${preview(raw)}"`);
    if (raw.length > 0) okPages++;
  } else if (txta) {
    console.log(`  TXTa: ${txta.bytes.length} bytes (uncompressed)`);
    console.log(`  text preview: "${preview(txta.bytes)}"`);
    okPages++;
  }
});

console.log(`\n${okPages}/${doc.pageCount} pages produced text. ${okPages === doc.pageCount ? 'PASS' : 'CHECK'}`);

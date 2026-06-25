// Decode/render worker. Keeps the document and a per-page layer cache off the
// main thread; replies with transferable RGBA so the UI never blocks on a big
// page. Simple request/response keyed by an id assigned by the caller.

import { DjVuDoc } from './document.js';
import { renderPage } from './render.js';
import { collectZones, zoneText, ZoneType } from './text.js';

let doc = null;
const layerCache = new Map();

function layers(i) {
  if (!layerCache.has(i)) layerCache.set(i, doc.decodePageLayers(i));
  return layerCache.get(i);
}

// Flatten WORD zones into a compact list the UI can position/search.
function words(textLayer) {
  const out = [];
  if (!textLayer || !textLayer.page) return out;
  for (const z of collectZones(textLayer.page, ZoneType.WORD)) {
    out.push({ xmin: z.xmin, ymin: z.ymin, xmax: z.xmax, ymax: z.ymax, str: zoneText(textLayer.text, z) });
  }
  return out;
}

// Decode a JPEG layer (BGjp/FGjp) with the browser's native codec, wrapped to
// look like an IW44 image (getPixmap()). Decoded once, then cached on the layer.
async function jpegPixmap(bytes) {
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
  const oc = new OffscreenCanvas(bmp.width, bmp.height);
  const cx = oc.getContext('2d');
  cx.drawImage(bmp, 0, 0);
  const id = cx.getImageData(0, 0, bmp.width, bmp.height);
  const pm = { width: bmp.width, height: bmp.height, rgba: id.data };
  bmp.close();
  return { getPixmap: () => pm };
}

async function ensureJpeg(l) {
  if (l.bgJpeg && !l.bg) l.bg = await jpegPixmap(l.bgJpeg);
  if (l.fgJpeg && !l.fgPixmap) l.fgPixmap = await jpegPixmap(l.fgJpeg);
  l.bgJpeg = l.fgJpeg = null;
}

self.onmessage = async (e) => {
  const { id, type } = e.data;
  try {
    if (type === 'open') {
      doc = new DjVuDoc(new Uint8Array(e.data.buffer));
      layerCache.clear();
      const infos = [];
      for (let i = 0; i < doc.pageCount; i++) infos.push(doc.pageInfo(i) || { width: 1000, height: 1400, dpi: 300 });
      self.postMessage({ id, pageCount: doc.pageCount, titles: doc.titles, infos });
    } else if (type === 'render') {
      const l = layers(e.data.index);
      await ensureJpeg(l);
      const img = renderPage(l, e.data.subsample);
      const w = l._words || (l._words = words(l.text));
      self.postMessage(
        { id, index: e.data.index, width: img.width, height: img.height, rgba: img.rgba, words: w },
        [img.rgba.buffer]);
    } else if (type === 'text') {
      const idx = e.data.index;
      const cached = layerCache.get(idx);
      const w = cached ? (cached._words || (cached._words = words(cached.text))) : words(doc.decodePageText(idx));
      self.postMessage({ id, words: w });
    } else {
      self.postMessage({ id, error: 'unknown request: ' + type });
    }
  } catch (err) {
    self.postMessage({ id, error: (err && err.message) || String(err) });
  }
};

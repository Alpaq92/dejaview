// JPEG-layer decode for DjVu BGjp/FGjp.
//
// Hybrid: prefer the browser's native JPEG codec (createImageBitmap — fast and
// handles every variant); otherwise fall back to JsPeg, a vendored pure-JS JPEG
// decoder (MIT) under ./jspeg/. The fallback covers Node and browsers without
// OffscreenCanvas in workers. JsPeg handles baseline, progressive and lossless.
import { JpegDecoder } from './jspeg/JpegDecoder.js';
import { JpegBufferOutputWriter } from './jspeg/output/JpegBufferOutputWriter.js';
import { componentsToRGBA, readAdobeTransform } from './jspeg/colorConverter.js';

/** Decode a JPEG (baseline or progressive) to interleaved RGBA via JsPeg. */
export function decodeJpeg(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const decoder = new JpegDecoder();
  decoder.setInput(data);
  decoder.identify(true);
  const { width, height, numberOfComponents } = decoder;
  const writer = new JpegBufferOutputWriter(width, height, numberOfComponents);
  decoder.setOutputWriter(writer);
  decoder.decode();
  const componentIds = decoder._getFrameHeader().components.map((c) => c.identifier);
  const rgba = componentsToRGBA({
    width, height, components: writer.components, componentIds,
    adobeTransform: readAdobeTransform(data),
  });
  return { width, height, rgba };
}

const asPixmap = (pm) => ({ getPixmap: () => pm });

/**
 * Hybrid JPEG -> pixmap: native codec when available, else the pure-JS JsPeg
 * decoder. Returns an object shaped like the IW44 pixmap (getPixmap()).
 */
export async function decodeJpegPixmap(bytes) {
  if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
    try {
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
      const oc = new OffscreenCanvas(bmp.width, bmp.height);
      const cx = oc.getContext('2d');
      cx.drawImage(bmp, 0, 0);
      const id = cx.getImageData(0, 0, bmp.width, bmp.height);
      const pm = { width: bmp.width, height: bmp.height, rgba: id.data }; // before close(): closed bitmaps report 0
      bmp.close();
      return asPixmap(pm);
    } catch { /* fall through to JsPeg */ }
  }
  return asPixmap(decodeJpeg(bytes));
}

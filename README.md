# DejaView

A **pure-JavaScript DjVu reader** for the browser — like PDF.js, but for `.djvu`.
No plugins, no WebAssembly, no native binaries, no build step. Every layer of the
format is decoded in plain ES modules and rendered to a `<canvas>`; decoding runs
in a Web Worker so the UI never blocks.

```
node tools/serve.mjs            # then open http://localhost:8080/
node tools/serve.mjs            #          or http://localhost:8080/?demo  (loads the bundled sample)
```

(A static server is required because ES modules and workers don't load from
`file://`. Any static server works; `tools/serve.mjs` is a zero-dependency one.)

## Features

- **Open** via file picker or drag-and-drop.
- **Render** single- and multi-page documents (`DJVU` / `DJVM`) to canvas.
- **Navigate**: prev/next, jump-to-page, arrow/PageUp-PageDown keys.
- **Zoom**: in/out, fit-width, fit-page, Ctrl+wheel.
- **Thumbnails** sidebar (rendered progressively in the worker).
- **Text**: a selectable/copyable hidden-text overlay aligned to the page.
- **Search** across all pages with highlighted matches and next/prev.

## What it decodes

DjVu stacks several codecs over a shared binary arithmetic coder. All are
implemented here in pure JS:

| Layer | Chunk | Module | What it is |
|------|-------|--------|------------|
| Arithmetic coder | — | `src/zp.js` | ZP adaptive binary coder (everything rides on it) |
| Container | `FORM`/`DJVM`/`DIRM` | `src/iff.js`, `src/document.js` | IFF tree, multi-page directory, `INCL` shared components |
| General compression | `BZZ` | `src/bzz.js` | Burrows-Wheeler + ZP (text, annotations, directory) |
| Bitonal mask | `Sjbz` / `Djbz` | `src/jb2.js` | JB2 text/line layer (symbol dictionary + cross-coding) |
| Bitonal mask (fax) | `Smmr` | `src/mmr.js` | CCITT Group 4 / ITU-T T.6 |
| Colour / photo | `BG44` / `FG44` | `src/iw44.js` | IW44 progressive wavelet image |
| Colour / photo (JPEG) | `BGjp` / `FGjp` | `src/jpeg.js` | hybrid: native `createImageBitmap` when available, else a vendored pure-JS decoder |
| Foreground colour | `FGbz` | `src/color.js` | DjVuPalette (per-blit colours) |
| Hidden text | `TXTz` / `TXTa` | `src/text.js` | UTF-8 text + zone tree with bounding boxes |
| Annotations | `ANTz` / `ANTa` | `src/annotations.js` | background colour, metadata |

Compositing (`src/render.js`) follows DjVu's 3-layer model: the background shows
through wherever the mask is clear, and the mask's ink is painted in its
foreground colour, with box-filter anti-aliasing when scaled down.

## Architecture

```
src/
  bytestream.js   byte reader (big/little-endian, sub-streams)
  zp.js           ZP arithmetic decoder  (+ zp_table.js, generated)
  bzz.js          BZZ decompressor
  iff.js          IFF/DJVU/DJVM parser + INFO
  jb2.js          JB2 bitonal decoder + bitmap
  mmr.js          MMR/G4 bitonal decoder (+ mmr_tables.js, ITU-T T.6)
  iw44.js         IW44 wavelet decoder
  color.js        FGbz palette parser
  text.js         TXT zone tree
  annotations.js  ANT parser
  document.js     high-level API: DIRM, INCL resolution, per-page layer decode
  render.js       scaled, anti-aliased compositor
  worker.js       runs the decoders off the main thread (+ native JPEG layers)
  viewer.js       the UI (no framework)
index.html, css/style.css
tools/serve.mjs   tiny static server
tools/gen_zptable.mjs  regenerates src/zp_table.js from DjvuNet (MIT)
tests/            Node test harnesses (decode + render to PNG)
```

The decoders are pure functions over `Uint8Array`s, which is why they drop
straight into a Web Worker and into Node for testing.

## Tests

```
node tests/run.mjs            # container + ZP + BZZ (prints extracted text)
node tests/render_jb2.mjs 3   # JB2 mask of page 3  -> refs/page3_mask.png
node tests/render_iw44.mjs 1  # IW44 background     -> refs/page1_bg.png
node tests/render_page.mjs 1  # full colour compose -> refs/page1_full.png
node tests/test_text.mjs      # hidden-text zones
node tests/test_mmr.mjs       # MMR smoke tests
node tests/test_pipeline.mjs  # full document API   -> refs/pipe_pageN.png
node tests/stress.mjs <file>  # decode every page of a document
```

## License & provenance

**MIT** — see [LICENSE](LICENSE). One vendored file, `src/jpeg.js` (the pure-JS
JPEG fallback, from jpeg-js), is permissively dual-licensed — **Apache-2.0**
(decoder core, © notmasteryet) and **BSD-3-Clause** (jpeg-js packaging, © Eugene
Ware); see [NOTICE](NOTICE) and `LICENSES/`.

DejaView's decoder is verified against the published DjVu specification
section-by-section — see [CONFORMANCE.md](CONFORMANCE.md).

DjVu is an open, published format. DejaView's codecs implement that public format
and were cross-referenced against **[DjvuNet](https://github.com/DjvuNet/DjvuNet)**
(an MIT-licensed .NET DjVu library); the ZP coder table is taken from DjvuNet, the
MMR tables are the **ITU-T T.6** standard, and the IW44 design follows Bottou et
al. The GPL **DjVuLibre** library was used only as a conformance *test oracle*
(to encode the sample files) and no DjVuLibre code is included or distributed.
See [NOTICE](NOTICE) for full attribution.

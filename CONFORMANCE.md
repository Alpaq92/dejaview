# DjVu spec conformance

This document maps DejaView's decoder to the **public DjVu specification**, to
show that the implementation follows the published format rather than any
particular source codebase.

## Sources (all public)

- **DjVu3 Reference** (Celartem/Lizardtech, v3) — the canonical format spec.
  HTML transcription: <https://www.sndjvu.org/spec.html>; original PDF:
  `DjVu3Spec.pdf`.
- **Bottou, Haffner, Howard, Simard, Bengio, Le Cun — "High Quality Document
  Image Compression with DjVu"**, J. Electronic Imaging 7(3), 1998.
  <https://leon.bottou.org/publications/pdf/jei-1998.pdf>
- **ITU-T T.6** — Group 4 (MMR) facsimile coding (for the `Smmr` chunk).

## Method

Each layer was checked against the spec section that defines it, independent of
any implementation. The GPL **DjVuLibre** library was used only as a *conformance
test oracle* — i.e. to encode the sample `.djvu` files used to validate output —
and no DjVuLibre code is included in this project (see [NOTICE](NOTICE)).

## Layer-by-layer conformance

| Layer | Spec | DejaView | Result |
|------|------|----------|--------|
| Container (IFF, `FORM:DJVU`/`DJVM`, `THUM`, `INCL`) | §7, §8.2–8.3.1 | `src/iff.js`, `src/document.js` | ✓ |
| `INFO` chunk (10 bytes: BE16 w/h, version, LE16 dpi, gamma, flags) | §8.3.11 | `src/iff.js parseInfo` | ✓ |
| `DIRM` directory (bundled bit+version, BE16 count, BE32[] offsets, BZZ BE24[] sizes / flag bytes / ZSTR id·name·title) | §8.3.2 | `src/document.js parseDIRM` | ✓ (incl. spec example bytes) |
| Z′-coder / ZP (decode Fig 1, pass-through Fig 2, init §12.2) | App. 3 (§12) | `src/zp.js` | ✓ |
| JB2 (record types Table 6; 1024 direct + 2048 refinement pixel contexts; integer decision-tree coder; contexts init 0) | App. 2 (§11) | `src/jb2.js` | ✓ |
| IW44 ((4,4) interpolative wavelet; 10 bands; cross-chunk persistence; color-chunk header §10.3; ⌈W/n⌉ subsample) | App. 1 (§10) | `src/iw44.js` | ✓ |
| BZZ (24-bit block 10K–4M, Burrows–Wheeler, EOB marker, Z′-coder) | App. 4 (§13) | `src/bzz.js` | ✓ |
| `Smmr` mask (Fax-G4/MMR) | §6.5, §7.1.3.1 | `src/mmr.js`, `src/mmr_tables.js` (ITU-T T.6) | ✓ |
| `FGbz` foreground colours (DjVuPalette) | §8.3.10 | `src/color.js` | ✓ |
| Hidden text (`TXTa`/`TXTz`) | §8.3.5 | `src/text.js` | ✓ |
| Annotations (`ANTa`/`ANTz`) | §8.3.4 | `src/annotations.js` | ✓ |

### Notable exact matches
- **Z′-coder** (Fig 1): the interval-reversion clamp `D = 0x6000 + (Z+A)/4`, the
  MPS/LPS branches with θ/μ/λ state updates, two-octet init of `C`, and the
  pass-through split `Z = 0x8000 + (A+A+A)/8` (Fig 2) match `src/zp.js` line for line.
- **JB2** (§11): "1024 contexts for direct coding … 2048 for refinement" =
  `bitdist[1024]` / `cbitdist[2048]`; record types in Table 6 map 1:1 to our
  constants (`NEW_MARK` … `MATCHED_COPY`); integers use the binary-decision-tree
  multivalue extension = our `codeNum`.
- **IW44** (§10.2): "Nothing is reinitialized at the beginning of chunks after
  the first, except the low-level arithmetic coder; the probability estimates are
  not reinitialized" — exactly our per-chunk handling (fresh ZP, persistent
  contexts + coefficient map).

## Empirical validation

The decoder renders, with zero failures:
- the multi-feature sample (`DJVM`, JB2 mask, IW44 colour, FGbz palette, hidden text),
- **258 pages** across three real, djvulibre-encoded Wikisource books (36, 48, and
  174 pages; bilevel + FG44 colour + 600/650-dpi scans), and
- **162 shared-dictionary pages** exercising `INCL` + `Djbz`: the 71-page DjVu spec
  itself (both INCL'd *and* inline dictionaries), an 85-page book whose pages each
  INCL two dictionaries plus shared annotations, and a 6-page NAVM/FGbz document.

Because those files are spec-conformant, correct output *is* conformance.

Two layers that are effectively absent from public corpora are validated with
**synthetic fixtures** instead:
- **`Smmr` (MMR / CCITT-G4):** a known bitmap is encoded to a raw T.6 stream by a
  test-only encoder, wrapped as an `Smmr` chunk, and decoded back pixel-identically
  three ways — by `src/mmr.js`, by the full `DjVuDoc` container path, and,
  independently, by pdf.js's `CCITTFaxDecoder` (so a round trip cannot hide a
  shared error). All vertical/horizontal modes and makeup codes are exercised.
  See `tests/test_smmr.mjs`.
- **`BGjp` / `FGjp` (JPEG):** a real JPEG is wrapped as a `BGjp` background and
  decoded + composited end-to-end. See `tests/test_bgjp.mjs`.

## Caveats (not correctness issues)
- The HTML transcription omits **Table 9** (the 256 ZP state rows); the canonical
  PDF stream isn't text-extractable. The spec confirms the table's structure
  (states init 0; steady-state 1–82; early-estimation ≥83); the values are the
  format's fixed tables, taken from DjvuNet (MIT) and proven by the 258-page decode.
- The spec counts "15 integer contexts"; we use 16 named contexts (as the
  reference implementations do). Each coded quantity uses a consistent,
  independent context, so this is a grouping nuance, not a decode difference.
- IW44 quantization: our `iw_quant` matches the spec's **Table 4** step-size table
  exactly (`0x04000, 0x08000, 0x08000, 0x10000, …`). DjvuNet uses a 4× scale that
  cancels in the output shift; ours is the spec-canonical one.

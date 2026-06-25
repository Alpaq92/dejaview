// DejaView viewer — vanilla ES-module UI. Decoding/rendering happens in a Web
// Worker (worker.js) so the UI stays responsive on large pages; this module is
// the UI: file open, canvas paint, navigation, zoom/fit, thumbnails, search,
// and a selectable hidden-text overlay.

const $ = (id) => document.getElementById(id);
const els = {
  open: $('open'), openInline: $('openInline'), loadSample: $('loadSample'), file: $('file'),
  prev: $('prev'), next: $('next'), pageNum: $('pageNum'), pageCount: $('pageCount'),
  zoomOut: $('zoomOut'), zoomIn: $('zoomIn'), zoomLabel: $('zoomLabel'),
  fitWidth: $('fitWidth'), fitPage: $('fitPage'),
  search: $('search'), searchPrev: $('searchPrev'), searchNext: $('searchNext'), searchInfo: $('searchInfo'),
  toggleThumbs: $('toggleThumbs'), thumbs: $('thumbs'),
  viewport: $('viewport'), stage: $('stage'), canvas: $('page'),
  textLayer: $('textLayer'), highlights: $('highlights'), status: $('status'),
};
const ctx = els.canvas.getContext('2d');
const DPR = Math.min(2, window.devicePixelRatio || 1);

// ---- worker RPC ------------------------------------------------------------
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let rpcId = 0;
const pending = new Map();
worker.onmessage = (e) => {
  const { id, error, ...rest } = e.data;
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  error ? p.reject(new Error(error)) : p.resolve(rest);
};
worker.onerror = (e) => status('Worker error: ' + e.message);
function rpc(type, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++rpcId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...params });
  });
}

const state = {
  pageCount: 0,
  infos: [],
  titles: [],
  pageIndex: 0,
  scale: 0.2,
  fitMode: 'width',
  renderToken: 0,
  currentWords: [],
  textIndex: null, // [{words}] per page
  matches: [],
  matchPos: -1,
};

// ---- status ----------------------------------------------------------------
let statusTimer;
function status(msg, sticky) {
  els.status.textContent = msg;
  els.status.classList.add('show');
  clearTimeout(statusTimer);
  if (!sticky) statusTimer = setTimeout(() => els.status.classList.remove('show'), 1400);
}
const hideStatus = () => els.status.classList.remove('show');

// ---- loading ---------------------------------------------------------------
async function loadBuffer(buf, name) {
  status('Opening ' + (name || 'document') + '…', true);
  let res;
  try {
    res = await rpc('open', { buffer: buf }); // buffer is transferred? keep simple: structured clone
  } catch (e) {
    status('Failed to open: ' + e.message);
    return;
  }
  state.pageCount = res.pageCount;
  state.infos = res.infos;
  state.titles = res.titles;
  state.pageIndex = 0;
  state.textIndex = null;
  state.matches = [];
  state.matchPos = -1;
  els.viewport.classList.add('has-doc');
  els.pageCount.textContent = '/ ' + state.pageCount;
  els.thumbs.innerHTML = '';
  els.search.value = '';
  els.searchInfo.textContent = '';
  document.title = `DejaView — ${name || 'document'}`;
  if (state.fitMode) applyFit();
  await renderCurrent();
  buildThumbs();
  buildTextIndex();
}

const loadFile = async (file) => loadBuffer(await file.arrayBuffer(), file.name);

// Load a document from a URL: the bundled sample (Load-sample button / ?demo)
// or an explicit ?file=path.
const SAMPLE_URL = 'samples/commons_example.djvu';
function loadFromURL(url) {
  const name = url.split('/').pop();
  status('Loading ' + name + '…', true);
  return fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('not found'))))
    .then((buf) => loadBuffer(buf, name))
    .catch((e) => status('Could not load ' + name + ': ' + e.message));
}

// ---- fit / zoom ------------------------------------------------------------
function applyFit() {
  const info = state.infos[state.pageIndex] || { width: 1000, height: 1400 };
  const availW = Math.max(320, els.viewport.clientWidth - 48);
  const availH = Math.max(320, els.viewport.clientHeight - 48);
  const s = state.fitMode === 'page'
    ? Math.min(availW / info.width, availH / info.height)
    : availW / info.width;
  state.scale = Math.max(0.05, Math.min(8, s));
}

function chooseSubsample(W, H) {
  let ss = Math.max(1, Math.round(1 / (state.scale * DPR)));
  const MAXDIM = 3000; // never render a catastrophically large bitmap
  while (W / ss > MAXDIM || H / ss > MAXDIM) ss++;
  return ss;
}

// ---- render ----------------------------------------------------------------
async function renderCurrent() {
  if (!state.pageCount) return;
  const i = state.pageIndex;
  const info = state.infos[i];
  const W = info.width, H = info.height;
  const token = ++state.renderToken;
  status('Decoding page ' + (i + 1) + '…', true);
  let res;
  try {
    res = await rpc('render', { index: i, subsample: chooseSubsample(W, H) });
  } catch (e) {
    status('Decode error on page ' + (i + 1) + ': ' + e.message);
    return;
  }
  if (token !== state.renderToken) return; // a newer render superseded this one

  els.canvas.width = res.width;
  els.canvas.height = res.height;
  ctx.putImageData(new ImageData(res.rgba, res.width, res.height), 0, 0);

  const cssW = Math.round(W * state.scale);
  const cssH = Math.round(H * state.scale);
  els.stage.style.width = els.canvas.style.width = cssW + 'px';
  els.stage.style.height = els.canvas.style.height = cssH + 'px';

  state.currentWords = res.words || [];
  els.pageNum.value = i + 1;
  els.zoomLabel.textContent = Math.round(state.scale * 100) + '%';
  els.prev.disabled = i <= 0;
  els.next.disabled = i >= state.pageCount - 1;

  buildTextLayer(state.currentWords, H);
  paintHighlights();
  updateThumbActive();
  hideStatus();
}

// ---- selectable text overlay ----------------------------------------------
function buildTextLayer(words, H) {
  els.textLayer.innerHTML = '';
  const s = state.scale;
  const frag = document.createDocumentFragment();
  for (const w of words) {
    const span = document.createElement('span');
    span.textContent = w.str;
    span.style.left = (w.xmin * s) + 'px';
    span.style.top = ((H - w.ymax) * s) + 'px';
    span.style.width = ((w.xmax - w.xmin) * s) + 'px';
    span.style.height = ((w.ymax - w.ymin) * s) + 'px';
    span.style.fontSize = Math.max(4, (w.ymax - w.ymin) * s * 0.85) + 'px';
    frag.appendChild(span);
  }
  els.textLayer.appendChild(frag);
}

// ---- search ----------------------------------------------------------------
function buildTextIndex() {
  const idx = new Array(state.pageCount);
  let p = 0;
  const step = async () => {
    if (!state.pageCount) return;
    try { idx[p] = { words: (await rpc('text', { index: p })).words }; }
    catch { idx[p] = { words: [] }; }
    p++;
    if (p < state.pageCount) setTimeout(step, 0);
    else { state.textIndex = idx; if (els.search.value.trim()) runSearch(); }
  };
  step();
}

function runSearch() {
  const q = els.search.value.trim().toLowerCase();
  state.matches = [];
  state.matchPos = -1;
  if (q && state.textIndex) {
    for (let pi = 0; pi < state.textIndex.length; pi++) {
      const page = state.textIndex[pi];
      if (!page) continue;
      page.words.forEach((w, wi) => { if (w.str.toLowerCase().includes(q)) state.matches.push({ page: pi, wi }); });
    }
  }
  if (!q) els.searchInfo.textContent = '';
  else if (!state.matches.length) els.searchInfo.textContent = 'no matches';
  if (state.matches.length) gotoMatch(0);
  else paintHighlights();
}

async function gotoMatch(pos) {
  if (!state.matches.length) return;
  state.matchPos = (pos + state.matches.length) % state.matches.length;
  const m = state.matches[state.matchPos];
  els.searchInfo.textContent = `${state.matchPos + 1} / ${state.matches.length}`;
  if (m.page !== state.pageIndex) { state.pageIndex = m.page; if (state.fitMode) applyFit(); await renderCurrent(); }
  else paintHighlights();
  const active = els.highlights.querySelector('.active');
  if (active) active.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
}

function paintHighlights() {
  els.highlights.innerHTML = '';
  if (!state.textIndex) return;
  const page = state.textIndex[state.pageIndex];
  if (!page) return;
  const H = (state.infos[state.pageIndex] || {}).height || 0;
  const s = state.scale;
  state.matches.forEach((m, mi) => {
    if (m.page !== state.pageIndex) return;
    const w = page.words[m.wi];
    const div = document.createElement('div');
    div.style.left = (w.xmin * s) + 'px';
    div.style.top = ((H - w.ymax) * s) + 'px';
    div.style.width = ((w.xmax - w.xmin) * s) + 'px';
    div.style.height = ((w.ymax - w.ymin) * s) + 'px';
    if (mi === state.matchPos) div.className = 'active';
    els.highlights.appendChild(div);
  });
}

// ---- thumbnails ------------------------------------------------------------
function buildThumbs() {
  els.thumbs.innerHTML = '';
  const queue = [];
  for (let i = 0; i < state.pageCount; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'thumb-wrap';
    const cv = document.createElement('canvas');
    cv.className = 'thumb';
    cv.dataset.page = i;
    cv.addEventListener('click', () => goto(i));
    wrap.appendChild(cv);
    const label = document.createElement('div');
    label.textContent = i + 1;
    wrap.appendChild(label);
    els.thumbs.appendChild(wrap);
    queue.push({ i, cv });
  }
  updateThumbActive();
  let qi = 0;
  const step = async () => {
    if (!state.pageCount || qi >= queue.length) return;
    const { i, cv } = queue[qi++];
    const info = state.infos[i];
    const ss = Math.max(1, Math.round(info.width / 150));
    try {
      const res = await rpc('render', { index: i, subsample: ss });
      cv.width = res.width; cv.height = res.height;
      cv.getContext('2d').putImageData(new ImageData(res.rgba, res.width, res.height), 0, 0);
    } catch (e) { /* ignore a bad thumbnail */ }
    setTimeout(step, 0);
  };
  setTimeout(step, 120); // let the first page render land first
}

function updateThumbActive() {
  els.thumbs.querySelectorAll('.thumb').forEach((cv) => {
    cv.classList.toggle('active', +cv.dataset.page === state.pageIndex);
  });
}

// ---- navigation ------------------------------------------------------------
async function goto(i) {
  if (!state.pageCount) return;
  i = Math.max(0, Math.min(state.pageCount - 1, i));
  if (i === state.pageIndex) return;
  state.pageIndex = i;
  if (state.fitMode) applyFit();
  await renderCurrent();
}

function setZoom(scale) {
  state.fitMode = null;
  state.scale = Math.max(0.05, Math.min(8, scale));
  renderCurrent();
}

// ---- events ----------------------------------------------------------------
els.open.addEventListener('click', () => els.file.click());
if (els.openInline) els.openInline.addEventListener('click', () => els.file.click());
if (els.loadSample) els.loadSample.addEventListener('click', () => loadFromURL(SAMPLE_URL));
els.file.addEventListener('change', (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); });

els.prev.addEventListener('click', () => goto(state.pageIndex - 1));
els.next.addEventListener('click', () => goto(state.pageIndex + 1));
els.pageNum.addEventListener('change', () => goto((+els.pageNum.value || 1) - 1));

els.zoomIn.addEventListener('click', () => setZoom(state.scale * 1.25));
els.zoomOut.addEventListener('click', () => setZoom(state.scale / 1.25));
els.fitWidth.addEventListener('click', () => { state.fitMode = 'width'; applyFit(); renderCurrent(); });
els.fitPage.addEventListener('click', () => { state.fitMode = 'page'; applyFit(); renderCurrent(); });

els.search.addEventListener('input', debounce(runSearch, 250));
els.searchNext.addEventListener('click', () => gotoMatch(state.matchPos + 1));
els.searchPrev.addEventListener('click', () => gotoMatch(state.matchPos - 1));
els.search.addEventListener('keydown', (e) => { if (e.key === 'Enter') gotoMatch(state.matchPos + (e.shiftKey ? -1 : 1)); });

els.toggleThumbs.addEventListener('click', () => els.thumbs.classList.toggle('hidden'));

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') goto(state.pageIndex + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goto(state.pageIndex - 1);
  else if (e.key === '+' || e.key === '=') setZoom(state.scale * 1.25);
  else if (e.key === '-') setZoom(state.scale / 1.25);
});

els.viewport.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setZoom(state.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
}, { passive: false });

['dragover', 'dragenter'].forEach((ev) => els.viewport.addEventListener(ev, (e) => {
  e.preventDefault(); els.viewport.classList.add('drag-over');
}));
['dragleave', 'drop'].forEach((ev) => els.viewport.addEventListener(ev, (e) => {
  e.preventDefault(); els.viewport.classList.remove('drag-over');
}));
els.viewport.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

window.addEventListener('resize', debounce(() => { if (state.fitMode) { applyFit(); renderCurrent(); } }, 150));

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Auto-load on ?demo (bundled sample) or ?file=path.
const params = new URLSearchParams(location.search);
const startUrl = params.get('file') || (params.has('demo') ? SAMPLE_URL : null);
if (startUrl) loadFromURL(startUrl);

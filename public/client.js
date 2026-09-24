// Browser half. Swaps ```mermaid fences for rendered diagrams wherever the board
// renders markdown: the .md file preview, the task-memory preview and the chat
// view's assistant prose.
//
// There is no slot for markdown rendering, so this works off the markup the core
// renderer (markdown-it) emits for a fence — <pre><code class="language-mermaid">
// — inside the three containers it renders into. If core renames one of those
// ids, that surface quietly stops getting diagrams and nothing else breaks.
//
// A module with no contributions is never told it was switched off, so the
// observers check for this extension's own <link> on every callback — the loader
// removes it on unload — and put the original code blocks back once it is gone.

const EXT_ID = 'mermaid';
const ROOT_IDS = ['file-body', 'memory-preview', 'chat-stream'];
const BLOCK = 'pre > code.language-mermaid';
const SCRIPT_URL = new URL('./vendor/mermaid.min.js', import.meta.url).href;
const CACHE_LIMIT = 100;

let contentObserver = null;
let themeObserver = null;
let theme = null;
let seq = 0;
let pending = new WeakSet(); // <pre>s already handed to a render, per theme
const sources = new WeakMap(); // diagram element -> its mermaid source
const cache = new Map(); // `${theme}\n${source}` -> { svg, id }
let queue = Promise.resolve();
let mermaidPromise = null;

const currentTheme = () => (document.body.classList.contains('light') ? 'default' : 'dark');
const stillEnabled = () => Boolean(document.querySelector(`link[data-ext="${EXT_ID}"]`));
// Mermaid scopes a diagram's styles and markers by the id it was rendered with,
// so a cached SVG shown again gets a fresh one. The trailing `z` keeps one id
// from being a prefix of another (awmmd1z vs awmmd12z).
const nextId = () => `awmmd${++seq}z`;

// Five megabytes, so only fetched once a diagram is actually on screen.
function loadMermaid() {
  if (globalThis.mermaid) return Promise.resolve(globalThis.mermaid);
  return (mermaidPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.onload = () => resolve(globalThis.mermaid);
    script.onerror = () => {
      mermaidPromise = null;
      script.remove();
      reject(new Error(`could not load ${SCRIPT_URL}`));
    };
    document.head.appendChild(script);
  }));
}

function remember(key, value) {
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

// Serialised because initialize() is global: two renders in flight under
// different themes would otherwise draw with whichever ran last.
function renderSvg(source, forTheme) {
  const job = queue.then(async () => {
    const mermaid = await loadMermaid();
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: forTheme });
    const id = nextId();
    const { svg } = await mermaid.render(id, source);
    return { svg, id };
  });
  queue = job.catch(() => {});
  return job;
}

const PAN_STEP = 50;
const ZOOM_STEP = 1.25;
const MIN_SCALE = 0.25;
const MAX_SCALE = 8;

// Laid out as a 3×3 pad: pan arrows round a reset, zoom in/out in the corners.
const CONTROLS = [
  ['pan-up', '↑', 'Pan up'], ['zoom-in', '+', 'Zoom in'],
  ['pan-left', '←', 'Pan left'], ['reset', '↺', 'Reset view'], ['pan-right', '→', 'Pan right'],
  ['pan-down', '↓', 'Pan down'], ['zoom-out', '−', 'Zoom out'],
];

function addPanZoom(fig, canvas) {
  let x = 0, y = 0, scale = 1;
  const apply = () => { canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; };
  const zoom = (factor) => { scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor)); };
  const actions = {
    'pan-up': () => { y += PAN_STEP; },
    'pan-down': () => { y -= PAN_STEP; },
    'pan-left': () => { x += PAN_STEP; },
    'pan-right': () => { x -= PAN_STEP; },
    'zoom-in': () => zoom(ZOOM_STEP),
    'zoom-out': () => zoom(1 / ZOOM_STEP),
    reset: () => { x = 0; y = 0; scale = 1; },
  };

  const controls = document.createElement('div');
  controls.className = 'mmd-controls';
  for (const [action, glyph, label] of CONTROLS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `mmd-btn mmd-${action}`;
    btn.textContent = glyph;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', () => { actions[action](); apply(); });
    controls.appendChild(btn);
  }
  fig.appendChild(controls);

  let drag = null;
  fig.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.mmd-controls')) return;
    drag = { px: e.clientX, py: e.clientY, x, y };
    fig.setPointerCapture(e.pointerId);
    fig.classList.add('mmd-dragging');
  });
  fig.addEventListener('pointermove', (e) => {
    if (!drag) return;
    x = drag.x + e.clientX - drag.px;
    y = drag.y + e.clientY - drag.py;
    apply();
  });
  const end = () => { drag = null; fig.classList.remove('mmd-dragging'); };
  fig.addEventListener('pointerup', end);
  fig.addEventListener('pointercancel', end);
}

function diagramElement({ svg, id }, source) {
  const fig = document.createElement('div');
  fig.className = 'mmd-diagram';
  const canvas = document.createElement('div');
  canvas.className = 'mmd-canvas';
  canvas.innerHTML = svg.split(id).join(nextId());
  fig.appendChild(canvas);
  addPanZoom(fig, canvas);
  sources.set(fig, source);
  return fig;
}

function codeBlock(source) {
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.className = 'language-mermaid';
  code.textContent = source;
  pre.appendChild(code);
  return pre;
}

function upgrade(code) {
  const pre = code.parentElement;
  if (pending.has(pre)) return;
  pending.add(pre);
  const source = code.textContent;
  const key = `${theme}\n${source}`;
  // A cached diagram is swapped in synchronously — the observer runs before the
  // next paint — so a preview re-rendered on every keystroke doesn't flicker
  // through its code blocks each time.
  const hit = cache.get(key);
  if (hit) { pre.replaceWith(diagramElement(hit, source)); return; }
  const forTheme = theme;
  renderSvg(source, forTheme).then((rendered) => {
    remember(key, rendered);
    if (contentObserver && pre.isConnected && forTheme === theme) pre.replaceWith(diagramElement(rendered, source));
  }, (err) => {
    if (!pre.isConnected) return;
    pre.classList.add('mmd-error');
    pre.title = `Mermaid: ${err?.message || err}`;
  });
}

function scan() {
  for (const id of ROOT_IDS) {
    for (const code of document.getElementById(id)?.querySelectorAll(BLOCK) || []) upgrade(code);
  }
}

function revertAll() {
  for (const fig of document.querySelectorAll('.mmd-diagram')) {
    if (sources.has(fig)) fig.replaceWith(codeBlock(sources.get(fig)));
  }
  for (const pre of document.querySelectorAll('pre.mmd-error')) {
    pre.classList.remove('mmd-error');
    pre.removeAttribute('title');
  }
  pending = new WeakSet();
}

function stop() {
  contentObserver?.disconnect();
  themeObserver?.disconnect();
  contentObserver = themeObserver = null;
  revertAll();
}

function onContent() {
  if (!stillEnabled()) { stop(); return; }
  scan();
}

function onTheme() {
  if (!stillEnabled()) { stop(); return; }
  const next = currentTheme();
  if (next === theme) return;
  theme = next;
  revertAll();
  scan();
}

function start() {
  if (contentObserver) return;
  theme = currentTheme();
  contentObserver = new MutationObserver(onContent);
  for (const id of ROOT_IDS) {
    const root = document.getElementById(id);
    if (root) contentObserver.observe(root, { childList: true, subtree: true });
  }
  themeObserver = new MutationObserver(onTheme);
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  scan();
}

export default {
  register() { start(); },
};

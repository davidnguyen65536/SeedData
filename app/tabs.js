// Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
// Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

// Glass tabs for the dashboard, and the small links between the tabs.
// The selected tab sits under a lens of liquid glass that squeezes, slides, lands and wobbles when you switch.
// app.js fills the panels as before; this file only shows one panel at a time and adds cross-links.

const list = document.querySelector('.glass-tabs');
const tabs = [...list.querySelectorAll('[role="tab"]')];
const lens = list.querySelector('.lens');
const body = lens.querySelector('.lens-body');
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const names = tabs.map((t) => t.dataset.tab);
let current = null;

function place(tab) {
  return { x: tab.offsetLeft, w: tab.offsetWidth };
}

// Refraction: a displacement map for a pill of the lens's size. Near the rim the glass bends what's
// beneath it strongly; across the middle it magnifies a touch. Red/green hold the x/y shift.
const feMap = document.getElementById('lens-map');
const canBend = !!window.chrome && CSS.supports('backdrop-filter', 'url(#lens-refract)');
let mapKey = '';
function refract(w, h) {
  if (!canBend || !feMap || !w || !h) return;
  const key = `${Math.round(w)}x${Math.round(h)}`;
  if (key === mapKey) return;
  mapKey = key;
  const W = Math.round(w), H = Math.round(h), cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H), r = H / 2, cx = W / 2, cy = H / 2, rim = Math.min(12, r * .7);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ox = Math.max(Math.abs(x + .5 - cx) - (cx - r), 0) * Math.sign(x + .5 - cx), oy = y + .5 - cy;
    const dist = Math.hypot(ox, oy), inside = r - dist;
    let dx = 0, dy = 0;
    if (inside > 0) {
      const k = inside < rim ? (1 - inside / rim) ** 2 : 0, nx = dist ? ox / dist : 0, ny = dist ? oy / dist : 0;
      dx = nx * k * .9 - (x + .5 - cx) / cx * .1; // bend outward at the rim, gently magnify inside
      dy = ny * k * .9 - oy / cy * .1;
    }
    const i = (y * W + x) * 4;
    img.data[i] = 128 + Math.max(-1, Math.min(1, dx)) * 127; img.data[i + 1] = 128 + Math.max(-1, Math.min(1, dy)) * 127;
    img.data[i + 2] = 128; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  feMap.setAttribute('href', cv.toDataURL()); feMap.setAttribute('width', W); feMap.setAttribute('height', H);
  body.style.backdropFilter = body.style.webkitBackdropFilter = 'url(#lens-refract) saturate(1.25) brightness(1.04)';
}

// Numbers on a freshly opened tab count up from zero (facts on Paddock).
function countUp(panel) {
  if (calm.matches) return;
  panel.querySelectorAll('.fact .v').forEach((v) => {
    const node = v.firstChild; if (!node || node.nodeType !== 3) return;
    const text = node.textContent, m = text.match(/-?\d+(\.\d+)?/); if (!m) return;
    const to = parseFloat(m[0]), dp = (m[1] || '').length - 1 > 0 ? m[1].length - 1 : 0, t0 = performance.now();
    const tick = (now) => { const k = Math.min(1, (now - t0) / 700), e = 1 - (1 - k) ** 3; node.textContent = text.replace(m[0], (to * e).toFixed(dp)); if (k < 1) requestAnimationFrame(tick); else node.textContent = text; };
    requestAnimationFrame(tick);
  });
}

function select(name, { focus = false, animate = true } = {}) {
  if (!names.includes(name)) name = 'options';
  const tab = tabs[names.indexOf(name)];
  const from = current ? place(tabs[names.indexOf(current)]) : null, to = place(tab);
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    panel.classList.toggle('active', on);
    if (on && t.dataset.tab !== current) { panel.classList.remove('play'); void panel.offsetWidth; panel.classList.add('play'); if (current) countUp(panel); }
    panel.toggleAttribute('inert', !on);
    if (on && animate && current && !calm.matches) panel.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2, .7, .2, 1)' });
  }
  lens.style.transform = `translateX(${to.x}px)`; lens.style.width = `${to.w}px`;
  refract(to.w, tab.offsetHeight);
  if (from && animate && !calm.matches && from.x !== to.x) {
    // slide with a little overshoot, squeezing in flight and wobbling as it lands
    const dir = Math.sign(to.x - from.x);
    lens.animate([
      { transform: `translateX(${from.x}px)`, width: `${from.w}px` },
      { transform: `translateX(${to.x + dir * 6}px)`, width: `${to.w}px`, offset: .7 },
      { transform: `translateX(${to.x}px)`, width: `${to.w}px` },
    ], { duration: 520, easing: 'cubic-bezier(.3, .7, .25, 1)' });
    body.animate([
      { transform: 'scale(1, 1)' },
      { transform: 'scale(1.12, .84)', offset: .35 },
      { transform: 'scale(.95, 1.06)', offset: .7 },
      { transform: 'scale(1.02, .98)', offset: .85 },
      { transform: 'scale(1, 1)' },
    ], { duration: 620, easing: 'ease-out' });
  }
  current = name;
  if (focus) tab.focus();
  const url = new URL(location.href);
  if (name === 'options') url.searchParams.delete('tab'); else url.searchParams.set('tab', name);
  history.replaceState(null, '', url);
}

tabs.forEach((t) => t.addEventListener('click', () => select(t.dataset.tab)));
list.addEventListener('keydown', (e) => {
  const i = names.indexOf(current);
  const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: names.length - 1 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  select(names[(next + names.length) % names.length], { focus: true });
});
// any link marked data-tab-link opens that tab instead of reloading
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-tab-link]');
  if (!a) return;
  e.preventDefault();
  select(a.dataset.tabLink);
  document.querySelector('.sheet').scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'start' });
});
addEventListener('resize', () => { const t = tabs[names.indexOf(current)]; const p = place(t); lens.style.transform = `translateX(${p.x}px)`; lens.style.width = `${p.w}px`; refract(p.w, t.offsetHeight); });

select(new URL(location.href).searchParams.get('tab') || 'options', { animate: false });
document.fonts?.ready.then(() => select(current, { animate: false }));

// ---- links between tabs ----

// The chosen paddock follows you across tabs.
const nameEl = document.getElementById('paddock-name');
const syncPaddock = () => {
  const n = nameEl.textContent.trim();
  if (!n || n.startsWith('Pick')) return;
  document.getElementById('data-paddock').textContent = n;
};
new MutationObserver(syncPaddock).observe(nameEl, { childList: true, characterData: true, subtree: true });

// Data tab: every fact tile, as one table with its source.
const facts = document.getElementById('paddock-facts');
const tbody = document.querySelector('#fact-table tbody');
const syncFacts = () => {
  const rows = [...facts.querySelectorAll('.fact')].map((f) => {
    const tr = document.createElement('tr');
    for (const [sel, tag] of [['.k', 'th'], ['.v', 'td'], ['.s', 'td']]) {
      const cell = document.createElement(tag); cell.textContent = f.querySelector(sel)?.textContent.trim() || '';
      if (tag === 'th') cell.scope = 'row';
      tr.append(cell);
    }
    return tr;
  });
  tbody.replaceChildren(...rows);
};
new MutationObserver(syncFacts).observe(facts, { childList: true });

// Options: risks that rest on the paddock's climate link to that evidence.
const cards = document.getElementById('cards');
const EVIDENCE = /frost|°C|\bheat|rain|\d mm|dry|season/i;
const linkRisks = () => {
  for (const li of cards.querySelectorAll('.checks li:not([data-linked])')) {
    li.dataset.linked = '';
    if (!EVIDENCE.test(li.textContent)) continue;
    const a = document.createElement('a');
    a.href = '?tab=paddock'; a.dataset.tabLink = 'paddock'; a.className = 'evidence'; a.textContent = 'See the data';
    li.append(' ', a);
  }
};
new MutationObserver(linkRisks).observe(cards, { childList: true });
syncPaddock(); syncFacts(); linkRisks();

// Narrow screens show the options above the settings, so after a change offer a quick way back up to them.
const narrow = matchMedia('(max-width: 900px)');
const pill = document.getElementById('reranked');
let pillTimer = 0;
document.querySelector('.settings').addEventListener('change', () => {
  if (!narrow.matches) return;
  const top = cards.getBoundingClientRect().top;
  if (top > -40 && top < innerHeight * .5) return; // already in view
  pill.classList.add('show'); clearTimeout(pillTimer);
  pillTimer = setTimeout(() => pill.classList.remove('show'), 4000);
});
pill.addEventListener('click', () => {
  pill.classList.remove('show');
  cards.scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'start' });
});

// Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
// Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

import { PRIORITIES, evaluate, gapsFor } from './scoring.js';
import { factsFor, templateExplanation, verifyAndFill } from './explain.js';

const state = {
  data: null,
  crops: null,
  paddock: null,
  weights: { water: 3, soil: 3, risk: 3, income: 3 },
  hasLivestock: false,
  currentRotation: null,
  results: [],
  layers: {},
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const has = (v) => v !== null && v !== undefined && !Number.isNaN(v);
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
// Each paddock gets its own colour, so a switch is easy to see.
const PADDOCK_COLORS = ['#c9962b', '#2b8a99', '#b5523b', '#6a58b8', '#4f8a3a', '#c2577e'];
const colorOf = (p) => PADDOCK_COLORS[state.data.paddocks.indexOf(p) % PADDOCK_COLORS.length];

async function init() {
  const [data, crops] = await Promise.all([
    fetch('data/paddocks.json').then((r) => r.json()),
    fetch('data/crops.json').then((r) => r.json()),
  ]);
  state.data = data;
  state.crops = crops;
  $('data-stamp').textContent = `Data built ${data.generated}.`;
  buildSliders();
  $('livestock').addEventListener('change', (e) => { state.hasLivestock = e.target.checked; render(); });
  buildMap();
  const fromHash = data.paddocks.find((p) => `#${p.id}` === location.hash);
  selectPaddock(fromHash || data.paddocks[0]);
}

// Importance as four plain choices instead of a 0–5 slider. The values keep the scoring's 0–5 weights.
const LEVELS = [{ v: 0, label: 'Off' }, { v: 1, label: 'Low' }, { v: 3, label: 'Medium' }, { v: 5, label: 'High' }];
const HINTS = {
  water: 'Favours crops that use less soil water',
  soil: 'Favours legumes, pasture and ground cover',
  risk: 'Less exposure to frost, heat, erosion and disease',
  income: 'Favours selling into more markets',
};
const BALANCED = { water: 3, soil: 3, risk: 3, income: 3 };

function buildSliders() {
  $('sliders').innerHTML = PRIORITIES.map((p) => `
    <fieldset class="prio">
      <legend>${p.label}</legend>
      <p class="hint-line">${HINTS[p.id] || ''}</p>
      <div class="seg">${LEVELS.map((l) => `
        <label><input type="radio" name="w-${p.id}" value="${l.v}" data-id="${p.id}" ${state.weights[p.id] === l.v ? 'checked' : ''}><span>${l.label}</span></label>`).join('')}
      </div>
    </fieldset>`).join('') + '<button type="button" class="reset" id="reset-weights">Reset to balanced</button>';
  $('sliders').querySelectorAll('input').forEach((el) => el.addEventListener('change', (e) => {
    state.weights[e.target.dataset.id] = Number(e.target.value);
    render();
  }));
  $('reset-weights').addEventListener('click', () => { state.weights = { ...BALANCED }; buildSliders(); render(); });
}

function buildMap() {
  const map = L.map('map', { scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  map.fitBounds(state.data.paddocks.map((p) => p.center), { padding: [40, 40] });
  for (const p of state.data.paddocks) {
    const layer = L.geoJSON(p.geometry, { style: { color: colorOf(p), weight: 3, fillOpacity: 0.25 } })
      .bindTooltip(p.name)
      .on('click', () => selectPaddock(p))
      .addTo(map);
    const marker = L.circleMarker(p.center, { radius: 7, color: '#fff', weight: 2, fillColor: colorOf(p), fillOpacity: 0.95 })
      .bindTooltip(p.name)
      .on('click', () => selectPaddock(p))
      .addTo(map);
    state.layers[p.id] = { layer, marker };
  }
  state.map = map;
}

function selectPaddock(p) {
  const was = state.paddock && state.results.length
    ? { paddock: state.paddock, scores: Object.fromEntries(state.results.map((r) => [r.id, r.overall])), best: state.results.reduce((a, b) => (b.overall > a.overall ? b : a)).id }
    : null;
  state.paddock = p;
  document.documentElement.style.setProperty('--paddock', colorOf(p));
  state.currentRotation = [...p.current_rotation];
  history.replaceState(null, '', `#${p.id}`);
  for (const [id, { layer, marker }] of Object.entries(state.layers)) {
    const on = id === p.id;
    layer.setStyle({ weight: on ? 4 : 2, fillOpacity: on ? 0.45 : 0.2 });
    marker.setStyle({ radius: on ? 11 : 7, weight: on ? 3 : 2 });
    if (on) marker.bringToFront();
  }
  buildRotationSelect();
  buildPaddockPicker();
  renderPaddock();
  render();
  if (was) showPaddockChange(was);
}

// After a switch, say plainly what the new paddock changed in the options (or that it changed nothing).
function showPaddockChange(was) {
  const from = was.paddock.name.replace(/^Paddock near /, ''), to = state.paddock.name.replace(/^Paddock near /, '');
  const fmt = (n) => n.toFixed(1);
  const rows = state.results.map((r) => ({ r, before: was.scores[r.id], d: r.overall - (was.scores[r.id] ?? r.overall) }));
  const moved = rows.filter((x) => Math.abs(x.d) >= 0.05);
  const best = state.results.reduce((a, b) => (b.overall > a.overall ? b : a));
  let html;
  if (!moved.length) {
    html = `<b>Switched from ${esc(from)} to ${esc(to)}.</b> The scores didn't change: the figures that drive them are the same for both paddocks.`;
  } else {
    html = `<b>Switched from ${esc(from)} to ${esc(to)}.</b> ${best.id !== was.best ? `The best match is now <b>${esc(best.label)}</b>. ` : ''}
      <span class="chg-list">${moved.map((x) => `<span class="chg ${x.d > 0 ? 'up' : 'down'}">${esc(x.r.label)} ${fmt(x.before)} → ${fmt(x.r.overall)} <i>${x.d > 0 ? '▲' : '▼'}${fmt(Math.abs(x.d))}</i></span>`).join('')}</span>`;
    for (const x of moved) {
      const card = document.querySelector(`#cards .card[data-id="${x.r.id}"]`);
      if (card) { card.classList.remove('changed'); void card.offsetWidth; card.classList.add('changed'); }
    }
  }
  document.querySelectorAll('.paddock-change').forEach((el) => {
    el.innerHTML = `<span class="pc-dot" aria-hidden="true"></span><p>${html}</p><button type="button" class="pc-close" aria-label="Dismiss">×</button>`;
    el.hidden = false;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    el.querySelector('.pc-close').addEventListener('click', () => { document.querySelectorAll('.paddock-change').forEach((x) => { x.hidden = true; }); });
  });
}
// Switching paddocks: a menu under the title (every tab) and a list beside the map (Paddock tab).
function buildPaddockPicker() {
  const f = (p) => p.features || {};
  const short = (p) => p.name.replace(/^Paddock near /, '');
  const item = (p) => `<button type="button" class="pk ${p.id === state.paddock.id ? 'on' : ''}" data-paddock="${p.id}" aria-pressed="${p.id === state.paddock.id}" style="--pk:${colorOf(p)}">
      <span class="pk-name">${esc(short(p))}</span>
      <span class="pk-meta">${esc(p.region)}${has(f(p).gs_rain_mm) ? ` · ${f(p).gs_rain_mm} mm growing-season rain` : ''}</span>
    </button>`;
  $('paddock-switch').innerHTML = `
    <button type="button" class="pk-open" id="pk-open" aria-haspopup="true" aria-expanded="false" aria-controls="pk-menu">
      <span class="dot" aria-hidden="true"></span><span class="pk-label">Paddock</span><b>${esc(short(state.paddock))}</b><span class="chev" aria-hidden="true">▾</span>
    </button>
    <div class="pk-menu" id="pk-menu" aria-label="Choose a paddock" hidden>
      ${state.data.paddocks.map(item).join('')}
      <a class="pk-map" href="?tab=paddock" data-tab-link="paddock">See them on the map</a>
    </div>`;
  $('paddock-list').innerHTML = state.data.paddocks.map(item).join('');
  const open = $('pk-open'), menu = $('pk-menu');
  const close = () => { menu.hidden = true; open.setAttribute('aria-expanded', 'false'); };
  open.addEventListener('click', () => {
    const show = menu.hidden;
    menu.hidden = !show; open.setAttribute('aria-expanded', String(show));
    if (show) menu.querySelector('.pk.on, .pk')?.focus();
  });
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); open.focus(); } });
  menu.addEventListener('click', (e) => { if (e.target.closest('.pk-map')) close(); });
  document.querySelectorAll('[data-paddock]').forEach((b) => b.addEventListener('click', () => {
    const p = state.data.paddocks.find((x) => x.id === b.dataset.paddock);
    close();
    if (p && p.id !== state.paddock.id) selectPaddock(p);
  }));
}
document.addEventListener('click', (e) => {
  if (e.target.closest('#paddock-switch')) return;
  const menu = document.getElementById('pk-menu');
  if (menu && !menu.hidden) { menu.hidden = true; document.getElementById('pk-open').setAttribute('aria-expanded', 'false'); }
});

function buildRotationSelect() {
  const options = Object.entries(state.crops.crops).map(([id, c]) => `<option value="${id}">${esc(c.label)}</option>`).join('');
  $('current-rotation').innerHTML = state.currentRotation.map((c, i) =>
    `<select data-i="${i}" aria-label="Current rotation year ${i + 1}">${options}</select>`).join('');
  $('current-rotation').querySelectorAll('select').forEach((el) => {
    el.value = state.currentRotation[Number(el.dataset.i)];
    el.addEventListener('change', (e) => { state.currentRotation[Number(e.target.dataset.i)] = e.target.value; render(); });
  });
}

function factTile(value, unit, label, source) {
  if (!has(value)) return '';
  return `<div class="fact"><div class="v">${esc(value)}<small> ${esc(unit)}</small></div><div class="k">${esc(label)}</div><div class="s">${esc(source)}</div></div>`;
}

function renderPaddock() {
  const p = state.paddock;
  const f = p.features || {};
  $('paddock-name').textContent = p.name;
  $('paddock-sub').textContent = `${p.region} · data: ${p.sources.join(', ') || 'none loaded yet'}`;
  const power = f.years ? `NASA POWER ${f.years}` : 'NASA POWER';
  const modis = f.ndvi_years ? `MODIS ${f.ndvi_years}` : 'MODIS';
  $('paddock-facts').innerHTML = [
    factTile(f.gs_rain_mm, 'mm', 'Growing-season rain (Apr–Oct), average', power),
    factTile(f.gs_rain_min_mm, 'mm', 'Driest growing season', power),
    factTile(f.gs_rain_cv_pct, '%', 'Year-to-year rain variation', power),
    factTile(f.frost_days_aug_oct, 'days', 'Frost days, Aug–Oct (flowering)', power),
    factTile(f.heat_days_oct_nov, 'days', 'Hot days (32 °C+), Oct–Nov (grain fill)', power),
    factTile(f.heavy_rain_days, 'days/yr', 'Heavy-rain days (25 mm+)', power),
    factTile(f.sowing_soil_wetness, 'of 1', 'Topsoil wetness at sowing, Apr–May (1 = soaked)', power),
    factTile(f.bare_months_per_year, 'months/yr', 'Months with bare ground (greenness under 0.25)', modis),
    factTile(f.slope_pct, '%', 'Slope', 'SRTM'),
    factTile(f.smap_sowing_sm, 'm³/m³', 'Soil moisture at sowing', 'SMAP L4'),
    factTile(f.soil_organic_carbon_pct, '%', 'Soil organic carbon', 'Soil and Landscape Grid'),
  ].join('') || '<p class="muted">No data loaded for this paddock yet. Run the pipelines (see README).</p>';
  $('chart-rain').innerHTML = barChart(p.monthly?.rain_mm || []);
  $('chart-ndvi').innerHTML = lineChart(p.ndvi_profile || [], 0.25);
}

function render() {
  if (!state.paddock) return;
  const results = evaluate(state.paddock, state.crops, state.weights, {
    hasLivestock: state.hasLivestock,
    currentRotation: state.currentRotation,
  });
  state.results = results;
  // Best first; what you grow now is the baseline every option is compared with.
  const best = Math.max(...results.map((r) => r.overall));
  const now = results.find((r) => r.id === 'current');
  const crop = (id) => state.crops.crops[id]?.label || id;
  const ranked = [...results].sort((a, b) => b.overall - a.overall);
  const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const weightClass = (id) => (state.weights[id] === 0 ? 'off' : state.weights[id] >= 5 ? 'high' : '');
  const before = new Map([...$('cards').children].map((el) => [el.dataset.id, el.getBoundingClientRect()]));
  const prev = state.shown || {};
  $('cards').innerHTML = ranked.map((r) => {
    const isBest = r.overall === best, isNow = r.id === 'current';
    const delta = now && !isNow ? r.overall - now.overall : null;
    const tags = [isBest ? '<span class="pill-tag best">Best match</span>' : '', isNow ? '<span class="pill-tag now">What you grow now</span>' : ''].join('');
    const checks = r.risks.length
      ? `<details class="checks"><summary>${r.risks.length} ${r.risks.length === 1 ? 'thing' : 'things'} to check locally</summary><ul>${r.risks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`
      : '<p class="checks none">No major flags from the data.</p>';
    return `
    <article class="card ${isBest ? 'best' : ''} ${isNow ? 'now' : ''}" data-id="${r.id}">
      <div class="tags">${tags || '&nbsp;'}</div>
      <header class="card-head">
        <h3>${esc(r.label)}</h3>
        <div class="score"><span class="num" data-to="${r.overall}">${fmt(r.overall)}</span><span class="of">/ 5</span></div>
      </header>
      ${delta === null ? '<p class="delta base">Baseline</p>' : `<p class="delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${fmt(Math.abs(delta))} vs what you grow now</p>`}
      <ol class="seq" aria-label="Rotation, year by year">${r.rotation.map((c, i) => `<li><span class="yr">Y${i + 1}</span>${esc(crop(c))}</li>`).join('')}</ol>
      <p class="why">${esc(r.why)}</p>
      <dl class="bars">${PRIORITIES.map((p) => `
        <div class="bar ${weightClass(p.id)}"><dt>${p.label}</dt><dd><span class="track"><span class="fill" data-p="${p.id}" style="width:${(r.scores[p.id] / 5) * 100}%"></span></span><b>${fmt(r.scores[p.id])}</b></dd></div>`).join('')}
      </dl>
      ${checks}
      <button type="button" class="why-btn" data-id="${r.id}">Why this score?</button>
    </article>`;
  }).join('');
  $('cards').querySelectorAll('.why-btn').forEach((b) => b.addEventListener('click', () => explain(b.dataset.id)));
  liven(before, prev);
  state.shown = Object.fromEntries(results.map((r) => [r.id, { overall: r.overall, scores: { ...r.scores } }]));
  $('gaps').innerHTML = gapsFor(state.paddock.features || {}).map((g) => `<li>${esc(g)}</li>`).join('');
}

// Delight, kept quick: cards glide to their new rank, bars grow from their old length and scores count to the new value.
const calmMotion = matchMedia('(prefers-reduced-motion: reduce)');
function liven(before, prev) {
  if (calmMotion.matches) return;
  const spring = 'cubic-bezier(.3, 1.25, .5, 1)';
  for (const card of $('cards').children) {
    const id = card.dataset.id, was = before.get(id), old = prev[id];
    if (was) {
      const now = card.getBoundingClientRect(), dx = was.left - now.left, dy = was.top - now.top;
      if (dx || dy) card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 520, easing: spring });
    }
    card.querySelectorAll('.fill').forEach((el, i) => {
      const to = parseFloat(el.style.width), from = old ? (old.scores[el.dataset.p] / 5) * 100 : 0;
      if (from !== to) el.animate([{ width: `${from}%` }, { width: `${to}%` }], { duration: old ? 450 : 700, delay: old ? 0 : 120 + i * 60, easing: spring, fill: 'backwards' });
    });
    const num = card.querySelector('.num'), to = Number(num.dataset.to), from = old ? old.overall : 0;
    if (from !== to) {
      const t0 = performance.now(), dur = old ? 450 : 800;
      const tick = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3; num.textContent = (from + (to - from) * e).toFixed(1); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
  }
}

async function explain(id) {
  const result = state.results.find((r) => r.id === id);
  const facts = factsFor(result, state.paddock);
  let text = null;
  let meta = 'Written from the facts below by fixed rules.';
  try {
    const resp = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: result.label, paddock: state.paddock.name, facts }),
    });
    if (resp.ok) {
      const body = await resp.json();
      const checked = verifyAndFill(body.template || '', facts);
      if (checked.ok) {
        text = checked.text;
        meta = `Worded by ${body.model}; every number checked against the facts below.`;
      }
    }
  } catch (_) { /* no AI endpoint (e.g. static hosting): use the rule-based text */ }
  if (!text) text = verifyAndFill(templateExplanation(result, state.paddock, facts), facts).text;
  $('explain-title').textContent = `${result.label} on ${state.paddock.name}`;
  $('explain-text').textContent = text;
  $('explain-facts').innerHTML = facts.map((x) => `<tr><td>${x.id}</td><td>${esc(x.label)}</td><td><b>${esc(x.value)}</b> ${esc(x.unit || '')}</td><td>${esc(x.source)}</td></tr>`).join('');
  $('explain-meta').textContent = meta;
  $('explain-dialog').showModal();
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Monthly rain: bars rise one after another; hover, tap or Tab to a month to read its value.
function barChart(values) {
  if (!values.length) return '<p class="muted">No data</p>';
  const w = 300, h = 130, pad = 18, top = 16, max = Math.max(...values.filter(has), 1);
  const bw = (w - pad) / 12;
  const ok = values.map((v, i) => [v, i]).filter(([v]) => has(v));
  const hi = ok.reduce((a, b) => (b[0] > a[0] ? b : a)), lo = ok.reduce((a, b) => (b[0] < a[0] ? b : a));
  const desc = `Average rain by month. Wettest: ${MONTH_NAMES[hi[1]]}, ${hi[0]} mm. Driest: ${MONTH_NAMES[lo[1]]}, ${lo[0]} mm.`;
  return `<svg class="chart bars-chart" viewBox="0 0 ${w} ${h}" role="group" aria-label="${desc}">
    ${values.map((v, i) => {
      const bh = has(v) ? ((h - pad - top) * v) / max : 0, x = pad + i * bw + 2, y = h - pad - bh;
      return `<g class="mo" tabindex="0" role="img" aria-label="${MONTH_NAMES[i]}: ${v} mm" style="--i:${i}">
        <rect class="hit" x="${pad + i * bw}" y="0" width="${bw}" height="${h - pad}" fill="transparent"/>
        <rect class="rb" x="${x}" y="${y}" width="${bw - 4}" height="${bh}" rx="2"/>
        <text class="val" x="${x + (bw - 4) / 2}" y="${y - 4}" text-anchor="middle">${v}</text>
        <text x="${pad + i * bw + bw / 2}" y="${h - 4}" text-anchor="middle">${MONTHS[i]}</text></g>`;
    }).join('')}
    <text x="2" y="${top + 2}">${Math.round(max)}</text></svg>`;
}

// Greenness: the line draws itself, then the points pop in; hover, tap or Tab to a month to read it.
function lineChart(values, threshold) {
  if (!values.length) return '<p class="muted">No data</p>';
  const w = 300, h = 130, pad = 18, top = 14;
  const x = (i) => pad + (i * (w - 2 * pad)) / 11;
  const y = (v) => h - pad - (v / 0.9) * (h - pad - top);
  const pts = values.map((v, i) => (has(v) ? `${x(i)},${y(v)}` : null)).filter(Boolean).join(' ');
  const ok = values.map((v, i) => [v, i]).filter(([v]) => has(v));
  const hi = ok.reduce((a, b) => (b[0] > a[0] ? b : a)), lo = ok.reduce((a, b) => (b[0] < a[0] ? b : a));
  const bare = ok.filter(([v]) => v < threshold).length;
  const desc = `Average greenness by month. Greenest: ${MONTH_NAMES[hi[1]]}, ${hi[0]}. Least green: ${MONTH_NAMES[lo[1]]}, ${lo[0]}. ${bare ? `${bare} month(s) below the bare line of ${threshold}.` : `Never below the bare line of ${threshold}.`}`;
  return `<svg class="chart line-chart" viewBox="0 0 ${w} ${h}" role="group" aria-label="${desc}">
    <line x1="${pad}" x2="${w - pad}" y1="${y(threshold)}" y2="${y(threshold)}" stroke="#a3402a" stroke-dasharray="4 3"/>
    <text x="${w - pad}" y="${y(threshold) - 3}" text-anchor="end">bare</text>
    <polygon class="area" points="${x(0)},${h - pad} ${pts} ${x(11)},${h - pad}"/>
    <polyline class="ln" points="${pts}" pathLength="1" fill="none" stroke="#2f6b3a" stroke-width="2.5" stroke-linejoin="round"/>
    ${values.map((v, i) => (has(v) ? `<g class="mo" tabindex="0" role="img" aria-label="${MONTH_NAMES[i]}: ${v}" style="--i:${i}">
      <rect class="hit" x="${x(i) - 11}" y="0" width="22" height="${h - pad}" fill="transparent"/>
      <line class="guide" x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${h - pad}"/>
      <circle class="pt" cx="${x(i)}" cy="${y(v)}" r="3.2"/>
      <text class="val" x="${x(i)}" y="${y(v) - 8}" text-anchor="middle">${v}</text></g>` : '')).join('')}
    ${MONTHS.map((m, i) => `<text x="${x(i)}" y="${h - 4}" text-anchor="middle">${m}</text>`).join('')}</svg>`;
}

init().catch((err) => {
  document.querySelector('main').innerHTML = `<div class="panel"><h2>Could not load data</h2><p>${esc(err.message)}</p><p class="muted">If you opened index.html directly, start a local server instead: <code>python -m http.server -d app 8000</code></p></div>`;
});

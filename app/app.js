// Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
// Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

import { PRIORITIES, evaluate, gapsFor } from './scoring.js';
import { factsFor, templateExplanation, verifyAndFill } from './explain.js';
import { CHAPTERS, COMPARE_CHAPTERS, storyFacts, templateStory, yearBars, compareFacts, templateCompare, factsForQuestion, templateAnswer, voiceScript } from './story.js';
import { GLOSSARY, define } from './glossary.js';
import { liveLocation } from './live.js';

const state = {
  data: null,
  crops: null,
  paddock: null,
  weights: { water: 3, soil: 3, risk: 3, income: 3 },
  hasLivestock: false,
  currentRotation: null,
  results: [],
  layers: {},
  aiStory: null,
  aiCompare: null,
  compareId: null,
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const has = (v) => v !== null && v !== undefined && !Number.isNaN(v);
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
// Each paddock gets its own colour, so a switch is easy to see.
const PADDOCK_COLORS = ['#c9962b', '#2b8a99', '#b5523b', '#6a58b8', '#4f8a3a', '#c2577e'];
const colorOf = (p) => (p.live ? '#1d2a1f' : PADDOCK_COLORS[state.data.paddocks.indexOf(p) % PADDOCK_COLORS.length]);
// A farming or satellite word with its plain meaning on hover, focus or tap (see glossary.js).
const term = (text, key) => (define(key) ? `<span class="term" tabindex="0" data-def="${esc(define(key))}">${esc(text)}</span>` : esc(text));

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
  buildGlossary();
  setupStory();
  setupCompare();
  setupAsk();
  setupVoice();
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
const HINT_HTML = {
  soil: `Favours ${term('legumes', 'legume')}, ${term('pasture', 'pasture')} and ground cover`,
  risk: `Less exposure to ${term('frost', 'frost')}, heat, ${term('erosion', 'erosion')} and ${term('disease', 'crownrot')}`,
};

function buildSliders() {
  $('sliders').innerHTML = PRIORITIES.map((p) => `
    <fieldset class="prio">
      <legend>${p.label}</legend>
      <p class="hint-line">${HINT_HTML[p.id] || HINTS[p.id] || ''}</p>
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
  // Leaflet's default credit adds a flag icon; keep a plain "Leaflet" credit and the required OpenStreetMap credit.
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>');
  map.fitBounds(state.data.paddocks.map((p) => p.center), { padding: [30, 30] });
  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    const pop = L.popup({ className: 'live-pop' }).setLatLng(e.latlng)
      .setContent(`<p><b>Analyse this spot?</b><br>Ten years of NASA POWER data, fetched live.</p><button type="button" class="live-go">Analyse with NASA data</button>`)
      .openOn(map);
    pop.getElement()?.querySelector('.live-go')?.addEventListener('click', () => { map.closePopup(); analyseSpot(lat, lng); });
  });
  for (const p of state.data.paddocks) addPaddockLayer(map, p);
  state.map = map;
}

function addPaddockLayer(map, p) {
  {
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
}

// Any spot on Earth: fetch NASA POWER live and treat it as one more paddock.
async function analyseSpot(lat, lng) {
  const status = $('live-status');
  status.hidden = false;
  status.textContent = 'Fetching ten years of NASA POWER data for this spot…';
  try {
    const p = await liveLocation(lat, lng);
    const old = state.data.paddocks.findIndex((x) => x.id === 'custom');
    if (old >= 0) {
      state.data.paddocks.splice(old, 1);
      const l = state.layers.custom; if (l) { state.map.removeLayer(l.layer); state.map.removeLayer(l.marker); }
    }
    state.data.paddocks.push(p);
    addPaddockLayer(state.map, p);
    status.textContent = `Done: ${p.region}. Greenness and soil aren't loaded for custom spots, so those show as gaps.`;
    selectPaddock(p);
  } catch (err) {
    status.textContent = `Couldn't reach NASA POWER (${err.message}). Try again in a moment.`;
  }
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

function factTile(value, unit, label, source, key) {
  if (!has(value)) return '';
  return `<div class="fact"><div class="v">${esc(value)}<small> ${esc(unit)}</small></div><div class="k">${key ? term(label, key) : esc(label)}</div><div class="s">${esc(source)}</div></div>`;
}

function renderPaddock() {
  const p = state.paddock;
  const f = p.features || {};
  $('paddock-name').textContent = p.name;
  $('paddock-sub').textContent = `${p.region} · data: ${p.sources.join(', ') || 'none loaded yet'}`;
  const power = f.years ? `NASA POWER ${f.years}` : 'NASA POWER';
  const modis = f.ndvi_years ? `MODIS ${f.ndvi_years}` : 'MODIS';
  $('paddock-facts').innerHTML = [
    factTile(f.gs_rain_mm, 'mm', 'Growing-season rain (Apr–Oct), average', power, 'gs'),
    factTile(f.gs_rain_min_mm, 'mm', 'Driest growing season', power),
    factTile(f.gs_rain_cv_pct, '%', 'Year-to-year rain variation', power, 'cv'),
    factTile(f.frost_days_aug_oct, 'days', 'Frost days, Aug–Oct (flowering)', power, 'frost'),
    factTile(f.heat_days_oct_nov, 'days', 'Hot days (32 °C+), Oct–Nov (grain fill)', power, 'grainfill'),
    factTile(f.heavy_rain_days, 'days/yr', 'Heavy-rain days (25 mm+)', power, 'heavy'),
    factTile(f.sowing_soil_wetness, 'of 1', 'Topsoil wetness at sowing, Apr–May (1 = soaked)', power, 'wetness'),
    factTile(f.bare_months_per_year, 'months/yr', 'Months with bare ground (greenness under 0.25)', modis, 'ndvi'),
    factTile(f.slope_pct, '%', 'Slope', 'SRTM', 'srtm'),
    factTile(f.smap_sowing_sm, 'm³/m³', 'Soil moisture at sowing', 'SMAP L4', 'smap'),
    factTile(f.soil_organic_carbon_pct, '%', 'Soil organic carbon', 'Soil and Landscape Grid', 'oc'),
  ].join('') || '<p class="muted">No data loaded for this paddock yet. Run the pipelines (see README).</p>';
  renderSources(p);
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
  $('gaps').innerHTML = paddockGaps(state.paddock).map((g) => `<li>${esc(g)}</li>`).join('');
  renderStory();
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
      return `<g class="mo${i === hi[1] || i === lo[1] ? ' keep' : ''}" tabindex="0" role="img" aria-label="${MONTH_NAMES[i]}: ${v} mm" style="--i:${i}">
        <rect class="hit" x="${pad + i * bw}" y="0" width="${bw}" height="${h - pad}" fill="transparent"/>
        <rect class="rb" x="${x}" y="${y}" width="${bw - 4}" height="${bh}" rx="2"/>
        <text class="val" x="${x + (bw - 4) / 2}" y="${y - 4}" text-anchor="middle">${v}</text>
        <text x="${pad + i * bw + bw / 2}" y="${h - 4}" text-anchor="middle">${MONTHS[i]}</text></g>`;
    }).join('')}</svg>`;
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
    <text class="bare-label" x="${pad + 2}" y="${y(threshold) + 11}">bare</text>
    <polygon class="area" points="${x(0)},${h - pad} ${pts} ${x(11)},${h - pad}"/>
    <polyline class="ln" points="${pts}" pathLength="1" fill="none" stroke="#2f6b3a" stroke-width="2.5" stroke-linejoin="round"/>
    ${values.map((v, i) => (has(v) ? `<g class="mo${i === hi[1] || i === lo[1] ? ' keep' : ''}" tabindex="0" role="img" aria-label="${MONTH_NAMES[i]}: ${v}" style="--i:${i}">
      <rect class="hit" x="${x(i) - 11}" y="0" width="22" height="${h - pad}" fill="transparent"/>
      <line class="guide" x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${h - pad}"/>
      <circle class="pt" cx="${x(i)}" cy="${y(v)}" r="3.2"/>
      <text class="val" x="${x(i)}" y="${y(v) - 8}" text-anchor="middle">${v}</text></g>` : '')).join('')}
    ${MONTHS.map((m, i) => `<text x="${x(i)}" y="${h - 4}" text-anchor="middle">${m}</text>`).join('')}</svg>`;
}

init().catch((err) => {
  document.querySelector('main').innerHTML = `<div class="panel"><h2>Could not load data</h2><p>${esc(err.message)}</p><p class="muted">If you opened index.html directly, start a local server instead: <code>python -m http.server -d app 8000</code></p></div>`;
});

// Gaps from the scoring rules, plus notes that depend on where the paddock is.
function paddockGaps(p) {
  const out = gapsFor(p.features || {});
  if (p.center?.[0] > -31) out.unshift('Frost and heat windows (Aug–Oct, Oct–Nov) are set for southern winter cropping; crops in northern NSW and Queensland flower earlier, so check those months locally.');
  if (p.live) out.unshift('This is a spot you picked: only NASA POWER data is loaded, fetched live. Greenness, slope and soil are not.');
  return out;
}

// ---------- Words we use ----------
function buildGlossary() {
  const el = $('glossary');
  if (!el) return;
  el.innerHTML = GLOSSARY.map((g) => `<div class="gl-item" id="term-${g.key}"><dt>${esc(g.term)}</dt><dd>${esc(g.def)}</dd></div>`).join('');
}

// ---------- The paddock's story ----------
function setupStory() {
  const ai = $('story-ai'), plain = $('story-plain'), tone = $('story-tone');
  if (!ai) return;
  ai.addEventListener('click', () => writeStoryWithAI());
  plain.addEventListener('click', () => { state.aiStory = null; renderStory(); });
  tone.addEventListener('change', () => { if (state.aiStory) writeStoryWithAI(); });
}

const storyKey = () => JSON.stringify([state.paddock?.id, state.weights, state.hasLivestock, state.currentRotation, $('story-tone')?.value]);

function renderStory() {
  const box = $('story-chapters');
  if (!box || !state.paddock || !state.results.length) return;
  stopVoice();
  const p = state.paddock;
  const story = storyFacts(p, state.results);
  const plainText = templateStory(p, story);
  const ai = state.aiStory && state.aiStory.key === storyKey() ? state.aiStory : null;
  if (state.aiStory && !ai) $('story-status').textContent = 'Your settings changed, so the story is back to plain facts. Press "Write it with AI" for a new version.';
  $('story-name').textContent = p.live ? 'your chosen spot' : p.name.replace(/^Paddock near /, '');
  $('story-plain').hidden = !ai;
  $('story-ai').textContent = ai ? 'Rewrite with AI' : 'Write it with AI';
  const y = p.yearly || {};
  const markOf = (vals, pick) => { if (!vals?.length) return []; const ok = vals.filter(has); return [vals.indexOf(pick(...ok))]; };
  const crop = (id) => state.crops.crops[id]?.label || id;
  const ranked = [...state.results].sort((a, b) => b.overall - a.overall);
  const yrs = p.features?.years ? `${p.features.years}, ` : '';
  const cap = (title, note) => `<figcaption><b>${title}</b><span>${note}</span></figcaption>`;
  const figures = {
    place: `${cap('Rain by month', `Average ${yrs}mm. Wettest and driest months labelled.`)}${barChart(p.monthly?.rain_mm || [])}`,
    seasons: `${cap('Growing-season rain by year', 'April–October total, mm. Driest and wettest years labelled.')}${yearBars(y.year, y.gs_rain_mm, { unit: 'mm', mark: [...markOf(y.gs_rain_mm, Math.min), ...markOf(y.gs_rain_mm, Math.max)], label: 'Growing-season rain by year' })}`,
    frost: `${cap('Frost days at flowering by year', 'Days at 2 °C or colder, August–October. Worst year labelled.')}${yearBars(y.year, y.frost_days, { unit: 'days', mark: markOf(y.frost_days, Math.max), label: 'Frost days at flowering by year' })}`,
    cover: `${cap('Greenness by month', `Average NDVI from MODIS, ${yrs}0 to 0.9. Below the dashed line (0.25) the ground counts as bare.`)}${p.ndvi_profile?.length ? lineChart(p.ndvi_profile, 0.25) : '<p class="muted">Not loaded yet.</p>'}`,
    rotation: `${cap('Score for your goals', 'Out of 5, weighted by the goals you set on the Options tab.')}${miniRank()}`,
  };
  box.innerHTML = CHAPTERS.map((c, i) => {
    const text = ai?.paras?.[i] ?? verifyAndFill(plainText[c.id], story.facts).text;
    return `<li class="chapter" style="--i:${i}">
      <div class="ch-text"><span class="ch-num">${i + 1}</span><h3>${esc(c.title)}</h3><p>${esc(text)}</p></div>
      <figure class="ch-fig">${figures[c.id]}</figure></li>`;
  }).join('');
  const best = story.best;
  $('story-checks').innerHTML = [...best.risks, ...paddockGaps(p).slice(0, 3)].map((x) => `<li>${esc(x)}</li>`).join('');
  $('story-meta').textContent = ai
    ? `Narrated by ${ai.model}. Every number was checked against the facts on the Data tab before it was shown.`
    : 'Written from the facts by fixed rules. Every number comes from the Data tab.';
  renderCompare();
  if ($('ask-answer').dataset.for !== state.paddock.id) $('ask-answer').innerHTML = '';
}

async function writeStoryWithAI() {
  const status = $('story-status'), btn = $('story-ai');
  const p = state.paddock;
  const story = storyFacts(p, state.results);
  const key = storyKey();
  btn.disabled = true;
  status.textContent = 'Writing the story with AI…';
  try {
    const resp = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'story', tone: $('story-tone').value, paddock: p.live ? 'your chosen spot' : p.name, chapters: CHAPTERS.map((c) => c.title), facts: story.facts.map(({ key: _k, ...f }) => f) }),
    });
    if (resp.status === 501) throw new Error('the AI narrator is not switched on for this site yet (no API key)');
    if (!resp.ok) throw new Error(`the AI service answered ${resp.status}`);
    const body = await resp.json();
    const checked = verifyAndFill(body.template || '', story.facts);
    if (!checked.ok) throw new Error('the AI text failed the number check');
    const paras = checked.text.split(body.separator || '###').map((x) => x.trim()).filter(Boolean);
    if (paras.length !== CHAPTERS.length) throw new Error('the AI story came back in the wrong shape');
    state.aiStory = { key, paras, model: body.model };
    status.textContent = '';
  } catch (err) {
    state.aiStory = null;
    status.textContent = `Showing plain facts: ${err.message}.`;
  } finally {
    btn.disabled = false;
    renderStory();
  }
}


// ---------- Shared call to the AI endpoint ----------
// Returns the checked, filled text, or throws with a plain reason.
async function askModel(payload, facts) {
  const resp = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, facts: facts.map(({ key: _k, ...f }) => f) }),
  });
  if (resp.status === 501) throw Object.assign(new Error('the AI narrator is not switched on for this site yet (no API key)'), { off: true });
  if (!resp.ok) throw new Error(`the AI service answered ${resp.status}`);
  const body = await resp.json();
  const checked = verifyAndFill(body.template || '', facts);
  if (!checked.ok) throw new Error('the AI text failed the number check');
  return { text: checked.text, model: body.model, separator: body.separator || '###' };
}

// ---------- Two paddocks side by side ----------
function setupCompare() {
  const sel = $('compare-with');
  if (!sel) return;
  sel.addEventListener('change', () => { state.compareId = sel.value; state.aiCompare = null; renderCompare(); });
  $('compare-ai').addEventListener('click', () => compareWithAI());
}

function compareState() {
  const a = state.paddock;
  const others = state.data.paddocks.filter((p) => p.id !== a.id);
  if (!others.length) return null;
  // Default to the most different paddock in growing-season rain, so the contrast is clear.
  const gs = (p) => p.features?.gs_rain_mm ?? 0;
  if (!others.some((p) => p.id === state.compareId)) {
    state.compareId = others.reduce((x, y) => (Math.abs(gs(y) - gs(a)) > Math.abs(gs(x) - gs(a)) ? y : x)).id;
  }
  const b = others.find((p) => p.id === state.compareId);
  const opts = { hasLivestock: state.hasLivestock };
  const resultsB = evaluate(b, state.crops, state.weights, opts);
  const cmp = compareFacts(a, b, state.results, resultsB);
  return { a, b, others, cmp, key: JSON.stringify([a.id, b.id, state.weights, state.hasLivestock, state.currentRotation, $('story-tone').value]) };
}

function renderCompare() {
  if (!$('compare') || !state.paddock) return;
  const c = compareState();
  if (!c) return;
  const { a, b, others, cmp } = c;
  $('compare-name').textContent = cmp.nameA;
  $('compare-with').innerHTML = others.map((p) => `<option value="${p.id}" ${p.id === b.id ? 'selected' : ''}>${esc(p.live ? 'Your chosen spot' : p.name.replace(/^Paddock near /, ''))}${p.region && !p.live ? ` (${esc(p.region)})` : ''}</option>`).join('');
  const row = (label, ka, kb, unit, higherIsMore = true) => {
    const va = a.features?.[ka], vb = b.features?.[kb ?? ka];
    if (!has(va) && !has(vb)) return '';
    const more = has(va) && has(vb) && va !== vb ? ((va > vb) === higherIsMore ? 'a' : 'b') : '';
    const cell = (v, side) => `<td class="${more === side ? 'more' : ''}">${has(v) ? `${v}${unit}` : '—'}</td>`;
    return `<tr><td>${label}</td>${cell(va, 'a')}${cell(vb, 'b')}</tr>`;
  };
  const bestRow = `<tr><td>Best rotation for your goals</td><td>${esc(cmp.bestA.label)} ${cmp.bestA.overall.toFixed(1)}</td><td>${esc(cmp.bestB.label)} ${cmp.bestB.overall.toFixed(1)}</td></tr>`;
  $('compare-table').innerHTML = `<thead><tr><th></th><th>${esc(cmp.nameA)}</th><th>${esc(cmp.nameB)}</th></tr></thead><tbody>
    ${row(term('Growing-season rain', 'gs'), 'gs_rain_mm', null, ' mm')}
    ${row('Driest season', 'gs_rain_min_mm', null, ' mm')}
    ${row(term('Rain variation', 'cv'), 'gs_rain_cv_pct', null, '%')}
    ${row(term('Frost days at flowering', 'frost'), 'frost_days_aug_oct', null, '')}
    ${row(term('Hot days at grain fill', 'grainfill'), 'heat_days_oct_nov', null, '')}
    ${row(term('Months bare', 'bare'), 'bare_months_per_year', null, '')}
    ${bestRow}</tbody>`;
  const ai = state.aiCompare && state.aiCompare.key === c.key ? state.aiCompare : null;
  const plain = templateCompare(a, b, cmp);
  $('compare-text').innerHTML = COMPARE_CHAPTERS.map((ch, i) => `<li><h4>${esc(ch.title)}</h4><p>${esc(ai?.paras?.[i] ?? verifyAndFill(plain[ch.id], cmp.facts).text)}</p></li>`).join('');
  $('compare-ai').textContent = ai ? 'Rewrite with AI' : 'Write it with AI';
  $('compare-meta').textContent = ai ? `Narrated by ${ai.model}; every number checked against the facts.` : 'Written from the facts by fixed rules. Bold marks the higher value.';
}

async function compareWithAI() {
  const c = compareState();
  if (!c) return;
  const btn = $('compare-ai'), status = $('compare-status');
  btn.disabled = true;
  status.textContent = 'Writing the comparison with AI…';
  try {
    const r = await askModel({ mode: 'compare', tone: $('story-tone').value, paddock: `${c.cmp.nameA} and ${c.cmp.nameB}`, chapters: COMPARE_CHAPTERS.map((x) => x.title) }, c.cmp.facts);
    const paras = r.text.split(r.separator).map((x) => x.trim()).filter(Boolean);
    if (paras.length !== COMPARE_CHAPTERS.length) throw new Error('the AI comparison came back in the wrong shape');
    state.aiCompare = { key: c.key, paras, model: r.model };
    status.textContent = '';
  } catch (err) {
    state.aiCompare = null;
    status.textContent = `Showing plain facts: ${err.message}.`;
  } finally {
    btn.disabled = false;
    renderCompare();
  }
}

// Rotations ranked for the user's goals, as small bars (Story chapter 5 and Ask).
function miniRank() {
  const crop = (id) => state.crops.crops[id]?.label || id;
  const ranked = [...state.results].sort((a, b) => b.overall - a.overall);
  return `<div class="mini-rank">${ranked.map((r) => `<div class="mr ${r.id === 'current' ? 'now' : ''}"><span>${esc(r.label)}<small>${r.rotation.map(crop).map(esc).join(' → ')}</small></span><span class="mr-track"><span style="width:${(r.overall / 5) * 100}%"></span></span><b>${r.overall.toFixed(1)}</b></div>`).join('')}</div>`;
}

// A small chart beside an answer, chosen by what the question is about. Empty when no chart fits.
const ASK_CHARTS = [
  { id: 'rain', words: /\b(rain|rainfall|wet|dry|drought|water)/i },
  { id: 'frost', words: /\b(frost|cold|freez)/i },
  { id: 'heat', words: /\b(heat|hot|temperature|warm)/i },
  { id: 'bare', words: /\b(bare|green|ndvi|cover|erosion|ground)/i },
  { id: 'rotation', words: /\b(best|rotation|grow|crop|score|recommend|should|option|suit)/i },
];
function askFigure(question, p) {
  const y = p.yearly || {}, f = p.features || {};
  const fig = (title, note, body) => `<figure class="ask-fig"><figcaption><b>${title}</b><span>${note}</span></figcaption>${body}</figure>`;
  const markOf = (vals) => { const ok = (vals || []).filter(has); return ok.length ? [vals.indexOf(Math.max(...ok))] : []; };
  for (const t of ASK_CHARTS.filter((x) => x.words.test(question))) {
    if (t.id === 'rain' && y.gs_rain_mm?.length) {
      const ok = y.gs_rain_mm.map((v, i) => [v, y.year[i]]).filter(([v]) => has(v));
      const dry = ok.reduce((a, b) => (b[0] < a[0] ? b : a)), wet = ok.reduce((a, b) => (b[0] > a[0] ? b : a));
      const cols = [[dry[0], 'Driest', dry[1]], [f.gs_rain_mm, 'Average', f.years || ''], [wet[0], 'Wettest', wet[1]]].filter(([v]) => has(v));
      const tubes = `<div class="tubes" role="img" aria-label="Growing-season rain: ${cols.map(([v, l, s]) => `${l} ${s}, ${v} mm`).join('; ')}">${cols.map(([v, l, s]) =>
        `<div class="tube-col"><div class="tube"><span style="height:${Math.max(2, (100 * v) / wet[0]).toFixed(1)}%"></span></div><b>${v} mm</b><small>${esc(l)}<br>${esc(String(s))}</small></div>`).join('')}</div>`;
      return fig('Growing-season rain', 'April–October total, mm', tubes);
    }
    if (t.id === 'frost' && y.frost_days?.length) return fig('Frost days at flowering by year', 'August–October. Worst year labelled.', yearBars(y.year, y.frost_days, { unit: 'days', mark: markOf(y.frost_days), label: 'Frost days at flowering by year' }));
    if (t.id === 'heat' && y.heat_days?.length) return fig('Hot days at grain fill by year', '32 °C or hotter, October–November. Worst year labelled.', yearBars(y.year, y.heat_days, { unit: 'days', mark: markOf(y.heat_days), label: 'Hot days at grain fill by year' }));
    if (t.id === 'bare' && p.ndvi_profile?.length) return fig('Greenness by month', 'Average NDVI; below the dashed line (0.25) counts as bare.', lineChart(p.ndvi_profile, 0.25));
    if (t.id === 'rotation' && state.results.length) return fig('Score for your goals', 'Out of 5, weighted by your goals.', miniRank());
  }
  return '';
}

// ---------- Ask about this paddock ----------
function setupAsk() {
  const form = $('ask-form');
  if (!form) return;
  form.addEventListener('submit', (e) => { e.preventDefault(); askPaddock($('ask-q').value); });
  $('ask-chips').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { $('ask-q').value = b.textContent; askPaddock(b.textContent); }));
}

async function askPaddock(question) {
  const q = question.trim().slice(0, 200);
  if (!q || !state.paddock) return;
  const out = $('ask-answer'), btn = $('ask-go');
  const story = storyFacts(state.paddock, state.results);
  const show = (text, meta, chart = '') => {
    out.dataset.for = state.paddock.id;
    out.innerHTML = `<div class="ask-text"><p class="q">${esc(q)}</p><p>${esc(text)}</p><p class="meta">${esc(meta)}</p></div>${chart}`;
    out.classList.toggle('with-fig', !!chart);
  };
  const fallback = (why) => {
    const t = templateAnswer(q, story.facts);
    if (!t) return show("The NASA facts for this paddock can't answer that. Try asking about rain, frost, heat, bare ground, soil wetness at sowing or which rotation suits your goals.", why || 'Answered by fixed rules.');
    show(verifyAndFill(t, story.facts).text, `Straight from the facts on the Data tab${why ? `. ${why}` : ''}.`, askFigure(q, state.paddock));
  };
  btn.disabled = true;
  out.classList.remove('with-fig');
  out.innerHTML = '<p class="meta">Looking through the facts…</p>';
  try {
    const r = await askModel({ mode: 'ask', tone: $('story-tone').value, paddock: state.paddock.live ? 'your chosen spot' : state.paddock.name, question: q }, story.facts);
    show(r.text, `Answered by ${r.model} using only this paddock's facts; every number checked.`, askFigure(q, state.paddock));
  } catch (err) {
    fallback(err.off ? '' : `AI answer unavailable: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

// ---------- Voice-over (read the story aloud, or copy the script for the demo video) ----------
let speaking = false;
function storyTexts() {
  return [...document.querySelectorAll('#story-chapters .chapter p')].map((p) => p.textContent);
}
function setupVoice() {
  const btn = $('story-listen');
  if (!btn) return;
  if (!('speechSynthesis' in window)) btn.hidden = true;
  btn.addEventListener('click', () => (speaking ? stopVoice() : startVoice()));
  $('story-script').addEventListener('click', async () => {
    const title = `The story of ${$('story-name').textContent}`;
    const script = voiceScript(title, CHAPTERS, storyTexts());
    try { await navigator.clipboard.writeText(script); $('story-status').textContent = 'Voice-over script copied. Paste it into your video editor or read it as the narrator.'; }
    catch { $('story-status').textContent = 'Could not copy automatically; select the chapter text instead.'; }
  });
}
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'en-AU') || voices.find((v) => v.lang?.startsWith('en-GB')) || voices.find((v) => v.lang?.startsWith('en')) || null;
}
function startVoice() {
  const items = [...document.querySelectorAll('#story-chapters .chapter')];
  if (!items.length) return;
  speechSynthesis.cancel();
  speaking = true;
  $('story-listen').setAttribute('aria-pressed', 'true');
  $('story-listen').textContent = 'Stop';
  const voice = pickVoice();
  const say = (i) => {
    items.forEach((el, j) => el.classList.toggle('speaking', j === i));
    if (!speaking || i >= items.length) return stopVoice();
    const el = items[i];
    el.scrollIntoView({ behavior: calmMotion.matches ? 'auto' : 'smooth', block: 'center' });
    const u = new SpeechSynthesisUtterance(`${el.querySelector('h3').textContent}. ${el.querySelector('p').textContent}`);
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.onend = () => say(i + 1);
    u.onerror = () => stopVoice();
    speechSynthesis.speak(u);
  };
  say(0);
}
function stopVoice() {
  if (!speaking) return;
  speaking = false;
  speechSynthesis.cancel();
  document.querySelectorAll('.chapter.speaking').forEach((el) => el.classList.remove('speaking'));
  const btn = $('story-listen');
  if (btn) { btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Listen'; }
}


// ---------- Data tab: headline figures and where each dataset comes from ----------
function renderSources(p) {
  const f = p.features || {};
  const ndvi = (p.ndvi_profile || []).length > 0;
  const SOURCES = [
    { name: 'NASA POWER', who: 'NASA Langley', what: 'Daily rain, temperature and topsoil wetness', grain: 'about 50 km grid, daily', status: p.live ? 'live' : f.years ? 'ok' : 'off' },
    { name: 'MODIS MOD13Q1 NDVI', who: 'NASA, via ORNL DAAC', what: 'How green the paddock is, every 16 days', grain: '250 m', status: ndvi ? 'ok' : p.live ? 'off' : 'next' },
    { name: 'SMAP L4 soil moisture', who: 'NASA, via AppEEARS', what: 'Soil moisture at sowing', grain: '9 km', status: has(f.smap_sowing_sm) ? 'ok' : 'optional' },
    { name: 'SRTM elevation', who: 'NASA, via AppEEARS', what: 'Slope, for erosion risk', grain: '30 m', status: has(f.slope_pct) ? 'ok' : 'optional' },
    { name: 'SILO', who: 'Queensland Government', what: 'Rain-gauge check on NASA rainfall', grain: 'about 5 km', status: 'optional' },
    { name: 'Soil and Landscape Grid', who: 'CSIRO and TERN', what: 'Soil organic carbon', grain: '90 m', status: has(f.soil_organic_carbon_pct) ? 'ok' : 'optional' },
  ];
  const LABEL = { ok: 'Loaded', live: 'Fetched live', next: 'Next pipeline run', optional: 'Planned', off: 'Not available here' };
  $('source-grid').innerHTML = SOURCES.map((x) => `
    <article class="source ${x.status}">
      <header><h3>${esc(x.name)}</h3><span class="badge">${LABEL[x.status]}</span></header>
      <p>${esc(x.what)}</p>
      <p class="muted">${esc(x.who)} · ${esc(x.grain)}</p>
    </article>`).join('');
  const loaded = SOURCES.filter((x) => x.status === 'ok' || x.status === 'live').length;
  const measures = [f.gs_rain_mm, f.gs_rain_min_mm, f.gs_rain_cv_pct, f.frost_days_aug_oct, f.heat_days_oct_nov, f.heavy_rain_days, f.sowing_soil_wetness, f.bare_months_per_year, f.slope_pct, f.smap_sowing_sm, f.soil_organic_carbon_pct].filter(has).length;
  const gaps = paddockGaps(p).length;
  $('data-stats').innerHTML = [
    [f.years || '—', 'years of record'],
    [measures, 'measures'],
    [loaded, `data sources loaded, ${SOURCES.length - loaded} planned`],
    [gaps, gaps === 1 ? 'thing to check' : 'things to check'],
  ].map(([v, k]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
}

// Keep a term's definition tip inside the clipped tab area: shift it left near the
// right edge, and drop it below the term when there is no room above.
function placeTip(el) {
  if (!el?.classList?.contains('term')) return;
  el.style.removeProperty('--tip-x');
  el.classList.remove('tip-below');
  const box = (el.closest('.tabpanels') || document.body).getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const tip = getComputedStyle(el, '::after');
  const w = parseFloat(tip.width) + parseFloat(tip.paddingLeft) + parseFloat(tip.paddingRight) || 300;
  const h = parseFloat(tip.height) + parseFloat(tip.paddingTop) + parseFloat(tip.paddingBottom) || 90;
  const room = Math.min(box.right, window.innerWidth) - 8;
  const over = r.left + w - room;
  if (over > 0) el.style.setProperty('--tip-x', `${-Math.min(over, r.left - Math.max(box.left, 0) - 8)}px`);
  if (r.top - h - 8 < Math.max(box.top, 0)) el.classList.add('tip-below');
}
document.addEventListener('pointerover', (e) => placeTip(e.target.closest?.('.term')));
document.addEventListener('focusin', (e) => placeTip(e.target.closest?.('.term')));

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

function buildSliders() {
  $('sliders').innerHTML = PRIORITIES.map((p) => `
    <label class="slider"><span>${p.label}</span>
      <input type="range" min="0" max="5" step="1" value="${state.weights[p.id]}" data-id="${p.id}" aria-label="${p.label} importance">
      <b id="w-${p.id}">${state.weights[p.id]}</b></label>`).join('');
  $('sliders').querySelectorAll('input').forEach((el) => el.addEventListener('input', (e) => {
    state.weights[e.target.dataset.id] = Number(e.target.value);
    $(`w-${e.target.dataset.id}`).textContent = e.target.value;
    render();
  }));
}

function buildMap() {
  const map = L.map('map', { scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  map.fitBounds(state.data.paddocks.map((p) => p.center), { padding: [40, 40] });
  for (const p of state.data.paddocks) {
    const layer = L.geoJSON(p.geometry, { style: { color: '#c9962b', weight: 3, fillOpacity: 0.25 } })
      .bindTooltip(p.name)
      .on('click', () => selectPaddock(p))
      .addTo(map);
    const marker = L.circleMarker(p.center, { radius: 7, color: '#2f6b3a', fillColor: '#2f6b3a', fillOpacity: 0.9 })
      .bindTooltip(p.name)
      .on('click', () => selectPaddock(p))
      .addTo(map);
    state.layers[p.id] = { layer, marker };
  }
  state.map = map;
}

function selectPaddock(p) {
  state.paddock = p;
  state.currentRotation = [...p.current_rotation];
  history.replaceState(null, '', `#${p.id}`);
  for (const [id, { layer, marker }] of Object.entries(state.layers)) {
    const on = id === p.id;
    layer.setStyle({ color: on ? '#2f6b3a' : '#c9962b', weight: on ? 4 : 2 });
    marker.setStyle({ radius: on ? 11 : 7, fillColor: on ? '#c9962b' : '#2f6b3a' });
  }
  buildRotationSelect();
  renderPaddock();
  render();
}

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
    factTile(f.frost_days_aug_oct, 'days', 'Frost days, Aug–Oct', power),
    factTile(f.heat_days_oct_nov, 'days', 'Days 32 °C+, Oct–Nov', power),
    factTile(f.heavy_rain_days, 'days/yr', 'Heavy-rain days (25 mm+)', power),
    factTile(f.sowing_soil_wetness, '0–1', 'Topsoil wetness at sowing (Apr–May)', power),
    factTile(f.bare_months_per_year, 'months/yr', 'Bare (NDVI under 0.25)', modis),
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
  const best = Math.max(...results.map((r) => r.overall));
  const crop = (id) => state.crops.crops[id]?.label || id;
  $('cards').innerHTML = results.map((r) => `
    <article class="card ${r.overall === best ? 'best' : ''}">
      ${r.overall === best ? '<span class="badge">Best match for your priorities</span>' : ''}
      <h3>${esc(r.label)}</h3>
      <div class="overall">${r.overall}<small> / 5</small></div>
      <div class="rot">${r.rotation.map(crop).map(esc).join(' → ')}</div>
      <p class="muted">${esc(r.why)}</p>
      <div class="bars">${PRIORITIES.map((p) => `
        <div class="bar"><span>${p.label}</span><span class="track"><span class="fill" style="width:${(r.scores[p.id] / 5) * 100}%"></span></span><b>${r.scores[p.id]}</b></div>`).join('')}
      </div>
      <p class="label"><b>Needs local review</b></p>
      <ul>${r.risks.length ? r.risks.map((x) => `<li>${esc(x)}</li>`).join('') : '<li>No major flags from the data.</li>'}</ul>
      <button type="button" data-id="${r.id}">Why this score?</button>
    </article>`).join('');
  $('cards').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => explain(b.dataset.id)));
  $('gaps').innerHTML = gapsFor(state.paddock.features || {}).map((g) => `<li>${esc(g)}</li>`).join('');
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

function barChart(values) {
  if (!values.length) return '<p class="muted">No data</p>';
  const w = 300, h = 120, pad = 18, max = Math.max(...values.filter(has), 1);
  const bw = (w - pad) / 12;
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Average monthly rain">
    ${values.map((v, i) => {
      const bh = has(v) ? ((h - 2 * pad) * v) / max : 0;
      return `<rect x="${pad + i * bw + 2}" y="${h - pad - bh}" width="${bw - 4}" height="${bh}" fill="#c9962b"><title>${MONTHS[i]}: ${v} mm</title></rect>
      <text x="${pad + i * bw + bw / 2}" y="${h - 4}" text-anchor="middle">${MONTHS[i]}</text>`;
    }).join('')}
    <text x="2" y="12">${Math.round(max)}</text></svg>`;
}

function lineChart(values, threshold) {
  if (!values.length) return '<p class="muted">No data</p>';
  const w = 300, h = 120, pad = 18;
  const x = (i) => pad + (i * (w - 2 * pad)) / 11;
  const y = (v) => h - pad - (v / 0.9) * (h - 2 * pad);
  const pts = values.map((v, i) => (has(v) ? `${x(i)},${y(v)}` : null)).filter(Boolean).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Average NDVI by month">
    <line x1="${pad}" x2="${w - pad}" y1="${y(threshold)}" y2="${y(threshold)}" stroke="#a3402a" stroke-dasharray="4 3"/>
    <text x="${w - pad}" y="${y(threshold) - 3}" text-anchor="end">bare</text>
    <polyline points="${pts}" fill="none" stroke="#2f6b3a" stroke-width="2.5"/>
    ${values.map((v, i) => (has(v) ? `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="#2f6b3a"><title>${MONTHS[i]}: ${v}</title></circle>` : '')).join('')}
    ${MONTHS.map((m, i) => `<text x="${x(i)}" y="${h - 4}" text-anchor="middle">${m}</text>`).join('')}</svg>`;
}

init().catch((err) => {
  document.querySelector('main').innerHTML = `<div class="panel"><h2>Could not load data</h2><p>${esc(err.message)}</p><p class="muted">If you opened index.html directly, start a local server instead: <code>python -m http.server -d app 8000</code></p></div>`;
});

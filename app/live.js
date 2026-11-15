// Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
// Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

// "Any location": fetch ten years of NASA POWER daily data for a point the user picks on the map,
// and summarise it with the same rules as pipelines/power.py + build_features.py.
// NASA POWER needs no key and allows browser requests, so this runs entirely in the page.

const API = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const PARAMS = ['T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'GWETTOP'];
export const FIRST_YEAR = 2016;
export const LAST_YEAR = 2025;
const GS = [4, 5, 6, 7, 8, 9, 10], FROST = [8, 9, 10], HEAT = [10, 11], SOW = [4, 5];

const rd = (x, n = 1) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 10 ** n) / 10 ** n);
const mean = (a) => { a = a.filter((x) => x !== null && !Number.isNaN(x)); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

/** Turn a NASA POWER daily JSON response into features, monthly climate and yearly series. */
export function summarisePower(json) {
  const p = json.properties.parameter;
  const groups = new Map();
  for (const d of Object.keys(p.T2M_MIN)) {
    const y = +d.slice(0, 4), m = +d.slice(4, 6), k = y * 100 + m;
    if (!groups.has(k)) groups.set(k, { y, m, rain: [], tmin: [], tmax: [], gt: [] });
    const g = groups.get(k);
    const v = (key) => { const x = p[key]?.[d]; return x === undefined || x <= -999 ? null : x; };
    g.rain.push(v('PRECTOTCORR')); g.tmin.push(v('T2M_MIN')); g.tmax.push(v('T2M_MAX')); g.gt.push(v('GWETTOP'));
  }
  const rows = [...groups.values()].map((g) => ({
    y: g.y, m: g.m,
    rain: g.rain.filter((x) => x !== null).reduce((s, x) => s + x, 0),
    frost: g.tmin.filter((x) => x !== null && x <= 2).length,
    heat: g.tmax.filter((x) => x !== null && x >= 32).length,
    heavy: g.rain.filter((x) => x !== null && x >= 25).length,
    gt: mean(g.gt),
  }));
  const years = [...new Set(rows.map((r) => r.y))].sort((a, b) => a - b);
  const per = (f, months) => years.map((y) => rows.filter((r) => r.y === y && (!months || months.includes(r.m))).reduce((s, r) => s + f(r), 0));
  const gs = per((r) => r.rain, GS), fr = per((r) => r.frost, FROST), ht = per((r) => r.heat, HEAT);
  const features = {
    years: `${years[0]}–${years.at(-1)}`,
    n_years: years.length,
    annual_rain_mm: rd(mean(per((r) => r.rain)), 0),
    gs_rain_mm: rd(mean(gs), 0),
    gs_rain_min_mm: rd(Math.min(...gs), 0),
    gs_rain_cv_pct: rd((100 * sd(gs)) / mean(gs), 0),
    frost_days_aug_oct: rd(mean(fr)),
    heat_days_oct_nov: rd(mean(ht)),
    heavy_rain_days: rd(mean(per((r) => r.heavy))),
    sowing_soil_wetness: rd(mean(rows.filter((r) => SOW.includes(r.m)).map((r) => r.gt)), 2),
  };
  const clim = (f, n) => Array.from({ length: 12 }, (_, i) => rd(mean(rows.filter((r) => r.m === i + 1).map(f)), n));
  return {
    features,
    monthly: { rain_mm: clim((r) => r.rain, 0), frost_days: clim((r) => r.frost, 1), heat_days: clim((r) => r.heat, 1), soil_wetness: clim((r) => r.gt, 2) },
    yearly: { year: years, gs_rain_mm: gs.map((v) => rd(v, 0)), frost_days: fr, heat_days: ht },
  };
}

/** Build a paddock object for any point, from live NASA POWER data. */
export async function liveLocation(lat, lon, { signal } = {}) {
  const url = `${API}?parameters=${PARAMS.join(',')}&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&start=${FIRST_YEAR}0101&end=${LAST_YEAR}1231&format=JSON`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`NASA POWER answered ${resp.status}`);
  const s = summarisePower(await resp.json());
  const h = 0.005;
  return {
    id: 'custom',
    name: 'Your chosen spot',
    region: `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`,
    center: [lat, lon],
    geometry: { type: 'Polygon', coordinates: [[[lon - h, lat + h], [lon + h, lat + h], [lon + h, lat - h], [lon - h, lat - h], [lon - h, lat + h]]] },
    current_rotation: ['wheat', 'canola', 'wheat', 'wheat'],
    features: s.features,
    monthly: s.monthly,
    yearly: s.yearly,
    ndvi_profile: [],
    sources: ['NASA POWER (live)'],
    live: true,
  };
}

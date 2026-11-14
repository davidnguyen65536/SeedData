// Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
// Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

// SeedData scoring rules. Transparent, documented in docs/methodology.md.
// Pure functions only, so the same code runs in the browser and in tests.

export const PRIORITIES = [
  { id: 'water', label: 'Save water' },
  { id: 'soil', label: 'Improve soil' },
  { id: 'risk', label: 'Reduce risk' },
  { id: 'income', label: 'Extra income' },
];

const clamp = (x, lo = 0, hi = 5) => Math.min(hi, Math.max(lo, x));
const r1 = (x) => Math.round(x * 10) / 10;
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const has = (v) => v !== null && v !== undefined && !Number.isNaN(v);

/** Resolve a strategy's rotation (an array of crop ids, or "current"). */
export function rotationFor(strategy, currentRotation) {
  return strategy.rotation === 'current' ? currentRotation : strategy.rotation;
}

/** Summary of a rotation's crop traits. */
export function rotationTraits(rotation, crops) {
  const c = rotation.map((id) => {
    const crop = crops[id];
    if (!crop) throw new Error(`Unknown crop: ${id}`);
    return crop;
  });
  const n = c.length;
  let cerealPairs = 0;
  for (let i = 0; i < n; i++) if (c[i].cereal && c[(i + 1) % n].cereal) cerealPairs++;
  return {
    years: n,
    waterUse: avg(c.map((x) => x.water_use)),
    frostSens: avg(c.map((x) => x.frost_sensitivity)),
    heatSens: avg(c.map((x) => x.heat_sensitivity)),
    cover: avg(c.map((x) => x.ground_cover)),
    nFixYears: c.filter((x) => x.n_fixing).length,
    perennialYears: c.filter((x) => x.perennial).length,
    livestockYears: c.filter((x) => x.livestock).length,
    markets: new Set(c.map((x) => x.market)).size,
    cerealPairs,
    crops: c,
  };
}

/**
 * Score one rotation for one paddock.
 * @param {string[]} rotation crop ids, one per year
 * @param {object} crops crop traits keyed by id
 * @param {object} f paddock features (any may be null)
 * @param {{hasLivestock?: boolean}} opts farmer constraints
 */
export function scoreRotation(rotation, crops, f, opts = {}) {
  const t = rotationTraits(rotation, crops);
  const hasLivestock = opts.hasLivestock ?? false;

  // Save water: lower average crop water use scores higher; water-hungry
  // rotations lose a little more where growing-season rain is unreliable.
  const unreliable = has(f.gs_rain_cv_pct) && f.gs_rain_cv_pct > 30;
  const water = clamp(5 - 2 * (t.waterUse - 1) - (unreliable ? 0.5 * (t.waterUse - 1) : 0));

  // Improve soil: nitrogen-fixing years, perennial years and ground cover.
  const soil = clamp(1 + 0.6 * t.nFixYears + 0.5 * t.perennialYears + 1.0 * (t.cover - 1));

  // Reduce risk: start at 5, subtract frost, heat, erosion and disease exposure.
  const frostIdx = has(f.frost_days_aug_oct) ? Math.min(f.frost_days_aug_oct / 10, 1) : 0.5;
  const heatIdx = has(f.heat_days_oct_nov) ? Math.min(f.heat_days_oct_nov / 5, 1) : 0.5;
  let erosionIdx = has(f.heavy_rain_days) ? Math.min(f.heavy_rain_days / 3, 1) : 0.5;
  if (has(f.slope_pct)) erosionIdx *= 0.5 + 0.5 * Math.min(f.slope_pct / 5, 1);
  const penalties = {
    frost: frostIdx * (t.frostSens - 1) * 1.5,
    heat: heatIdx * (t.heatSens - 1) * 1.0,
    erosion: (erosionIdx * (3 - t.cover)) / 2,
    disease: 0.4 * t.cerealPairs,
  };
  const risk = clamp(5 - penalties.frost - penalties.heat - penalties.erosion - penalties.disease);

  // Extra income: more distinct markets spread price risk; grazed years earn
  // nothing without livestock. No price data yet (a listed gap).
  const income = clamp(2.5 + 0.5 * (t.markets - 1) - (hasLivestock ? 0 : 0.75 * t.livestockYears));

  return {
    scores: { water: r1(water), soil: r1(soil), risk: r1(risk), income: r1(income) },
    traits: t,
    penalties: Object.fromEntries(Object.entries(penalties).map(([k, v]) => [k, r1(v)])),
  };
}

/** Weighted overall score from 0-5 slider weights (all zero = equal weights). */
export function overall(scores, weights) {
  const ids = PRIORITIES.map((p) => p.id);
  const total = ids.reduce((s, id) => s + (weights[id] ?? 0), 0);
  const w = total > 0 ? weights : Object.fromEntries(ids.map((id) => [id, 1]));
  const sum = ids.reduce((s, id) => s + (w[id] ?? 0), 0);
  return r1(ids.reduce((s, id) => s + scores[id] * (w[id] ?? 0), 0) / sum);
}

/** Risks that need local review, as plain sentences. */
export function risksFor(t, f, opts = {}) {
  const out = [];
  if (t.cerealPairs > 0) {
    out.push(`Cereal follows cereal ${t.cerealPairs} time(s) in the cycle, which can build root and leaf diseases such as crown rot.`);
  }
  const frosty = t.crops.filter((c) => c.frost_sensitivity >= 3);
  if (frosty.length && has(f.frost_days_aug_oct) && f.frost_days_aug_oct >= 5) {
    out.push(`${frosty[0].label} is frost-sensitive at flowering, and this paddock averages ${f.frost_days_aug_oct} frost days in Aug–Oct.`);
  }
  const hot = t.crops.filter((c) => c.heat_sensitivity >= 3);
  if (hot.length && has(f.heat_days_oct_nov) && f.heat_days_oct_nov >= 2) {
    out.push(`${hot[0].label} is heat-sensitive at flowering and pod fill; this paddock averages ${f.heat_days_oct_nov} days of 32 °C or more in Oct–Nov.`);
  }
  const thirsty = t.crops.filter((c) => c.water_use >= 3);
  if (thirsty.length && has(f.gs_rain_min_mm)) {
    out.push(`${thirsty[0].label} uses more water; in the driest season on record here (${f.gs_rain_min_mm} mm Apr–Oct) the next crop may start with a drier soil profile.`);
  }
  if (t.livestockYears > 0 && !opts.hasLivestock) {
    out.push('The pasture years need livestock, fencing and stock water to earn income.');
  }
  if (t.cover < 1.75 && has(f.heavy_rain_days) && f.heavy_rain_days >= 1) {
    out.push(`Low ground cover after the pulse year, with about ${f.heavy_rain_days} heavy-rain day(s) a year, raises erosion risk.`);
  }
  return out;
}

/** What the data can't tell us for this paddock. */
export function gapsFor(f) {
  const out = [];
  if (!has(f.soil_organic_carbon_pct) && !has(f.soil_clay_pct) && !has(f.soil_awc_mm)) {
    out.push('No soil test or Soil and Landscape Grid values entered for this paddock yet.');
  }
  if (!has(f.slope_pct)) out.push('Slope not loaded (SRTM via AppEEARS); erosion risk uses rainfall only.');
  if (!has(f.smap_sowing_sm)) out.push('SMAP soil moisture not loaded; sowing moisture uses NASA POWER soil wetness (MERRA-2 model).');
  if (!has(f.frost_days_aug_oct)) out.push('No climate data loaded; frost, heat and rain use neutral defaults.');
  if (!has(f.bare_months_per_year)) out.push('No MODIS NDVI loaded; bare-soil months unknown.');
  out.push('Crop traits are drafts and still need checking against NSW DPI and GRDC guides.');
  out.push('No crop price data yet: income is scored on how many markets the rotation sells into.');
  out.push('NASA POWER cells are about 50 km across and MODIS pixels 250 m, so nearby paddocks can share values.');
  return out;
}

/** Score all strategies for a paddock. */
export function evaluate(paddock, cropsDoc, weights, opts = {}) {
  const f = paddock.features || {};
  const current = opts.currentRotation || paddock.current_rotation;
  return cropsDoc.strategies.map((s) => {
    const rotation = rotationFor(s, current);
    const res = scoreRotation(rotation, cropsDoc.crops, f, opts);
    return {
      id: s.id,
      label: s.label,
      why: s.why,
      rotation,
      ...res,
      overall: overall(res.scores, weights),
      risks: risksFor(res.traits, f, opts),
    };
  });
}

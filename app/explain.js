// Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
// Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

// Explanations for a strategy. Every number shown comes from a numbered fact,
// so it can be traced to its source. Used by the browser and by api/explain.js.

const has = (v) => v !== null && v !== undefined && !Number.isNaN(v);

/** Numbered facts for one strategy on one paddock. */
export function factsFor(result, paddock) {
  const f = paddock.features || {};
  const period = f.years ? `NASA POWER ${f.years}` : 'NASA POWER';
  const facts = [];
  const add = (label, value, unit, source) => {
    if (!has(value)) return;
    facts.push({ id: `f${facts.length + 1}`, label, value, unit, source });
  };
  add('Overall score for your priorities', result.overall, '/5', 'Seed Data rules');
  add('Save water score', result.scores.water, '/5', 'Seed Data rules');
  add('Improve soil score', result.scores.soil, '/5', 'Seed Data rules');
  add('Reduce risk score', result.scores.risk, '/5', 'Seed Data rules');
  add('Extra income score', result.scores.income, '/5', 'Seed Data rules');
  add('Frost days in Aug–Oct, average per year', f.frost_days_aug_oct, 'days', period);
  add('Days of 32 °C or more in Oct–Nov, average per year', f.heat_days_oct_nov, 'days', period);
  add('Growing-season rain (Apr–Oct), average', f.gs_rain_mm, 'mm', period);
  add('Growing-season rain, year-to-year variation', f.gs_rain_cv_pct, '%', period);
  add('Heavy-rain days (25 mm or more), average per year', f.heavy_rain_days, 'days', period);
  add('Months a year the paddock looks bare (NDVI under 0.25)', f.bare_months_per_year, 'months', f.ndvi_years ? `MODIS MOD13Q1 ${f.ndvi_years}` : 'MODIS MOD13Q1');
  add('Years with a nitrogen-fixing crop', result.traits.nFixYears, `of ${result.traits.years}`, 'Crop traits (draft)');
  add('Times a cereal follows a cereal', result.traits.cerealPairs, '', 'Crop traits (draft)');
  add('Slope', f.slope_pct, '%', 'SRTM');
  return facts;
}

const fmt = (fact) => `${fact.value}${fact.unit && !fact.unit.startsWith('/') && !fact.unit.startsWith('of') ? ' ' : ''}${fact.unit ? fact.unit.replace(/^of /, ' of ') : ''}`.trim();
const byLabel = (facts, start) => facts.find((x) => x.label.startsWith(start));

/** Plain-English explanation built only from facts (no model needed). */
export function templateExplanation(result, paddock, facts) {
  const p = (start) => {
    const x = byLabel(facts, start);
    return x ? `{${x.id}}` : null;
  };
  const best = Object.entries(result.scores).sort((a, b) => b[1] - a[1])[0][0];
  const bestLabel = { water: 'saving water', soil: 'improving soil', risk: 'reducing risk', income: 'extra income' }[best];
  const lines = [];
  lines.push(`${result.label} scores ${p('Overall score')} for your priorities, and is strongest on ${bestLabel}.`);
  const cereal = result.traits.cerealPairs > 0
    ? `a cereal follows a cereal ${p('Times a cereal follows')} time(s) in the cycle`
    : 'no cereal follows another cereal';
  lines.push(`It has a nitrogen-fixing crop in ${p('Years with a nitrogen-fixing crop')} years, and ${cereal}.`);
  if (p('Frost days')) {
    lines.push(`This paddock averages ${p('Frost days')} of frost in Aug–Oct and ${p('Days of 32')} of very hot weather in Oct–Nov, with ${p('Growing-season rain (Apr')} of rain from April to October.`);
  }
  if (p('Months a year')) {
    lines.push(`Satellite greenness shows the paddock bare for about ${p('Months a year')} a year, so crops that keep the soil covered help it most.`);
  }
  lines.push('These are indicative scores from public data; check the plan with your local agronomist.');
  return lines.join(' ');
}

/**
 * Check a text that uses {fN} placeholders: every placeholder must exist,
 * no other digits may appear, and no promises about outcomes.
 * Returns {ok, errors, text} with placeholders filled in.
 */
export function verifyAndFill(text, facts) {
  const errors = [];
  const ids = new Set(facts.map((x) => x.id));
  for (const m of text.matchAll(/\{(f\d+)\}/g)) {
    if (!ids.has(m[1])) errors.push(`unknown fact ${m[1]}`);
  }
  const stripped = text.replace(/\{f\d+\}/g, '').replace(/Aug–Oct|Oct–Nov|Apr–Oct/g, '');
  if (/\d/.test(stripped)) errors.push('a number that is not from a fact');
  if (/\b(guarantee[ds]?|definitely|certainly|will (increase|improve|reduce|boost))\b/i.test(text)) {
    errors.push('a promise about outcomes');
  }
  const filled = text.replace(/\{(f\d+)\}/g, (_, id) => {
    const fact = facts.find((x) => x.id === id);
    return fact ? fmt(fact) : '?';
  });
  return { ok: errors.length === 0, errors, text: filled };
}

// Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
// Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

// The paddock's story: five short chapters built from the same numbered facts as the scores.
// Rule-based text is always available; an AI narrator can reword chapters 1-5, and every
// number it uses is checked by verifyAndFill (explain.js) before it is shown.

const has = (v) => v !== null && v !== undefined && !Number.isNaN(v);
const score = (n) => (Math.round(n * 10) / 10).toFixed(1);
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const GOALS = { water: 'saving water', soil: 'improving soil', risk: 'reducing risk', income: 'extra income' };

export const CHAPTERS = [
  { id: 'place', title: 'Meet the paddock' },
  { id: 'seasons', title: 'A decade of seasons' },
  { id: 'frost', title: 'Frost at flowering, heat at grain fill' },
  { id: 'cover', title: 'When the ground goes bare' },
  { id: 'rotation', title: 'What this means for your rotation' },
];

/** Numbered facts for the story (same shape as explain.js facts). */
export function storyFacts(paddock, results) {
  const f = paddock.features || {};
  const y = paddock.yearly || {};
  const period = f.years ? `NASA POWER ${f.years}` : 'NASA POWER';
  const facts = [];
  const add = (key, label, value, unit, source) => {
    if (!has(value)) return;
    facts.push({ id: `f${facts.length + 1}`, key, label, value, unit, source });
  };
  add('period', 'Years of record', f.years, '', 'NASA POWER');
  add('gs', 'Growing-season rain (Apr–Oct), average', f.gs_rain_mm, 'mm', period);
  add('cv', 'Growing-season rain, year-to-year variation', f.gs_rain_cv_pct, '%', period);
  if (y.year?.length && y.gs_rain_mm?.length) {
    const ok = y.gs_rain_mm.map((v, i) => [v, y.year[i]]).filter(([v]) => has(v));
    const dry = ok.reduce((a, b) => (b[0] < a[0] ? b : a)), wet = ok.reduce((a, b) => (b[0] > a[0] ? b : a));
    add('dryYear', 'Driest growing season (year)', dry[1], '', period);
    add('dryMm', 'Driest growing season (rain)', dry[0], 'mm', period);
    add('wetYear', 'Wettest growing season (year)', wet[1], '', period);
    add('wetMm', 'Wettest growing season (rain)', wet[0], 'mm', period);
  }
  add('frost', 'Frost days in Aug–Oct, average per year', f.frost_days_aug_oct, 'days', period);
  if (y.year?.length && y.frost_days?.length) {
    const i = y.frost_days.indexOf(Math.max(...y.frost_days));
    add('frostYear', 'Frostiest flowering season (year)', y.year[i], '', period);
    add('frostMax', 'Frostiest flowering season (frost days)', y.frost_days[i], 'frosty days', period);
  }
  add('heat', 'Very hot days in Oct–Nov, average per year', f.heat_days_oct_nov, 'days', period);
  add('bare', 'Months a year the paddock looks bare', f.bare_months_per_year, 'months', f.ndvi_years ? `MODIS MOD13Q1 ${f.ndvi_years}` : 'MODIS MOD13Q1');
  add('annual', 'Rain over the whole year, average', f.annual_rain_mm, 'mm', period);
  add('heavy', 'Heavy-rain days a year (very wet days), average', f.heavy_rain_days, 'days', period);
  add('wetness', 'Topsoil wetness at sowing in April–May (zero is bone dry, one is saturated)', f.sowing_soil_wetness, '', period);
  const best = results.reduce((a, b) => (b.overall > a.overall ? b : a));
  const now = results.find((r) => r.id === 'current');
  add('bestScore', `${best.label}: overall score`, score(best.overall), '', 'Seed Data rules');
  if (now && now !== best) add('nowScore', 'What you grow now: overall score', score(now.overall), '', 'Seed Data rules');
  const sorted = Object.entries(best.scores).sort((a, b) => b[1] - a[1]);
  add('strong', `${best.label}: ${GOALS[sorted[0][0]]} score`, score(sorted[0][1]), '', 'Seed Data rules');
  add('weak', `${best.label}: ${GOALS[sorted.at(-1)[0]]} score`, score(sorted.at(-1)[1]), '', 'Seed Data rules');
  return { facts, best, now, strongGoal: GOALS[sorted[0][0]], weakGoal: GOALS[sorted.at(-1)[0]] };
}

/** Rule-based chapter text with {fN} placeholders; chapter ids match CHAPTERS. */
export function templateStory(paddock, story) {
  const { facts, best, now } = story;
  const ph = (key) => { const x = facts.find((q) => q.key === key); return x ? `{${x.id}}` : null; };
  const short = paddock.name.replace(/^Paddock near /, '');
  const where = paddock.live ? 'This spot' : `${short} sits in the ${paddock.region}`;
  const out = {};
  out.place = ph('gs')
    ? `${where}. Over ${ph('period')}, NASA's records show about ${ph('gs')} of rain each year from April to October, the months that grow a winter crop.`
    : `${where}. No climate data has been loaded for it yet.`;
  out.seasons = ph('dryYear')
    ? `No two seasons are alike here. The driest, ${ph('dryYear')}, brought only ${ph('dryMm')}; the wettest, ${ph('wetYear')}, brought ${ph('wetMm')}. Rain swings by about ${ph('cv')} from one year to the next, so a rotation has to cope with both.`
    : 'Year-by-year rain is not loaded for this paddock yet.';
  out.frost = ph('frost')
    ? `Cold snaps matter most in August to October, when crops flower. This paddock averages ${ph('frost')} of frost in those months${ph('frostYear') ? `, and ${ph('frostYear')} was the worst with ${ph('frostMax')}` : ''}. In October and November, while grain fills, it averages ${ph('heat')} of very hot weather.`
    : 'Frost and heat records are not loaded for this paddock yet.';
  const prof = paddock.ndvi_profile || [];
  const okProf = prof.map((v, i) => [v, i]).filter(([v]) => has(v));
  const low = okProf.length ? MONTH_NAMES[okProf.reduce((a, b) => (b[0] < a[0] ? b : a))[1]] : null;
  out.cover = ph('bare')
    ? `Satellites check how green the paddock is every sixteen days. On average it looks bare for about ${ph('bare')} a year, and it is least green around ${low}. Bare soil can blow or wash away, so rotations that keep it covered protect it.`
    : `Satellite greenness has not been loaded for this ${paddock.live ? 'spot' : 'paddock'} yet, so we cannot say how long the ground sits bare.`;
  out.rotation = now && now !== best
    ? `With the goals you have set, ${best.label} comes out on top at ${ph('bestScore')} out of five, against ${ph('nowScore')} for what you grow now. Its strongest point is ${story.strongGoal} (${ph('strong')}); its weakest is ${story.weakGoal} (${ph('weak')}).`
    : `With the goals you have set, what you grow now still comes out on top at ${ph('bestScore')} out of five. Its strongest point is ${story.strongGoal} (${ph('strong')}); its weakest is ${story.weakGoal} (${ph('weak')}).`;
  return out;
}

/** Year-by-year bars; the highlighted years get the accent colour and their value printed. */
export function yearBars(years, values, { unit = '', mark = [], label = '' } = {}) {
  if (!years?.length || !values?.length) return '<p class="muted">No data</p>';
  const w = 340, h = 150, padL = 6, padB = 20, top = 18;
  const max = Math.max(...values.filter(has), 1);
  const bw = (w - padL * 2) / years.length;
  const desc = `${label}. ${years.map((y, i) => `${y}: ${values[i]}${unit ? ` ${unit}` : ''}`).join('; ')}.`;
  return `<svg class="chart year-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${desc}">
    ${years.map((y, i) => {
      const v = values[i], bh = has(v) ? ((h - padB - top) * v) / max : 0, x = padL + i * bw + 3, yy = h - padB - bh, on = mark.includes(i);
      return `<g class="yb ${on ? 'mark' : ''}" style="--i:${i}"><rect x="${x}" y="${yy}" width="${bw - 6}" height="${bh}" rx="3"/>
        ${on ? `<text class="val" x="${x + (bw - 6) / 2}" y="${yy - 5}" text-anchor="middle">${v}</text>` : ''}
        <text x="${x + (bw - 6) / 2}" y="${h - 5}" text-anchor="middle">${y}</text></g>`;
    }).join('')}</svg>`;
}

// ---------- Two paddocks side by side ----------
export const COMPARE_CHAPTERS = [
  { id: 'rain', title: 'Rain' },
  { id: 'climate', title: 'Frost and heat' },
  { id: 'rotations', title: 'Best rotation in each place' },
];
const shortName = (p) => (p.live ? 'your chosen spot' : p.name.replace(/^Paddock near /, ''));

/** Facts for comparing paddock a with paddock b (results scored with the same goals). */
export function compareFacts(a, b, resultsA, resultsB) {
  const facts = [];
  const add = (key, label, value, unit, source) => {
    if (!has(value)) return;
    facts.push({ id: `f${facts.length + 1}`, key, label, value, unit, source });
  };
  const bestOf = (rs) => rs.reduce((x, y) => (y.overall > x.overall ? y : x));
  [['a', a, resultsA], ['b', b, resultsB]].forEach(([k, p, rs]) => {
    const f = p.features || {}, n = shortName(p), src = f.years ? `NASA POWER ${f.years}` : 'NASA POWER';
    add(`${k}Gs`, `${n}: growing-season rain, average`, f.gs_rain_mm, 'mm', src);
    add(`${k}Min`, `${n}: growing-season rain, driest year`, f.gs_rain_min_mm, 'mm', src);
    add(`${k}Cv`, `${n}: rain variation from year to year`, f.gs_rain_cv_pct, '%', src);
    add(`${k}Frost`, `${n}: frost days in Aug–Oct, average`, f.frost_days_aug_oct, 'days', src);
    add(`${k}Heat`, `${n}: very hot days in Oct–Nov, average`, f.heat_days_oct_nov, 'days', src);
    const best = bestOf(rs);
    add(`${k}Best`, `${n}: ${best.label} overall score`, score(best.overall), '', 'Seed Data rules');
  });
  return { facts, bestA: bestOf(resultsA), bestB: bestOf(resultsB), nameA: shortName(a), nameB: shortName(b) };
}

/** Rule-based comparison with {fN} placeholders; ids match COMPARE_CHAPTERS. */
export function templateCompare(a, b, cmp) {
  const { facts, bestA, bestB, nameA, nameB } = cmp;
  const v = (key) => facts.find((q) => q.key === key)?.value;
  const ph = (key) => { const x = facts.find((q) => q.key === key); return x ? `{${x.id}}` : null; };
  const out = {};
  if (ph('aGs') && ph('bGs')) {
    const steady = v('aCv') <= v('bCv') ? nameA : nameB;
    out.rain = `${nameA} gets about ${ph('aGs')} of rain in an average growing season, against ${ph('bGs')} at ${nameB}. ${steady} is the steadier of the two: rain swings by about ${ph('aCv')} from year to year at ${nameA} and ${ph('bCv')} at ${nameB}. In the driest season, ${nameA} got ${ph('aMin')} and ${nameB} ${ph('bMin')}.`;
  } else out.rain = 'Rain records are not loaded for both places yet.';
  if (ph('aFrost') && ph('bFrost')) {
    const frosty = v('aFrost') >= v('bFrost') ? nameA : nameB, hot = v('aHeat') >= v('bHeat') ? nameA : nameB;
    out.climate = `At flowering, ${nameA} averages ${ph('aFrost')} of frost and ${nameB} ${ph('bFrost')}. At grain fill, ${nameA} sees ${ph('aHeat')} of very hot weather and ${nameB} ${ph('bHeat')}. ${frosty === hot ? `${frosty} carries more of both risks.` : `${frosty} carries more frost risk; ${hot} more heat risk.`}`;
  } else out.climate = 'Frost and heat records are not loaded for both places yet.';
  out.rotations = bestA.id === bestB.id
    ? `With your goals, ${bestA.label} comes out on top in both places: ${ph('aBest')} out of five at ${nameA} and ${ph('bBest')} at ${nameB}. The same idea travels, but the risks to check differ.`
    : `With your goals, the best fit at ${nameA} is ${bestA.label} (${ph('aBest')} out of five), while at ${nameB} it is ${bestB.label} (${ph('bBest')}). Different places, different answers: the weather points each farm to its own rotation.`;
  return out;
}

// ---------- Ask about this paddock (rule-based fallback) ----------
const TOPICS = [
  { words: /\b(rain|rainfall|wet|dry|drought|water|moisture deficit)/i, keys: ['gs', 'annual', 'dryYear', 'dryMm', 'wetYear', 'wetMm', 'cv'] },
  { words: /\b(frost|cold|freez)/i, keys: ['frost', 'frostYear', 'frostMax'] },
  { words: /\b(heat|hot|temperature|warm)/i, keys: ['heat'] },
  { words: /\b(bare|green|ndvi|cover|erosion|ground)/i, keys: ['bare'] },
  { words: /\b(sow|sowing|soil|plant(ing)?)\b/i, keys: ['wetness'] },
  { words: /\b(storm|heavy|flood|downpour)/i, keys: ['heavy'] },
  { words: /\b(best|rotation|grow|crop|score|recommend|should|option|suit)/i, keys: ['bestScore', 'nowScore', 'strong', 'weak'] },
];

/** Picks the facts a question is about. Returns [] when the facts can't answer it. */
export function factsForQuestion(question, facts) {
  const keys = new Set(TOPICS.filter((t) => t.words.test(question)).flatMap((t) => t.keys));
  return facts.filter((f) => keys.has(f.key));
}

/** A plain answer with {fN} placeholders, built only from the matched facts. */
export function templateAnswer(question, facts) {
  const hits = factsForQuestion(question, facts);
  if (!hits.length) return null;
  return hits.map((f) => `${f.label}: {${f.id}}.`).join(' ');
}

// ---------- Voice-over script ----------
/** Plain text for reading aloud or pasting into a video editor. */
export function voiceScript(title, chapters, texts) {
  return [title, ...chapters.map((c, i) => `${c.title}. ${texts[i] || ''}`)].join('\n\n');
}

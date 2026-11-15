// Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
// Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, scoreRotation, overall, gapsFor } from '../scoring.js';
import { factsFor, templateExplanation, verifyAndFill } from '../explain.js';

const cropsDoc = JSON.parse(readFileSync(new URL('../data/crops.json', import.meta.url)));
const features = {
  years: '2016–2025', frost_days_aug_oct: 8, heat_days_oct_nov: 1, gs_rain_mm: 290, gs_rain_min_mm: 120,
  gs_rain_cv_pct: 35, heavy_rain_days: 0.6, bare_months_per_year: 3.5, ndvi_years: '2016–2025',
};
const paddock = { id: 'p', name: 'Test paddock', features, current_rotation: ['wheat', 'canola', 'wheat', 'wheat'] };
const equal = { water: 1, soil: 1, risk: 1, income: 1 };

test('scores stay between 0 and 5', () => {
  for (const r of evaluate(paddock, cropsDoc, equal)) {
    for (const v of Object.values(r.scores)) assert.ok(v >= 0 && v <= 5, `${r.id} ${v}`);
  }
});

test('pasture phase builds soil most; current rotation least', () => {
  const [cur, leg, pas] = evaluate(paddock, cropsDoc, equal);
  assert.ok(pas.scores.soil > leg.scores.soil && leg.scores.soil > cur.scores.soil);
});

test('back-to-back cereals add a disease penalty and a risk note', () => {
  const r = scoreRotation(['wheat', 'canola', 'wheat', 'wheat'], cropsDoc.crops, features);
  assert.equal(r.traits.cerealPairs, 2);
  assert.ok(r.penalties.disease > 0);
});

test('pasture income depends on running livestock', () => {
  const rot = ['wheat', 'canola', 'lucerne', 'lucerne'];
  const without = scoreRotation(rot, cropsDoc.crops, features, { hasLivestock: false });
  const withStock = scoreRotation(rot, cropsDoc.crops, features, { hasLivestock: true });
  assert.ok(withStock.scores.income > without.scores.income);
});

test('slider weights change the overall score', () => {
  const s = { water: 5, soil: 1, risk: 3, income: 3 };
  assert.equal(overall(s, { water: 5, soil: 0, risk: 0, income: 0 }), 5);
  assert.equal(overall(s, { water: 0, soil: 0, risk: 0, income: 0 }), 3);
});

test('missing data shows up as gaps', () => {
  const gaps = gapsFor({});
  assert.ok(gaps.some((g) => g.includes('No climate data')));
});

test('rule-based explanation passes the number check', () => {
  for (const r of evaluate(paddock, cropsDoc, equal)) {
    const facts = factsFor(r, paddock);
    const out = verifyAndFill(templateExplanation(r, paddock, facts), facts);
    assert.ok(out.ok, out.errors.join(', '));
    assert.ok(!out.text.includes('{f'));
  }
});

test('the checker rejects invented numbers and promises', () => {
  const facts = [{ id: 'f1', label: 'x', value: 3.2, unit: '/5', source: 'test' }];
  assert.equal(verifyAndFill('Scores {f1}.', facts).ok, true);
  assert.equal(verifyAndFill('Scores {f1} and yields rise 20%.', facts).ok, false);
  assert.equal(verifyAndFill('Scores {f9}.', facts).ok, false);
  assert.equal(verifyAndFill('This will increase profit {f1}.', facts).ok, false);
});

// ---------- story, live location, glossary ----------
import { storyFacts, templateStory, CHAPTERS } from '../story.js';
import { summarisePower } from '../live.js';
import { GLOSSARY, define } from '../glossary.js';

const storyPaddock = { ...paddock, region: 'Riverina, NSW', yearly: { year: [2018, 2019, 2020], gs_rain_mm: [122, 160, 384], frost_days: [8, 10, 8], heat_days: [6, 16, 9] }, ndvi_profile: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2] };

test('every story chapter passes the number check', () => {
  const results = evaluate(storyPaddock, cropsDoc, equal);
  const story = storyFacts(storyPaddock, results);
  const text = templateStory(storyPaddock, story);
  for (const c of CHAPTERS) {
    const out = verifyAndFill(text[c.id], story.facts);
    assert.ok(out.ok, `${c.id}: ${out.errors.join(', ')}`);
    assert.ok(!out.text.includes('{f'), c.id);
  }
  assert.ok(verifyAndFill(text.seasons, story.facts).text.includes('2018'));
});

test('live NASA POWER summary matches the pipeline rules', () => {
  const days = [];
  for (let d = new Date(Date.UTC(2020, 0, 1)); d <= new Date(Date.UTC(2021, 11, 31)); d.setUTCDate(d.getUTCDate() + 1)) days.push(new Date(d));
  const key = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const series = (f) => Object.fromEntries(days.map((d) => [key(d), f(d)]));
  const json = { properties: { parameter: {
    T2M_MIN: series((d) => (d.getUTCMonth() === 8 && d.getUTCDate() <= 3 ? 0.5 : 8)),
    T2M_MAX: series((d) => (d.getUTCMonth() === 10 && d.getUTCDate() <= 2 ? 35 : 20)),
    PRECTOTCORR: series((d) => (d.getUTCMonth() === 5 && d.getUTCDate() === 15 ? 30 : 1)),
    GWETTOP: series(() => 0.4),
  } } };
  const s = summarisePower(json);
  assert.equal(s.features.frost_days_aug_oct, 3);
  assert.equal(s.features.heat_days_oct_nov, 2);
  assert.equal(s.features.heavy_rain_days, 1);
  assert.deepEqual(s.yearly.year, [2020, 2021]);
  assert.equal(s.monthly.rain_mm.length, 12);
});

test('glossary has a plain meaning for every term key used on the page', () => {
  for (const k of ['gs', 'cv', 'frost', 'grainfill', 'heavy', 'wetness', 'ndvi', 'srtm', 'smap', 'oc', 'legume', 'pasture', 'erosion', 'crownrot']) {
    assert.ok(define(k).length > 20, k);
  }
  assert.ok(GLOSSARY.length >= 20);
});

import { compareFacts, templateCompare, COMPARE_CHAPTERS, templateAnswer } from '../story.js';
const data = JSON.parse(readFileSync(new URL('../data/paddocks.json', import.meta.url), 'utf8'));
const crops = cropsDoc;

test('every two-paddock comparison passes the number check', () => {
  const W = { water: 3, soil: 3, risk: 3, income: 3 };
  for (const a of data.paddocks) for (const b of data.paddocks) {
    if (a === b) continue;
    const cmp = compareFacts(a, b, evaluate(a, crops, W), evaluate(b, crops, W));
    const text = templateCompare(a, b, cmp);
    for (const ch of COMPARE_CHAPTERS) {
      const r = verifyAndFill(text[ch.id], cmp.facts);
      assert.ok(r.ok, `${a.id} vs ${b.id} ${ch.id}: ${r.errors}`);
    }
  }
});

test('questions are answered only from facts, or not at all', () => {
  const p = data.paddocks[0];
  const story = storyFacts(p, evaluate(p, crops, { water: 3, soil: 3, risk: 3, income: 3 }));
  for (const q of ['How reliable is the rain?', 'How bad is frost at flowering?', 'Is heat a problem?', 'Which rotation suits my goals?', 'How wet is the soil at sowing?']) {
    const t = templateAnswer(q, story.facts);
    assert.ok(t, q);
    assert.ok(verifyAndFill(t, story.facts).ok, q);
  }
  assert.equal(templateAnswer('What will wheat sell for next year?', story.facts), null);
});

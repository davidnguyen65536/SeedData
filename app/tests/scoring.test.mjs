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

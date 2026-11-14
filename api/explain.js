// Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
// Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

// Optional AI wording for "Why this score?" (Vercel serverless function).
//
// The model only writes sentences with {fN} placeholders; it never supplies
// numbers. The browser fills the placeholders from the facts and rejects any
// text with other digits (see app/explain.js verifyAndFill). Without
// ANTHROPIC_API_KEY this returns 501 and the app uses its rule-based wording.
//
// Environment (set in the hosting dashboard, never in the repo):
//   ANTHROPIC_API_KEY   required to enable
//   MODEL               optional, default claude-sonnet-5-5
//   ALLOWED_ORIGIN      optional, e.g. https://seeddata.vercel.app

import { verifyAndFill } from '../app/explain.js';

const MAX_FACTS = 30;

export default async function handler(req, res) {
  const origin = process.env.ALLOWED_ORIGIN;
  if (origin && req.headers.origin && req.headers.origin !== origin) {
    return res.status(403).json({ error: 'origin not allowed' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(501).json({ error: 'AI wording not configured' });

  const { strategy, paddock, facts } = req.body || {};
  if (!Array.isArray(facts) || facts.length === 0 || facts.length > MAX_FACTS) {
    return res.status(400).json({ error: 'facts must be a non-empty array' });
  }
  const clean = facts.map((f) => ({
    id: String(f.id).slice(0, 4), label: String(f.label).slice(0, 120),
    value: f.value, unit: String(f.unit ?? '').slice(0, 20), source: String(f.source).slice(0, 80),
  }));

  const model = process.env.MODEL || 'claude-sonnet-5-5';
  const prompt = [
    `Explain to an Australian grain farmer, in 3 to 4 short plain-English sentences, how the "${String(strategy).slice(0, 60)}" crop rotation scored on "${String(paddock).slice(0, 60)}".`,
    'Use ONLY these facts. Refer to a fact\'s value ONLY by writing its placeholder, e.g. {f6}. Do not write any digits yourself.',
    'Do not promise outcomes or predict yields. Say it is indicative and end by suggesting they check with their local agronomist.',
    'Facts (JSON):',
    JSON.stringify(clean),
  ].join('\n');

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!resp.ok) return res.status(502).json({ error: `model call failed (${resp.status})` });
    const body = await resp.json();
    const template = (body.content || []).map((c) => c.text || '').join('').trim();
    const check = verifyAndFill(template, clean);
    if (!check.ok) return res.status(422).json({ error: 'failed checks', errors: check.errors });
    return res.status(200).json({ template, model });
  } catch (err) {
    return res.status(502).json({ error: 'model call failed' });
  }
}

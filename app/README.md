# Web app

Static site: no build step. Serve this folder (`python -m http.server 8000 -d app` from the repo root) and open http://localhost:8000.

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | Page, layout, map (Leaflet) and interaction |
| `scoring.js` | Scoring rules (see `docs/methodology.md`) |
| `explain.js` | Numbered facts, rule-based explanation, number checker |
| `data/paddocks.json` | Built by `pipelines/build_features.py` |
| `data/crops.json` | Crop traits (draft) and the three strategies |
| `tests/` | `npm test` from the repo root |

"Why this score?" calls `/api/explain` when the app is hosted with that function and an API key; otherwise it uses the rule-based wording.

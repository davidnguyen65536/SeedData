# Web app

Static site: no build step. Serve this folder (`python -m http.server 8000 -d app` from the repo root) and open http://localhost:8000 for the front page, or http://localhost:8000/dashboard.html for the tool.

| File | Purpose |
| --- | --- |
| `index.html`, `landing/` | Front page: the animated farm diorama (see `landing/README.md`) |
| `dashboard.html`, `styles.css`, `app.js` | The tool at `/dashboard`: page, layout, map (Leaflet) and interaction |
| `tabs.js` | Glass tabs (Options, Paddock, Data, How it works): one panel at a time, `?tab=` links, the paddock label, the Data tab's fact table and the risk links to the evidence |
| `sky.js` | The dashboard's animated sky: blue tiles, drifting text-character clouds, and a wind trail that follows the pointer (2D canvas, no libraries; `?debug` exposes `window.__sky`) |
| `scoring.js` | Scoring rules (see `docs/methodology.md`) |
| `story.js` | The Story tab: five chapters built from numbered facts, year-by-year charts |
| `live.js` | Any spot on the map: fetches NASA POWER live and summarises it with the pipeline's rules |
| `glossary.js` | Plain meanings for farming and satellite words (Words we use, dotted terms) |
| `explain.js` | Numbered facts, rule-based explanation, number checker |
| `data/paddocks.json` | Built by `pipelines/build_features.py` |
| `data/crops.json` | Crop traits (draft) and the three strategies |
| `tests/` | `npm test` from the repo root |

"Why this score?" and the Story tab's "Write it with AI" call `/api/explain` when the app is hosted with that function and an API key; otherwise it uses the rule-based wording.

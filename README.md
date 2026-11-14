# SeedData

**Compare crop rotations for your paddock, backed by NASA Earth observations.**
NASA Space Apps Challenge 2026 · Field Shift: Adapting Farms with NASA Data

SeedData helps Australian grain farmers and their agronomists explore crop rotations that could improve soil health and cope with changing weather. Pick a paddock, set what matters (saving water, improving soil, reducing risk, extra income) and compare three rotations, including the current one. Each option shows its scores, the risks that need local review, what the data can't tell you, and an explanation where every number is traced to its source.

> SeedData supports farmer judgment and local agronomic advice; it does not replace them. Scores are indicative.

**Live demo:** _add the URL after deploying_ · **Pilot:** four dryland paddocks in the Riverina, NSW, Australia

## What it does

1. **Map:** pick a paddock.
2. **Priorities:** four sliders, plus "I run sheep or cattle" and your current rotation.
3. **Compare:** current rotation, legume break (field pea) and pasture phase (lucerne), each scored 0–5 per priority and overall.
4. **Evidence:** ten years of NASA data per paddock: frost days at flowering, hot days at grain fill, growing-season rain and its variability, heavy-rain days, soil wetness at sowing, and months the paddock is bare (MODIS NDVI).
5. **Why?** A plain-English explanation built from numbered facts. An optional AI model can write the wording, but a checker rejects any number that isn't one of the facts.
6. **Honest gaps:** every paddock lists what the data can't tell you.

## How it works

```
NASA POWER (daily weather, soil wetness) ─┐
MODIS MOD13Q1 NDVI (250 m) ───────────────┤
optional: SMAP, SRTM (AppEEARS), SILO ────┼─> pipelines/ ─> app/data/paddocks.json ─> app/ (static web app)
optional: soil values (Soil and Landscape │                                              ├─ scoring.js  (published rules)
          Grid of Australia)  ────────────┘                                              └─ explain.js  (facts + number checker)
                                                                                          api/explain.js (optional AI wording)
```

- Scoring rules and thresholds: [docs/methodology.md](docs/methodology.md)
- Every dataset, how it is used, and why some challenge datasets (US-only) are not: [docs/data-sources.md](docs/data-sources.md)
- Use of AI tools: [docs/si-disclosure.md](docs/si-disclosure.md)

## Run it

Requirements: Python 3.10+, Node 18+ (only for tests).

```bash
# 1. Web app with the committed data
python -m http.server 8000 -d app
# open http://localhost:8000

# 2. Refresh the data (NASA POWER + MODIS, no login needed)
cd pipelines
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python run_all.py               # add --appeears and/or --silo after filling .env

# 3. Tests
python -m pytest -q             # pipelines (from the pipelines folder)
npm test                        # scoring and explanation checker (from the repo root)
```

Add or change paddocks in `data/paddocks.geojson` (id, name, current rotation, optional soil values), then run `python run_all.py`.

## Repository layout

| Path                    | Contents                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `app/`                  | Static web app: `index.html`, `app.js`, `scoring.js`, `explain.js`, `data/`         |
| `api/explain.js`        | Optional serverless function for AI wording (needs `ANTHROPIC_API_KEY` in the host) |
| `pipelines/`            | Python data pipelines and their tests                                               |
| `data/paddocks.geojson` | Pilot paddocks and their current rotation                                           |
| `data/processed/`       | Small monthly tables produced by the pipelines                                      |
| `docs/`                 | Methodology, data sources, AI disclosure                                            |

## Deploy

The app is static, so any static host works (GitHub Pages: serve the `app/` folder). To enable AI wording, deploy on Vercel: import the repository, keep the root folder, and add `ANTHROPIC_API_KEY` under Environment Variables. `vercel.json` serves `app/` and `api/`.

## Team

| Name               | Role | Contributed |
| ------------------ | ---- | ----------- |
| David Nguyen       |      |             |
| Johanna Josodipuro |      |             |
| Shaf Tabeeb        |      |             |
| Andre Baruah       |      |             |

## Licence

Copyright © 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah). All rights reserved. The code is public so judges and the community can review and run it; see [LICENSE](LICENSE) for terms. Third-party components keep their own licences.

## Acknowledgements

Data from NASA POWER (NASA Langley Research Center), MODIS MOD13Q1 (NASA LP DAAC, served by ORNL DAAC), and optionally SMAP and SRTM (NASA, via AppEEARS), SILO (Queensland Government) and the Soil and Landscape Grid of Australia (CSIRO/TERN). Map data © OpenStreetMap contributors. This project is not affiliated with or endorsed by NASA.

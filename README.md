# Seed Data

**Compare crop rotations for your paddock, backed by NASA Earth observations.**
NASA Space Apps Challenge 2026 · Field Shift: Adapting Farms with NASA Data

Seed Data helps Australian grain farmers and their agronomists explore crop rotations that could improve soil health and cope with changing weather. Pick a paddock, set what matters (saving water, improving soil, reducing risk, extra income) and compare three rotations, including the current one. Each option shows its scores, the risks that need local review, what the data can't tell you, and an explanation where every number is traced to its source.

> Seed Data supports farmer judgment and local agronomic advice; it does not replace them. Scores are indicative.

| | |
| --- | --- |
| **Live app** | https://seed-data-nasa.vercel.app |
| **Slide deck (PDF)** | [SeedData_slides.pdf](app/deck/SeedData_slides.pdf): seven slides, to read or print |
| **Interactive deck** | https://seed-data-nasa.vercel.app/deck: the same story as a short game to click through ([see below](#presentation)) |
| **Demo video (30 s)** | https://youtu.be/kVB4XNWzDsM |
| **Feature walkthrough (2 min)** | https://youtu.be/nLcaGttTr-U: every feature, start to finish |

**Pilot:** twelve dryland paddocks across Australia's grain belt (NSW, VIC, SA, WA, QLD), plus any spot you tap on the map

## What it does

The dashboard opens with one question: **the seasons are shifting, so which crop rotation suits your paddock now?** Its five tabs answer it in order, and each tab ends with a link to the next.

1. **Paddock (where):** pick one of twelve pilot paddocks across NSW, VIC, SA, WA and QLD, or tap anywhere on the map to analyse that spot with ten years of NASA POWER data fetched live. Key facts and monthly rain and greenness charts.
2. **Story (what happened):** the paddock's decade in five chapters (rain, frost and heat, bare ground, what it means for your rotation) with year-by-year charts.
   - **AI narrator (optional):** rewrites the story in the voice you choose (farmer, general public, judges, storyteller).
   - **Listen:** reads the story aloud. **Copy voice-over script** copies it for the demo video.
   - **Compare with another paddock:** two places side by side, such as Horsham vs Dalby.
   - **Ask about this paddock:** questions answered only from its facts. If the facts can't answer, it says so.
3. **Options (what to do):** set how much each goal matters (saving water, improving soil, reducing risk, extra income), whether you run livestock, and what you grow now. Three rotations are ranked: what you grow now, a legume break (field pea) and a pasture phase (lucerne). Each is scored 0–5 per goal and overall, with things to check locally. "Why this score?" explains each one in plain English.
4. **Data (the evidence):**
   - Headline figures: years of record, measures, sources loaded, things to check.
   - Every number grouped by where it comes from (NASA POWER, MODIS and so on), with its period.
   - What the data can't tell you.
   - A card for each data source showing whether it is loaded, fetched live, waiting for the next pipeline run, or optional.
5. **How it works (the method):** the six steps from data to answer, who we are (Team Seed Data), and a plain-language glossary. Dotted terms elsewhere show their meaning on hover or tap.

Every number in an explanation, story, comparison or answer comes from a numbered fact. An AI model can write the wording, but a checker rejects any number that isn't one of the facts.

## Presentation

Two versions of the same deck, both in [`app/deck/`](app/deck/):

- **[Slide deck (PDF)](app/deck/SeedData_slides.pdf):** seven slides: the title, choosing your farmer, the challenge, the toolkit, rotations ranked for your goals, where Seed Data goes next, and the team. Good for reading, printing or sharing.
- **[Interactive deck](https://seed-data-nasa.vercel.app/deck):** the pitch as a short game. Choose your farmer, accept the quest (the challenge and its hazards), then open each tool (Story, Compare, Ask, Goals and Options) to watch it working in the app, and finish on where Seed Data goes next. It runs in any browser and is best on a desktop. Use the arrow keys or Page Up / Page Down to move between slides, **▶ Present** for full screen, and Home to go back to the start.

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
| `app/`                  | Static web app: `index.html` (front page), `dashboard.html`, `app.js`, `scoring.js`, `explain.js`, `data/` |
| `api/explain.js`        | Optional serverless function for AI wording (needs `ANTHROPIC_API_KEY` in the host) |
| `pipelines/`            | Python data pipelines and their tests                                               |
| `data/paddocks.geojson` | Pilot paddocks and their current rotation                                           |
| `data/processed/`       | Small monthly tables produced by the pipelines                                      |
| `docs/`                 | Methodology, data sources, AI disclosure                                            |

## Deploy

The app is static, so any static host works (GitHub Pages: serve the `app/` folder). To enable AI wording, deploy on Vercel: import the repository, keep the root folder, and add `ANTHROPIC_API_KEY` under Environment Variables. `vercel.json` serves `app/` and `api/`.

## Team

Built in 48 hours by four people at the NASA Space Apps Challenge 2026 (Sydney). Names are in alphabetical order by surname.

| Name | Role | Contributed |
| --- | --- | --- |
| Andre Baruah | Data Explorer | NASA datasets, data pipeline, research |
| Johanna Josodipuro | Chief Storyteller and Pitch Magician | Turned ten years of NASA data into a quest worth following: story, marketing, demo videos, slides and the interactive deck |
| David Nguyen | Full-Stack Farmer | Full stack, AI narrator, data pipelines, deployment |
| Shaf Tabeeb | UX Alchemist | Design, front end, UX |

## Licence

Copyright © 2026 Team Seed Data (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah). All rights reserved. The code is public so judges and the community can review and run it; see [LICENSE](LICENSE) for terms. Third-party components keep their own licences.

## Acknowledgements

Data from NASA POWER (NASA Langley Research Center), MODIS MOD13Q1 (NASA LP DAAC, served by ORNL DAAC), and optionally SMAP and SRTM (NASA, via AppEEARS), SILO (Queensland Government) and the Soil and Landscape Grid of Australia (CSIRO/TERN). Map data © OpenStreetMap contributors. This project is not affiliated with or endorsed by NASA.

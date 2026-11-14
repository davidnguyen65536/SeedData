# Changelog

Built during NASA Space Apps Challenge 2026, 14–15 November (Sydney time).

## 2026-11-14

- Pipelines: NASA POWER daily → monthly tables; MODIS NDVI via ORNL DAAC; optional SMAP and SRTM via AppEEARS; optional SILO rain check; feature builder; offline tests.
- Four pilot paddocks in the Riverina, NSW, with ten years (2016–2025) of NASA POWER and MODIS data.
- Web app: map, priority sliders, editable current rotation, three strategy cards with scores, risks and data gaps, monthly rain and NDVI charts.
- Transparent scoring rules (`app/scoring.js`, `docs/methodology.md`) with tests.
- Explanations built from numbered facts, with a checker that rejects numbers not taken from the facts; optional AI wording endpoint (`api/explain.js`).
- Docs: methodology, data sources, use of AI.
- Copyright headers (Team SeedData) on all source files; LICENSE; allow-list .gitignore.

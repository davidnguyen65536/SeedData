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

## 2026-11-15

- Front page: a live farm diorama drawn in text characters (`app/landing/`). The tool moved from `/` to `/dashboard`.
- Front page opens instantly: an opening still shows at once, ground colours are baked at build time, and the live scene fades in about a second later. Pond has wind ripples, white wave crests and sun glints.
- Front page: the farm fills three quarters of the screen beside a torn-paper panel (EB Garamond headline, Poppins text) with a seedling mark that blooms on load, a seedling favicon, and a fixed-size button that turns green and shows "Your best season yet" on hover or tap, then opens the dashboard behind a curtain spreading from the press. Fixed an occasional flicker in the pond, and the scene now renders at a fraction of screen resolution so it runs smoothly on phones. The front page writes the name as "Seed Data"; the dashboard itself is unchanged apart from moving to /dashboard. Phones see a wider view that includes the tractor, and the farmer and dog now turn round at the end of the track instead of jumping back.

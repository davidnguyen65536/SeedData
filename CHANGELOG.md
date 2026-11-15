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

- Twelve pilot paddocks across NSW, VIC, SA, WA and QLD (was four in the Riverina), with year-by-year growing-season rain, frost and heat series. MODIS greenness for the eight new paddocks comes from the next pipeline run.
- Tap anywhere on the map to analyse that spot with live NASA POWER data (`app/live.js`).
- Story tab: the paddock's decade in five chapters with year-by-year charts; optional AI narrator with four voices, every number checked, one automatic retry on the server.
- Words we use: plain-language glossary in How it works, and dotted terms that show their meaning on hover or tap.
- Map credit no longer shows Leaflet's flag icon.
- Dashboard opens with the question ("Which crop rotation suits your paddock now?"). The tabs follow the story in order: Paddock, Story, Options, Data, How it works. They are numbered, and each tab ends with a link to the next. The Seed Data mark sits on the left of the tab bar and the empty sky band is smaller.
- How it works tab: "Who we are" panel with Team SeedData (Andre Baruah, Johanna Josodipuro, David Nguyen, Shaf Tabeeb, in alphabetical order by surname); team names in the page footer.
- AI narrator fixes: answers are no longer cut short (higher token limit, and a cut-off or wrong-length answer is retried once); a unit written after a number is not doubled ("256 mm mm"); a broken placeholder fails the check.
- Live site moved to https://seed-data-nasa.vercel.app.
- Data tab redesigned: headline figures, facts grouped by source with their period, highlighted things to check, and a card for each data source showing its status.
- Story tab: "Listen" reads the story aloud (browser voice, Australian English where available) and "Copy voice-over script" copies it for the demo video.
- Compare with another paddock: rain, frost, heat and the best rotation side by side, in plain words or written by the AI narrator.
- Ask about this paddock: questions answered only from the paddock's facts (AI when switched on, fixed rules otherwise); says plainly when the facts can't answer.
- Dashboard: each paddock has its own colour (menu, list, map and page accent), and switching paddock shows what changed in the options, or says plainly that nothing did. The Data tab uses two columns and How it works shows its four steps side by side.
- Dashboard: a paddock menu under the title on every tab, and a "Choose a paddock" list beside the map. Charts come alive (rain bars rise, the greenness line draws itself, hover or Tab to a month to read it) and have written descriptions for screen readers; cards glide to their new rank and scores count to their new value when you change a goal. Plainer fact labels, a one-line note on how scores work, card rows aligned across options, glass tabs lined up with the dashboard edge. Screenshots of each feature in `docs/screenshots/`.
- Dashboard Options tab: priorities are now Off / Low / Medium / High choices with a one-line hint each (same 0–5 weights underneath) and a reset; the livestock box is a switch that says what it changes. Rotation cards are ranked best first, show the change against what you grow now, list the crops as numbered years, emphasise the goals you set High and dim the ones set Off, and fold the risks into "things to check locally". On phones the options come first and the settings follow, with an "Options updated" pill after each change.
- Dashboard: content split into four glass tabs (Options, Paddock, Data, How it works) in the top-right corner, a clear refracting glass lens over a frosted track, so it reads answer first, evidence second, method third; the chosen paddock shows on every tab, climate risks link to their data, and each tab has its own link (`?tab=`). Nothing was removed.
- Dashboard: an animated sky of blue tiles and text-character clouds across the top, with a wind trail that follows the pointer; the page now sits on a sheet with a soft cloudy top edge.
- Front page: a live farm diorama drawn in text characters (`app/landing/`). The tool moved from `/` to `/dashboard`.
- Front page opens instantly: an opening still shows at once, ground colours are baked at build time, and the live scene fades in about a second later. Pond has wind ripples, white wave crests and sun glints.
- Front page: the farm fills three quarters of the screen beside a torn-paper panel (EB Garamond headline, Poppins text) with a seedling mark that blooms on load, a seedling favicon, and a fixed-size button that turns green and shows "Your best season yet" on hover or tap, then opens the dashboard behind a curtain spreading from the press. Fixed an occasional flicker in the pond, and the scene now renders at a fraction of screen resolution so it runs smoothly on phones. The front page writes the name as "Seed Data"; the dashboard itself is unchanged apart from moving to /dashboard. Phones see a wider view that includes the tractor, and the farmer and dog now turn round at the end of the track instead of jumping back.
- Story charts: each chart has a bold title and a one-line note with its units; the highlighted bars and the wettest, driest, greenest and least-green months show their values; years are written in full; the "bare" label no longer sits on the greenness line. The paddock menu under the title is hidden on Paddock (the list is beside it) and How it works (nothing there depends on the paddock). "Compare ... with" fits on one line. Data sources not yet loaded are marked "Planned".
- Ask about this paddock: each answer shows a small chart that matches the question: growing-season rain as three gauges (driest, average, wettest), frost or hot days by year with the worst year labelled, greenness by month, or the rotations ranked for your goals.

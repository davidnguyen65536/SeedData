# Methodology

SeedData scores crop rotations with simple, published rules so every score can be explained and challenged. It is a decision-support prototype: it suggests what to look at more closely; it does not predict yields or replace local agronomic advice.

## 1. Paddock features

All features are averages over 2016–2025 unless stated. Code: `pipelines/power.py`, `pipelines/modis_ndvi.py`, `pipelines/build_features.py`.

| Feature | Definition | Source |
| --- | --- | --- |
| Growing-season rain | Sum of daily rain, April to October, averaged over years | NASA POWER `PRECTOTCORR` |
| Driest growing season | Lowest April–October total in the period | NASA POWER |
| Rain variation | Coefficient of variation of growing-season rain (standard deviation ÷ mean) | NASA POWER |
| Frost days, Aug–Oct | Days with minimum air temperature at 2 m ≤ 2 °C, August to October (flowering and early grain fill of winter crops in southern NSW) | NASA POWER `T2M_MIN` |
| Hot days, Oct–Nov | Days with maximum air temperature ≥ 32 °C, October to November (grain fill) | NASA POWER `T2M_MAX` |
| Heavy-rain days | Days with ≥ 25 mm of rain, per year | NASA POWER |
| Topsoil wetness at sowing | Mean of `GWETTOP` (0 = dry, 1 = saturated), April–May | NASA POWER (MERRA-2) |
| Bare months | 16-day composites with NDVI < 0.25, per year, converted to months | MODIS MOD13Q1 250 m via ORNL DAAC |
| Soil moisture at sowing (optional) | Mean surface soil moisture, April–May | SMAP L4 `SPL4SMGP.008` via AppEEARS |
| Slope (optional) | From SRTM elevation at the centre and 90 m north, south, east, west | SRTM `SRTMGL1_NC.003` via AppEEARS |
| Soil (optional) | Organic carbon, clay, available water capacity, typed in by hand | Soil and Landscape Grid of Australia |

The 2 °C screen-height threshold is a common proxy for frost at crop height, where it is usually colder. The 32 °C and 0.25 thresholds are starting points for review.

## 2. Crop traits

`app/data/crops.json` rates each crop from 1 (low) to 3 (high) for water use, frost sensitivity at flowering, heat sensitivity, and ground cover, and records whether it fixes nitrogen, is a cereal, is perennial, or needs livestock. **These are drafts from general southern-NSW agronomy and must be checked against the NSW DPI Winter Crop Variety Sowing Guide and GRDC GrowNotes.**

## 3. Scores (0 to 5)

Code: `app/scoring.js`. For a 4-year rotation, w̄, c̄, s̄f and s̄h are the mean water use, ground cover, frost sensitivity and heat sensitivity of its crops.

| Priority | Rule |
| --- | --- |
| Save water | 5 − 2(w̄ − 1), minus a further 0.5(w̄ − 1) when rain variation is over 30% |
| Improve soil | 1 + 0.6 × nitrogen-fixing years + 0.5 × perennial years + (c̄ − 1) |
| Reduce risk | 5 − frost − heat − erosion − disease, where frost = min(frost days ÷ 10, 1) × (s̄f − 1) × 1.5; heat = min(hot days ÷ 5, 1) × (s̄h − 1); erosion = min(heavy-rain days ÷ 3, 1) × (3 − c̄) ÷ 2 (scaled by slope when loaded); disease = 0.4 × number of times a cereal follows a cereal |
| Extra income | 2.5 + 0.5 × (number of different markets − 1), minus 0.75 per grazed year if the farm has no livestock |

Scores are clamped to 0–5. The overall score is the average weighted by the farmer's four sliders. When data is missing, a neutral middle value is used and the gap is listed.

## 4. Explanations

`app/explain.js` turns each result into numbered facts (value, unit, source). Explanations refer to facts by placeholder (`{f6}`). The checker rejects any text that contains a number not taken from a fact, refers to a fact that doesn't exist, or promises outcomes. With an AI key configured (`api/explain.js`), the model writes the wording; without one, fixed rules write it.

## 5. Known limits

- NASA POWER cells are about 0.5° × 0.625° (roughly 50 km), so nearby paddocks can share climate values. MODIS pixels are 250 m, so small paddocks mix with their neighbours.
- No crop price data: income is scored by market diversity only.
- Rules are not calibrated against yield or trial data.
- US-only datasets listed in the challenge (Web Soil Survey, SSURGO, CropScape, PRISM, NAIP, NLCD, OpenET, LANDFIRE, CoCoRaHS, NWIS, NASS, AMS) do not cover Australia; Australian equivalents are noted in `docs/data-sources.md`.

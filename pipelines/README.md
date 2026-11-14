# Pipelines

Each script reads `data/paddocks.geojson`, writes small monthly tables to `data/processed/`, and `build_features.py` turns them into `app/data/paddocks.json`, the web app's only data file. Full downloads go to `data/raw/` (git-ignored).

| Script | Source | Login | Output |
| --- | --- | --- | --- |
| `power.py` | NASA POWER daily weather and soil wetness | None | `power_monthly_<id>.csv` |
| `modis_ndvi.py` | MODIS MOD13Q1 NDVI via ORNL DAAC | None | `ndvi_<id>.csv` |
| `appeears.py` | SMAP L4 soil moisture, SRTM slope via NASA AppEEARS | Earthdata (`.env`) | `smap_<id>.csv`, `srtm.csv` |
| `silo.py` | SILO daily rain (ground check) | Email (`.env`) | `silo_monthly_<id>.csv` |
| `build_features.py` | Joins everything above | — | `app/data/paddocks.json` |
| `run_all.py` | Runs the lot | — | — |

```bash
pip install -r requirements.txt
python run_all.py                  # POWER + MODIS, then build
python run_all.py --appeears       # plus SMAP and SRTM
python run_all.py --skip-download  # rebuild app data only
python -m pytest -q                # offline tests
```

Missing sources don't stop the build: the app shows them as data gaps.

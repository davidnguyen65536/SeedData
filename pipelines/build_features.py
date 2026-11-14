# Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
# Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

"""Join the processed tables into app/data/paddocks.json, the web app's only data file.

Reads (whatever exists; missing sources become data gaps in the app):
    data/processed/power_monthly_<id>.csv   NASA POWER
    data/processed/ndvi_<id>.csv            MODIS MOD13Q1 NDVI
    data/processed/smap_<id>.csv            SMAP L4 (optional, appeears.py)
    data/processed/srtm.csv                 SRTM slope (optional, appeears.py)
    data/processed/silo_monthly_<id>.csv    SILO rain (optional, silo.py)
    data/paddocks.geojson                   paddocks, current rotation, soil values typed in by hand

Usage:
    python build_features.py
"""

from __future__ import annotations

import json
import math
import sys
from datetime import date

import pandas as pd

from common import APP_DATA_DIR, PROCESSED_DIR, load_paddocks

GROWING_SEASON = [4, 5, 6, 7, 8, 9, 10]
FROST_MONTHS = [8, 9, 10]   # flowering of winter crops in southern NSW
HEAT_MONTHS = [10, 11]      # grain fill
SOWING_MONTHS = [4, 5]
BARE_NDVI = 0.25            # below this a pixel is mostly bare soil or stubble
DAYS_PER_COMPOSITE = 16
DAYS_PER_MONTH = 30.44


def _num(x, nd=1):
    if x is None:
        return None
    try:
        if math.isnan(x):
            return None
    except TypeError:
        pass
    return round(float(x), nd)


def power_features(m: pd.DataFrame) -> tuple[dict, dict]:
    years = sorted(m["year"].unique())
    by_year = m.groupby("year")
    gs = m[m["month"].isin(GROWING_SEASON)].groupby("year")["rain_mm"].sum()
    feats = {
        "years": f"{years[0]}–{years[-1]}",
        "n_years": len(years),
        "annual_rain_mm": _num(by_year["rain_mm"].sum().mean(), 0),
        "gs_rain_mm": _num(gs.mean(), 0),
        "gs_rain_min_mm": _num(gs.min(), 0),
        "gs_rain_cv_pct": _num(100 * gs.std() / gs.mean(), 0),
        "frost_days_aug_oct": _num(m[m["month"].isin(FROST_MONTHS)].groupby("year")["frost_days"].sum().mean()),
        "heat_days_oct_nov": _num(m[m["month"].isin(HEAT_MONTHS)].groupby("year")["heat_days"].sum().mean()),
        "heavy_rain_days": _num(by_year["heavy_rain_days"].sum().mean()),
        "sowing_soil_wetness": _num(m[m["month"].isin(SOWING_MONTHS)]["gwettop"].mean(), 2),
    }
    clim = m.groupby("month").mean(numeric_only=True)
    monthly = {
        "rain_mm": [_num(clim.loc[i, "rain_mm"], 0) for i in range(1, 13)],
        "frost_days": [_num(clim.loc[i, "frost_days"]) for i in range(1, 13)],
        "heat_days": [_num(clim.loc[i, "heat_days"]) for i in range(1, 13)],
        "soil_wetness": [_num(clim.loc[i, "gwettop"], 2) for i in range(1, 13)],
    }
    return feats, monthly


def ndvi_features(n: pd.DataFrame) -> tuple[dict, list]:
    n = n.dropna(subset=["ndvi"]).copy()
    n["date"] = pd.to_datetime(n["date"])
    n["year"] = n["date"].dt.year
    bare = n.assign(bare=n["ndvi"] < BARE_NDVI).groupby("year")["bare"].sum()
    feats = {
        "ndvi_years": f"{n['year'].min()}–{n['year'].max()}",
        "bare_months_per_year": _num(bare.mean() * DAYS_PER_COMPOSITE / DAYS_PER_MONTH),
        "ndvi_peak_mean": _num(n.groupby("year")["ndvi"].max().mean(), 2),
    }
    n["month"] = n["date"].dt.month
    prof = n.groupby("month")["ndvi"].mean()
    profile = [_num(prof.get(i), 2) for i in range(1, 13)]
    return feats, profile


def build() -> dict:
    out = {"generated": date.today().isoformat(), "paddocks": []}
    for p in load_paddocks():
        pid, props = p["id"], p["properties"]
        feats: dict = {}
        monthly: dict = {}
        ndvi_profile: list = []
        sources: list[str] = []

        f = PROCESSED_DIR / f"power_monthly_{pid}.csv"
        if f.exists():
            pf, monthly = power_features(pd.read_csv(f))
            feats.update(pf)
            sources.append("NASA POWER")
        f = PROCESSED_DIR / f"ndvi_{pid}.csv"
        if f.exists():
            nf, ndvi_profile = ndvi_features(pd.read_csv(f))
            feats.update(nf)
            sources.append("MODIS MOD13Q1")
        f = PROCESSED_DIR / f"smap_{pid}.csv"
        if f.exists():
            s = pd.read_csv(f)
            feats["smap_sowing_sm"] = _num(s["sm_surface_m3m3"].mean(), 3)
            sources.append("SMAP L4")
        f = PROCESSED_DIR / "srtm.csv"
        if f.exists():
            s = pd.read_csv(f).set_index("id")
            if pid in s.index:
                feats["slope_pct"] = _num(s.loc[pid, "slope_pct"], 1)
                feats["elevation_m"] = _num(s.loc[pid, "elevation_m"], 0)
                sources.append("SRTM")
        f = PROCESSED_DIR / f"silo_monthly_{pid}.csv"
        if f.exists():
            s = pd.read_csv(f)
            gs = s[s["month"].isin(GROWING_SEASON)].groupby("year")["rain_mm"].sum()
            feats["silo_gs_rain_mm"] = _num(gs.mean(), 0)
            sources.append("SILO")
        for key in ("soil_organic_carbon_pct", "soil_clay_pct", "soil_awc_mm"):
            if props.get(key) is not None:
                feats[key] = props[key]
                if "Soil and Landscape Grid" not in sources:
                    sources.append("Soil and Landscape Grid")

        out["paddocks"].append({
            "id": pid,
            "name": p["name"],
            "region": props.get("region", ""),
            "center": [p["lat"], p["lon"]],
            "geometry": p["geometry"],
            "current_rotation": props.get("current_rotation", ["wheat", "canola", "wheat", "wheat"]),
            "features": feats,
            "monthly": monthly,
            "ndvi_profile": ndvi_profile,
            "sources": sources,
        })
    return out


def main() -> int:
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
    data = build()
    path = APP_DATA_DIR / "paddocks.json"
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"[features] wrote {len(data['paddocks'])} paddocks to {path.relative_to(path.parents[2])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

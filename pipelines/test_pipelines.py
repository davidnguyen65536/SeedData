# Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
# Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

"""Offline tests for the pipeline maths. Run: python -m pytest pipelines -q"""

from __future__ import annotations

import numpy as np
import pandas as pd

import appeears
import build_features
import power


def _payload(days: pd.DatetimeIndex) -> dict:
    n = len(days)
    tmin = np.full(n, 8.0)
    tmin[(days.month == 9) & (days.day <= 3)] = 0.5          # 3 frost days each September
    tmax = np.full(n, 20.0)
    tmax[(days.month == 11) & (days.day <= 2)] = 35.0        # 2 heat days each November
    rain = np.full(n, 1.0)
    rain[(days.month == 6) & (days.day == 15)] = 30.0         # 1 heavy-rain day each June
    rain[5] = -999.0                                          # one missing value
    keys = days.strftime("%Y%m%d")
    mk = lambda a: dict(zip(keys, a.tolist()))
    return {"properties": {"parameter": {
        "T2M_MAX": mk(tmax), "T2M_MIN": mk(tmin), "PRECTOTCORR": mk(rain),
        "ALLSKY_SFC_SW_DWN": mk(np.full(n, 15.0)), "GWETTOP": mk(np.full(n, 0.4)), "GWETROOT": mk(np.full(n, 0.5)),
    }}}


def test_power_monthly_and_features():
    days = pd.date_range("2020-01-01", "2021-12-31")
    monthly = power.monthly_table(power.daily_frame(_payload(days)))
    assert len(monthly) == 24
    feats, clim = build_features.power_features(monthly)
    assert feats["frost_days_aug_oct"] == 3.0
    assert feats["heat_days_oct_nov"] == 2.0
    assert feats["heavy_rain_days"] == 1.0
    assert feats["n_years"] == 2
    assert feats["sowing_soil_wetness"] == 0.4
    assert len(clim["rain_mm"]) == 12
    assert clim["yearly"]["year"] == [2020, 2021]
    assert clim["yearly"]["frost_days"] == [3, 3]
    assert clim["yearly"]["heat_days"] == [2, 2]
    # January 2020 has one missing day, so its sum is 30 not 31
    assert monthly.loc[0, "rain_mm"] == 30.0


def test_ndvi_bare_months():
    dates = pd.date_range("2020-01-01", periods=46, freq="16D")
    ndvi = [0.15 if d.month in (1, 2, 3) else 0.6 for d in dates]
    feats, profile = build_features.ndvi_features(pd.DataFrame({"date": dates, "ndvi": ndvi}))
    assert feats["bare_months_per_year"] > 2.5
    assert profile[0] == 0.15 and profile[6] == 0.6


def test_srtm_slope():
    rows = []
    for pos, z in {"c": 100, "n": 101, "s": 99, "e": 100, "w": 100}.items():
        rows.append({"ID": f"p1_{pos}", "Date": "2000-02-11", "SRTMGL1_NC_003_SRTMGL1_DEM": str(z)})
    out = appeears.summarise_srtm(rows, {"p1": -35.0})
    assert out["p1"]["elevation_m"] == 100
    assert abs(out["p1"]["slope_pct"] - 1.11) < 0.01

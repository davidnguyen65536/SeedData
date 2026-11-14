# Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
# Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

"""NASA POWER daily weather -> monthly table per paddock.

NASA POWER (https://power.larc.nasa.gov/) needs no login. For each paddock this
fetches daily values at the paddock centre and writes
data/processed/power_monthly_<id>.csv with one row per month.

Monthly columns (thresholds are explained in docs/methodology.md):
    rain_mm           sum of PRECTOTCORR
    frost_days        days with T2M_MIN <= 2.0 C
    heat_days         days with T2M_MAX >= 32.0 C
    heavy_rain_days   days with PRECTOTCORR >= 25 mm
    tmax_c, tmin_c    means of T2M_MAX, T2M_MIN
    solar_mj_m2       mean of ALLSKY_SFC_SW_DWN
    gwettop, gwetroot means of surface and root-zone soil wetness (0-1, MERRA-2 via POWER)
    days              days with valid values

Usage:
    python power.py [--first 2016 --last 2025]
"""

from __future__ import annotations

import argparse
import sys
import time

import pandas as pd
import requests

from common import FIRST_YEAR, LAST_YEAR, PROCESSED_DIR, RAW_DIR, load_paddocks

API = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMETERS = ["T2M_MAX", "T2M_MIN", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "GWETTOP", "GWETROOT"]
FILL_VALUE = -999.0

FROST_C = 2.0
HEAT_C = 32.0
HEAVY_RAIN_MM = 25.0


def fetch_daily_json(lat: float, lon: float, first: int, last: int) -> dict:
    params = {
        "parameters": ",".join(PARAMETERS),
        "community": "AG",
        "longitude": lon,
        "latitude": lat,
        "start": f"{first}0101",
        "end": f"{last}1231",
        "format": "JSON",
    }
    last_error = None
    for attempt in range(3):
        try:
            resp = requests.get(API, params=params, timeout=180)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as err:  # retry on network or 5xx errors
            last_error = err
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"NASA POWER request failed: {last_error}")


def daily_frame(payload: dict) -> pd.DataFrame:
    """Daily values as floats, missing (-999) as NaN, indexed by date."""
    series = payload["properties"]["parameter"]
    df = pd.DataFrame({k: pd.Series(v) for k, v in series.items()})
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df = df.astype("float64")
    return df.mask(df <= FILL_VALUE).sort_index()


def monthly_table(daily: pd.DataFrame) -> pd.DataFrame:
    """Aggregate daily values to the monthly table used by build_features.py."""
    g = daily.groupby([daily.index.year, daily.index.month])
    out = pd.DataFrame({
        "rain_mm": g["PRECTOTCORR"].sum(min_count=1),
        "frost_days": g["T2M_MIN"].apply(lambda s: int((s <= FROST_C).sum())),
        "heat_days": g["T2M_MAX"].apply(lambda s: int((s >= HEAT_C).sum())),
        "heavy_rain_days": g["PRECTOTCORR"].apply(lambda s: int((s >= HEAVY_RAIN_MM).sum())),
        "tmax_c": g["T2M_MAX"].mean(),
        "tmin_c": g["T2M_MIN"].mean(),
        "solar_mj_m2": g["ALLSKY_SFC_SW_DWN"].mean(),
        "gwettop": g["GWETTOP"].mean(),
        "gwetroot": g["GWETROOT"].mean(),
        "days": g["T2M_MIN"].count(),
    })
    out.index.names = ["year", "month"]
    return out.reset_index().round(3)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="NASA POWER daily -> monthly table per paddock")
    parser.add_argument("--first", type=int, default=FIRST_YEAR)
    parser.add_argument("--last", type=int, default=LAST_YEAR)
    args = parser.parse_args(argv)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    (RAW_DIR / "power").mkdir(parents=True, exist_ok=True)
    for p in load_paddocks():
        print(f"[power] {p['id']}: {args.first}-{args.last} at {p['lat']}, {p['lon']}")
        daily = daily_frame(fetch_daily_json(p["lat"], p["lon"], args.first, args.last))
        daily.to_csv(RAW_DIR / "power" / f"{p['id']}_daily.csv")
        monthly_table(daily).to_csv(PROCESSED_DIR / f"power_monthly_{p['id']}.csv", index=False)
    print("[power] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())

# Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
# Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

"""Optional: SILO daily rainfall per paddock, used to check NASA rainfall against
Australian ground-based data.

SILO (Queensland Government, https://www.longpaddock.qld.gov.au/silo/) asks for
an email address as the API username. Put it in .env:
    SILO_EMAIL=you@example.com

Writes data/processed/silo_monthly_<id>.csv (year, month, rain_mm).

Usage:
    python silo.py [--first 2016 --last 2025]
"""

from __future__ import annotations

import argparse
import io
import os
import sys

import pandas as pd
import requests

from common import FIRST_YEAR, LAST_YEAR, PROCESSED_DIR, load_env, load_paddocks

API = "https://www.longpaddock.qld.gov.au/cgi-bin/silo/DataDrillDataset.php"


def fetch(lat: float, lon: float, first: int, last: int, email: str) -> pd.DataFrame:
    params = {"lat": lat, "lon": lon, "start": f"{first}0101", "finish": f"{last}1231",
              "format": "csv", "comment": "R", "username": email, "password": "apirequest"}
    resp = requests.get(API, params=params, timeout=180)
    resp.raise_for_status()
    df = pd.read_csv(io.StringIO(resp.text))
    date_col = next(c for c in df.columns if c.lower().startswith("yyyy") or c.lower() == "date")
    rain_col = next(c for c in df.columns if c.lower() in ("daily_rain", "rain"))
    df["date"] = pd.to_datetime(df[date_col].astype(str))
    return df[["date", rain_col]].rename(columns={rain_col: "rain"})


def main(argv: list[str] | None = None) -> int:
    load_env()
    email = os.environ.get("SILO_EMAIL")
    if not email:
        print("[silo] SILO_EMAIL not set in .env; skipping.")
        return 0
    parser = argparse.ArgumentParser(description="SILO rainfall per paddock")
    parser.add_argument("--first", type=int, default=FIRST_YEAR)
    parser.add_argument("--last", type=int, default=LAST_YEAR)
    args = parser.parse_args(argv)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    for p in load_paddocks():
        print(f"[silo] {p['id']}")
        d = fetch(p["lat"], p["lon"], args.first, args.last, email)
        m = d.groupby([d["date"].dt.year, d["date"].dt.month])["rain"].sum().round(1)
        m.index.names = ["year", "month"]
        m.rename("rain_mm").reset_index().to_csv(PROCESSED_DIR / f"silo_monthly_{p['id']}.csv", index=False)
    print("[silo] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())

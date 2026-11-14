# Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
# Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

"""MODIS NDVI (MOD13Q1, 250 m, 16-day) per paddock from the ORNL DAAC web service.

No login needed: https://modis.ornl.gov/data/modis_webservice.html
Writes data/processed/ndvi_<id>.csv with columns date, ndvi (the pixel at the
paddock centre). The service returns at most 10 composites per request, so the
script asks in chunks.

Usage:
    python modis_ndvi.py [--first 2016 --last 2025]
"""

from __future__ import annotations

import argparse
import sys
import time

import pandas as pd
import requests

from common import FIRST_YEAR, LAST_YEAR, PROCESSED_DIR, load_paddocks

BASE = "https://modis.ornl.gov/rst/api/v1/MOD13Q1"
BAND = "250m_16_days_NDVI"
HEADERS = {"Accept": "application/json"}
CHUNK = 10
FILL = -3000


def get_json(url: str, params: dict) -> dict:
    last_error = None
    for attempt in range(4):
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=120)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as err:
            last_error = err
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"ORNL MODIS request failed: {last_error}")


def parse_subset(payload: dict) -> list[tuple[str, float | None]]:
    scale = float(payload.get("scale", 0.0001))
    rows = []
    for item in payload["subset"]:
        raw = item["data"][0]
        rows.append((item["calendar_date"], None if raw == FILL else round(raw * scale, 4)))
    return rows


def fetch_ndvi(lat: float, lon: float, first: int, last: int) -> pd.DataFrame:
    dates = get_json(f"{BASE}/dates", {"latitude": lat, "longitude": lon})["dates"]
    dates = [d for d in dates if first <= int(d["calendar_date"][:4]) <= last]
    rows: list[tuple[str, float | None]] = []
    for i in range(0, len(dates), CHUNK):
        chunk = dates[i:i + CHUNK]
        payload = get_json(f"{BASE}/subset", {
            "latitude": lat, "longitude": lon, "band": BAND,
            "startDate": chunk[0]["modis_date"], "endDate": chunk[-1]["modis_date"],
            "kmAboveBelow": 0, "kmLeftRight": 0,
        })
        rows.extend(parse_subset(payload))
    return pd.DataFrame(rows, columns=["date", "ndvi"]).drop_duplicates("date").sort_values("date")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MODIS NDVI per paddock (ORNL DAAC)")
    parser.add_argument("--first", type=int, default=FIRST_YEAR)
    parser.add_argument("--last", type=int, default=LAST_YEAR)
    args = parser.parse_args(argv)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    for p in load_paddocks():
        print(f"[modis] {p['id']}: NDVI {args.first}-{args.last}")
        fetch_ndvi(p["lat"], p["lon"], args.first, args.last).to_csv(
            PROCESSED_DIR / f"ndvi_{p['id']}.csv", index=False)
    print("[modis] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())

# Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
# Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

"""Optional: SMAP soil moisture and SRTM slope per paddock via NASA AppEEARS.

Needs a free NASA Earthdata login (https://urs.earthdata.nasa.gov/) in .env:
    EARTHDATA_USERNAME=...
    EARTHDATA_PASSWORD=...

Two point requests are submitted, polled until done, and summarised:
  * SPL4SMGP.008 Geophysical_Data_sm_surface, April-May of each year
    -> data/processed/smap_<id>.csv  (year, sm_surface_m3m3)
  * SRTMGL1_NC.003 SRTMGL1_DEM at the paddock centre and 90 m N, S, E, W
    -> data/processed/srtm.csv       (id, elevation_m, slope_pct)

AppEEARS tasks can take from a few minutes to an hour. Re-running reuses
finished tasks recorded in data/raw/appeears_tasks.json.

Usage:
    python appeears.py
"""

from __future__ import annotations

import csv
import io
import json
import math
import os
import sys
import time

import requests

from common import FIRST_YEAR, LAST_YEAR, PROCESSED_DIR, RAW_DIR, load_env, load_paddocks

API = "https://appeears.earthdatacloud.nasa.gov/api"
SMAP = ("SPL4SMGP.008", "Geophysical_Data_sm_surface")
SRTM = ("SRTMGL1_NC.003", "SRTMGL1_DEM")
OFFSET_M = 90.0
TASKS_FILE = RAW_DIR / "appeears_tasks.json"


def login() -> str:
    load_env()
    user, pw = os.environ.get("EARTHDATA_USERNAME"), os.environ.get("EARTHDATA_PASSWORD")
    if not user or not pw:
        raise SystemExit("[appeears] EARTHDATA_USERNAME / EARTHDATA_PASSWORD not set in .env; skipping.")
    resp = requests.post(f"{API}/login", auth=(user, pw), timeout=60)
    resp.raise_for_status()
    return resp.json()["token"]


def offsets(lat: float, lon: float) -> dict[str, tuple[float, float]]:
    dlat = OFFSET_M / 111_320.0
    dlon = OFFSET_M / (111_320.0 * math.cos(math.radians(lat)))
    return {"c": (lat, lon), "n": (lat + dlat, lon), "s": (lat - dlat, lon),
            "e": (lat, lon + dlon), "w": (lat, lon - dlon)}


def submit(token: str, name: str, product: tuple[str, str], dates: list[dict], coords: list[dict]) -> str:
    task = {"task_type": "point", "task_name": name, "params": {
        "dates": dates, "layers": [{"product": product[0], "layer": product[1]}], "coordinates": coords}}
    resp = requests.post(f"{API}/task", json=task, headers={"Authorization": f"Bearer {token}"}, timeout=60)
    resp.raise_for_status()
    return resp.json()["task_id"]


def wait(token: str, task_id: str, every: int = 30) -> None:
    head = {"Authorization": f"Bearer {token}"}
    while True:
        status = requests.get(f"{API}/task/{task_id}", headers=head, timeout=60).json().get("status")
        print(f"[appeears] task {task_id}: {status}")
        if status == "done":
            return
        if status in ("error", "expired"):
            raise RuntimeError(f"AppEEARS task {task_id} ended with status {status}")
        time.sleep(every)


def results_csv(token: str, task_id: str) -> list[dict]:
    head = {"Authorization": f"Bearer {token}"}
    bundle = requests.get(f"{API}/bundle/{task_id}", headers=head, timeout=60).json()
    rows: list[dict] = []
    for f in bundle["files"]:
        if f["file_name"].endswith("results.csv"):
            text = requests.get(f"{API}/bundle/{task_id}/{f['file_id']}", headers=head, timeout=300).text
            rows.extend(csv.DictReader(io.StringIO(text)))
    return rows


def column(row: dict, layer: str) -> float | None:
    for key, value in row.items():
        if key.endswith(layer):
            try:
                v = float(value)
            except (TypeError, ValueError):
                return None
            return None if v <= -9999 or math.isnan(v) else v
    return None


def summarise_smap(rows: list[dict]) -> dict[str, dict[int, float]]:
    acc: dict[str, dict[int, list[float]]] = {}
    for r in rows:
        v = column(r, SMAP[1])
        if v is None:
            continue
        acc.setdefault(r["ID"], {}).setdefault(int(r["Date"][:4]), []).append(v)
    return {pid: {y: round(sum(vs) / len(vs), 4) for y, vs in years.items()} for pid, years in acc.items()}


def summarise_srtm(rows: list[dict], lat_by_id: dict[str, float]) -> dict[str, dict]:
    elev: dict[str, dict[str, float]] = {}
    for r in rows:
        v = column(r, SRTM[1])
        if v is None or v <= -32768:
            continue
        pid, _, pos = r["ID"].rpartition("_")
        elev.setdefault(pid, {})[pos] = v
    out = {}
    for pid, e in elev.items():
        if not all(k in e for k in "cnsew"):
            continue
        dzdx = (e["e"] - e["w"]) / (2 * OFFSET_M)
        dzdy = (e["n"] - e["s"]) / (2 * OFFSET_M)
        out[pid] = {"elevation_m": round(e["c"], 1), "slope_pct": round(100 * math.hypot(dzdx, dzdy), 2)}
    return out


def main() -> int:
    token = login()
    paddocks = load_paddocks()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    tasks = json.loads(TASKS_FILE.read_text()) if TASKS_FILE.exists() else {}

    if "smap" not in tasks:
        coords = [{"id": p["id"], "latitude": p["lat"], "longitude": p["lon"]} for p in paddocks]
        dates = [{"startDate": "04-01", "endDate": "05-31", "recurring": True, "yearRange": [FIRST_YEAR, LAST_YEAR]}]
        tasks["smap"] = submit(token, "seeddata-smap", SMAP, dates, coords)
    if "srtm" not in tasks:
        coords = [{"id": f"{p['id']}_{k}", "latitude": round(la, 6), "longitude": round(lo, 6)}
                  for p in paddocks for k, (la, lo) in offsets(p["lat"], p["lon"]).items()]
        dates = [{"startDate": "02-11-2000", "endDate": "02-22-2000"}]
        tasks["srtm"] = submit(token, "seeddata-srtm", SRTM, dates, coords)
    TASKS_FILE.write_text(json.dumps(tasks, indent=2))

    wait(token, tasks["srtm"])
    srtm = summarise_srtm(results_csv(token, tasks["srtm"]), {p["id"]: p["lat"] for p in paddocks})
    with open(PROCESSED_DIR / "srtm.csv", "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "elevation_m", "slope_pct"])
        for pid, v in srtm.items():
            w.writerow([pid, v["elevation_m"], v["slope_pct"]])

    wait(token, tasks["smap"])
    for pid, years in summarise_smap(results_csv(token, tasks["smap"])).items():
        with open(PROCESSED_DIR / f"smap_{pid}.csv", "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["year", "sm_surface_m3m3"])
            for y in sorted(years):
                w.writerow([y, years[y]])
    print("[appeears] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())

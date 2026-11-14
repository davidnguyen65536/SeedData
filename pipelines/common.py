# Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
# Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

"""Shared paths and helpers for the SeedData pipelines."""

from __future__ import annotations

import json
import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PADDOCKS_FILE = REPO / "data" / "paddocks.geojson"
RAW_DIR = REPO / "data" / "raw"            # git-ignored: full downloads
PROCESSED_DIR = REPO / "data" / "processed"  # small monthly tables, committed
APP_DATA_DIR = REPO / "app" / "data"         # what the web app reads

# Ten full years of record ending with the last complete year.
FIRST_YEAR = 2016
LAST_YEAR = 2025


def load_env() -> None:
    """Load KEY=VALUE lines from .env at the repo root (never committed)."""
    env = REPO / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def load_paddocks(path: Path = PADDOCKS_FILE) -> list[dict]:
    """Return each paddock's id, name, properties and centre (mean of the outer ring)."""
    data = json.loads(path.read_text(encoding="utf-8"))
    paddocks = []
    for feature in data["features"]:
        geom = feature["geometry"]
        if geom["type"] == "Point":
            lon, lat = geom["coordinates"][:2]
        elif geom["type"] == "Polygon":
            ring = geom["coordinates"][0]
            if ring[0] == ring[-1]:
                ring = ring[:-1]
            lon = sum(p[0] for p in ring) / len(ring)
            lat = sum(p[1] for p in ring) / len(ring)
        else:
            raise ValueError(f"Unsupported geometry type {geom['type']}")
        props = feature["properties"]
        paddocks.append({
            "id": props["id"],
            "name": props.get("name", props["id"]),
            "lat": round(lat, 5),
            "lon": round(lon, 5),
            "properties": props,
            "geometry": geom,
        })
    return paddocks

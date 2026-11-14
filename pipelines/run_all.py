# Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
# Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

"""Run every pipeline in order, then rebuild app/data/paddocks.json.

    python run_all.py              # NASA POWER + MODIS NDVI (no login needed)
    python run_all.py --appeears   # also SMAP and SRTM (Earthdata login in .env)
    python run_all.py --silo       # also SILO rainfall check (SILO_EMAIL in .env)
"""

from __future__ import annotations

import argparse
import sys

import build_features
import modis_ndvi
import power


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--appeears", action="store_true", help="also run SMAP and SRTM via AppEEARS")
    parser.add_argument("--silo", action="store_true", help="also run the SILO rainfall check")
    parser.add_argument("--skip-download", action="store_true", help="only rebuild app data from data/processed")
    args = parser.parse_args()

    if not args.skip_download:
        power.main([])
        modis_ndvi.main([])
        if args.appeears:
            import appeears
            appeears.main()
        if args.silo:
            import silo
            silo.main([])
    return build_features.main()


if __name__ == "__main__":
    sys.exit(main())

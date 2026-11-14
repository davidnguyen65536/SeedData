# Contributing

- Branch from `main` (`feature/<name>-<task>`), open a pull request, and get one review before merging.
- Run the tests before pushing: `npm test` at the repo root and `python -m pytest -q` in `pipelines/`.
- Never commit keys, `.env`, or large raw data. Raw downloads go in `data/raw/` (git-ignored).
- Add new data sources to `docs/data-sources.md` and new scoring rules to `docs/methodology.md`.
- Note any AI-assisted work in `docs/si-disclosure.md`.

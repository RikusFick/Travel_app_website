#!/usr/bin/env python3
"""Build optional /data/scripts/<guideId>.json files from the app catalog.

These files are not required for audio unlock. They only provide the remaining
read-along text after a purchase. Run from a machine that has the travel_app
catalog, and pass the catalog guides directory:

  python3 tools/build-guide-scripts.py \\
    --catalog /path/to/travel_app/src/data/catalog/guides \\
    --out data/scripts

This script is not run in the current branch, to keep the diff lean.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--only", help="Comma-separated guide ids", default="")
    args = parser.parse_args()
    wanted = {part.strip() for part in args.only.split(",") if part.strip()}
    args.out.mkdir(parents=True, exist_ok=True)
    written = 0
    for path in sorted(args.catalog.glob("*.json")):
        guide_id = path.stem
        if wanted and guide_id not in wanted:
            continue
        data = json.loads(path.read_text())
        languages = {"en": []}
        for stop in data.get("stops") or []:
            languages["en"].append({
                "number": stop.get("number"),
                "title": stop.get("title") or "",
                "paragraphs": list(stop.get("paragraphs") or []),
            })
        for lang, payload in (data.get("locales") or {}).items():
            stops = []
            for key, stop in ((payload or {}).get("stops") or {}).items():
                stops.append({
                    "number": int(key) if str(key).isdigit() else stop.get("number"),
                    "title": stop.get("title") or "",
                    "paragraphs": list(stop.get("paragraphs") or []),
                })
            stops.sort(key=lambda row: row["number"] or 0)
            if stops:
                languages[lang] = stops
        out = {"id": guide_id, "languages": languages}
        (args.out / f"{guide_id}.json").write_text(json.dumps(out, ensure_ascii=False) + "\n")
        written += 1
    print(f"wrote {written} script files to {args.out}")


if __name__ == "__main__":
    main()

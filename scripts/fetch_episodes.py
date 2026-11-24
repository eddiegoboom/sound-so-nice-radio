#!/usr/bin/env python3
"""Scrape the CFRU archive folder and write public/episodes.json.

Standard library only. Run by the GitHub Action on a schedule, or by hand:

    python scripts/fetch_episodes.py

Exit codes: 0 = written, 1 = failed (existing episodes.json is left untouched).
"""
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ARCHIVE_URL = "https://archive.cfru.ca/show/name/Sound%20So%20Nice/"
OUT_FILE = Path(__file__).resolve().parent.parent / "public" / "episodes.json"

# e.g. "Sound So Nice-CFRU933.20261121.210000EST.mp3"
NAME_RE = re.compile(r"\.(\d{8})\.(\d{6})([A-Za-z]{2,5})\.mp3$", re.IGNORECASE)
# One listing row: link, size, modified date ("2026-Nov-21 22:00")
ROW_RE = re.compile(
    r'<tr><td><a href="([^"]+\.mp3)"[^>]*>.*?</a></td>'
    r"<td>\s*([^<]*?)\s*</td><td>\s*([^<]*?)\s*</td>",
    re.IGNORECASE | re.DOTALL,
)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "SoundSoNiceSiteBuild/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_modified(text):
    try:
        return datetime.strptime(text, "%Y-%b-%d %H:%M")
    except ValueError:
        return None


def main():
    try:
        page = fetch(ARCHIVE_URL)
    except Exception as exc:  # network error, HTTP error, timeout...
        print(f"ERROR: could not read {ARCHIVE_URL}: {exc}", file=sys.stderr)
        return 1

    episodes = []
    seen_ids = set()
    for href, size, modified in ROW_RE.findall(page):
        filename = urllib.parse.unquote(html.unescape(href))
        if "/" in filename:
            continue
        m = NAME_RE.search(filename)
        if m:
            d, t, tz = m.group(1), m.group(2), m.group(3).upper()
            date = f"{d[0:4]}-{d[4:6]}-{d[6:8]}"
            hhmm = f"{t[0:2]}:{t[2:4]}"
        else:
            # Unexpected filename: fall back to the listing's modified time
            mod = parse_modified(modified)
            if not mod:
                print(f"WARN: skipping {filename!r} (no date found)", file=sys.stderr)
                continue
            print(f"WARN: {filename!r} has no date in its name; using modified time", file=sys.stderr)
            date, hhmm, tz = mod.strftime("%Y-%m-%d"), mod.strftime("%H:%M"), ""
        base_id = f"{date.replace('-', '')}-{hhmm.replace(':', '')}"
        ep_id, n = base_id, 2
        while ep_id in seen_ids:  # two files with the same date+time
            ep_id, n = f"{base_id}-{n}", n + 1
        seen_ids.add(ep_id)
        episodes.append(
            {
                "id": ep_id,
                "file": filename,
                "url": ARCHIVE_URL + urllib.parse.quote(filename),
                "date": date,
                "time": hhmm,
                "tz": tz,
                "size": size,
            }
        )

    if not episodes:
        print("ERROR: no episodes found; leaving existing episodes.json alone", file=sys.stderr)
        return 1

    episodes.sort(key=lambda e: (e["date"], e["time"], e["id"]), reverse=True)
    payload = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": ARCHIVE_URL,
        "episodes": episodes,
    }
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(episodes)} episodes to {OUT_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

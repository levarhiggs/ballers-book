"""Pre-deploy sanity checks.  python tools/check.py

- every plays.json entry has its file (and assets); every plays/*.html is listed
- every play page includes the shell and PWA meta tags
- sw.js VERSION matches shared/version.js
- every SHELL file in sw.js exists
- no external URLs in served files (offline-only app)
- total payload well under 2 MB
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding="utf-8")
problems = []


def bad(msg):
    problems.append(msg)


plays = json.loads((ROOT / "plays.json").read_text(encoding="utf-8"))
ids = set()
listed = set()
for p in plays:
    for k in ("id", "file", "title", "category", "description"):
        if not p.get(k):
            bad(f"plays.json entry missing '{k}': {p}")
    if p.get("id") in ids:
        bad(f"duplicate play id {p['id']}")
    ids.add(p.get("id"))
    if p.get("category") not in ("Offense", "Inbound", "Defense"):
        bad(f"{p.get('id')}: category should be Offense, Inbound or Defense")
    for f in [p.get("file", "")] + p.get("assets", []):
        listed.add(f)
        if not (ROOT / f).is_file():
            bad(f"{p.get('id')}: missing file {f}")
    html_path = ROOT / p.get("file", "")
    if html_path.is_file():
        h = html_path.read_text(encoding="utf-8")
        for needle in ('../shared/shell.css', '../shared/shell.js', 'rel="manifest"', 'apple-touch-icon',
                       'apple-mobile-web-app-capable', 'viewport-fit=cover', f'data-bb-play="{p["id"]}"'):
            if needle not in h:
                bad(f"{p['file']}: missing {needle}")

for f in (ROOT / "plays").glob("*.html"):
    rel = f.relative_to(ROOT).as_posix()
    if rel not in listed:
        bad(f"{rel} is not listed in plays.json (it won't be on the home screen or cached offline)")

sw = (ROOT / "sw.js").read_text(encoding="utf-8")
v_sw = re.search(r"const VERSION = '([^']+)'", sw).group(1)
v_js = re.search(r"BB_VERSION = '([^']+)'", (ROOT / "shared/version.js").read_text(encoding="utf-8")).group(1)
if v_sw != v_js:
    bad(f"version mismatch: sw.js {v_sw} vs shared/version.js {v_js} (use tools/bump.py)")
shell = re.findall(r"^\s*'([^']+)',?$", sw.split("const SHELL = [")[1].split("];")[0], re.M)
for f in shell:
    if f != "./" and not (ROOT / f).is_file():
        bad(f"sw.js SHELL lists missing file {f}")

served = [ROOT / f for f in shell if f != "./"] + [ROOT / f for f in listed] + [ROOT / "sw.js"]
ext = re.compile(r"""(?:src|href)\s*=\s*["'](?:https?:)?//|url\(\s*["']?(?:https?:)?//|fetch\(\s*["']https?://|@import""")
total = 0
for f in served:
    if not f.is_file():
        continue
    total += f.stat().st_size
    if f.suffix in (".html", ".js", ".css", ".json"):
        t = f.read_text(encoding="utf-8")
        if ext.search(t):
            bad(f"{f.relative_to(ROOT).as_posix()}: references an external URL")
if total > 1_000_000:
    bad(f"payload {total/1024:.0f} KB is getting large (limit 2 MB)")

print(f"version {v_sw} · {len(plays)} plays · {len(served)} cached files · {total/1024:.0f} KB")
if problems:
    print("PROBLEMS:")
    for p in problems:
        print("  - " + p)
    sys.exit(1)
print("all checks passed")

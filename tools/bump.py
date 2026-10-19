"""Bump the app version in sw.js and shared/version.js together.

  python tools/bump.py            # 1.0.0 -> 1.0.1
  python tools/bump.py minor      # 1.0.1 -> 1.1.0
  python tools/bump.py 2.0.0      # explicit
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = {
    ROOT / "sw.js": r"(const VERSION = ')([^']+)(')",
    ROOT / "shared" / "version.js": r"(BB_VERSION = ')([^']+)(')",
}


def current():
    return re.search(FILES[ROOT / "sw.js"], (ROOT / "sw.js").read_text(encoding="utf-8")).group(2)


def bump(arg="patch"):
    old = current()
    if re.fullmatch(r"\d+\.\d+\.\d+", arg):
        new = arg
    else:
        major, minor, patch = map(int, old.split("."))
        new = {"major": f"{major + 1}.0.0", "minor": f"{major}.{minor + 1}.0"}.get(arg, f"{major}.{minor}.{patch + 1}")
    for path, pat in FILES.items():
        text = path.read_text(encoding="utf-8")
        path.write_text(re.sub(pat, lambda m: m.group(1) + new + m.group(3), text, count=1), encoding="utf-8", newline="")
    return old, new


if __name__ == "__main__":
    old, new = bump(sys.argv[1] if len(sys.argv) > 1 else "patch")
    print(f"version {old} -> {new}")

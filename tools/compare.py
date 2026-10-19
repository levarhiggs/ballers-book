"""Diff two baseline runs: python tools/compare.py <labelA> <labelB> [--ignore key,key]

Exits 1 on any difference. Prints the first few differing steps per play.
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
OUT = Path(__file__).parent / "out"


def main():
    args = sys.argv[1:]
    ignore = set()
    if "--ignore" in args:
        i = args.index("--ignore")
        ignore = set(args[i + 1].split(","))
        args = args[:i] + args[i + 2:]
    a, b = args
    bad = 0
    for fa in sorted((OUT / a).glob("*.json")):
        fb = OUT / b / fa.name
        ra, rb = json.loads(fa.read_text(encoding="utf-8")), json.loads(fb.read_text(encoding="utf-8"))
        la, lb = ra["log"], rb["log"]
        diffs = []
        if len(la) != len(lb):
            diffs.append(f"step count {len(la)} vs {len(lb)}")
        for sa, sb in zip(la, lb):
            for k in sorted(set(sa) | set(sb)):
                if k in ignore:
                    continue
                if sa.get(k) != sb.get(k):
                    diffs.append(f"[{sa.get('step')}] {k}: {str(sa.get(k))[:140]!r} != {str(sb.get(k))[:140]!r}")
        errs = rb["errors"]
        status = "IDENTICAL" if not diffs else f"{len(diffs)} DIFFS"
        print(f"{fa.stem:16} {status:12} steps={len(la)} errors={len(errs)}")
        for d in diffs[:6]:
            print("    " + d)
        for e in errs[:3]:
            print("    error: " + e)
        bad += len(diffs) + len(errs)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()

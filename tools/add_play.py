"""Add a new play (a single-file HTML artifact) to Baller's Book.

  python tools/add_play.py source-plays/my-play.html --category Offense \
      --description "One line for the home screen card." [--title "Card title"] [--id my-play]

Copies the file into plays/, adds the shell + home-screen meta tags (head and <body> only;
the play's own code is untouched), appends a plays.json entry, bumps the version and runs
the pre-deploy checks. Review with `git diff`, test locally, then commit and push.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).parent))
from bump import bump  # noqa: E402

HEAD = """<link rel="manifest" href="../manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Baller's Book">
<meta name="theme-color" content="#F4F6F8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0F1419" media="(prefers-color-scheme: dark)">
<link rel="apple-touch-icon" href="../icons/apple-touch-icon.png">
<link rel="icon" type="image/png" href="../icons/favicon-32.png">
<link rel="stylesheet" href="../shared/shell.css">
<script src="../shared/shell.js" defer></script>
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src")
    ap.add_argument("--category", required=True, choices=["Offense", "Inbound", "Defense"])
    ap.add_argument("--description", required=True)
    ap.add_argument("--title")
    ap.add_argument("--id")
    ap.add_argument("--lock", action="store_true", help="add the presentation Lock button (editor-style plays)")
    a = ap.parse_args()

    src = Path(a.src)
    html = src.read_text(encoding="utf-8")
    pid = a.id or re.sub(r"[^a-z0-9]+", "-", src.stem.lower()).strip("-")
    title = a.title or (re.search(r"<title>(.*?)</title>", html, re.S) or [None, pid])[1].strip()
    dest = ROOT / "plays" / f"{pid}.html"
    plays_path = ROOT / "plays.json"
    plays = json.loads(plays_path.read_text(encoding="utf-8"))
    if dest.exists() or any(p["id"] == pid for p in plays):
        sys.exit(f"play '{pid}' already exists; pass --id to choose another")

    if re.search(r"""(?:src|href)\s*=\s*["'](?:https?:)?//""", html):
        print("warning: the play loads something from the internet; it will not work offline")
    if html.count("</head>") != 1 or len(re.findall(r"<body[\s>]", html)) != 1:
        sys.exit("expected exactly one </head> and one <body> tag")
    if "viewport-fit=cover" not in html:
        html = re.sub(r'(<meta name="viewport" content="[^"]*)"', r'\1, viewport-fit=cover"', html, count=1)
    html = html.replace("</head>", HEAD + "</head>", 1)
    attrs = f' data-bb-play="{pid}" data-bb-title="{title}"' + (" data-bb-lock" if a.lock else "")
    html = re.sub(r"<body(\s[^>]*)?>", lambda m: "<body" + (m.group(1) or "") + attrs + ">", html, count=1)
    dest.write_text(html, encoding="utf-8", newline="")

    plays.append({"id": pid, "file": f"plays/{pid}.html", "title": title,
                  "category": a.category, "description": a.description})
    plays_path.write_text(json.dumps(plays, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    old, new = bump()
    print(f"added {dest.relative_to(ROOT).as_posix()} as '{title}' ({a.category}); version {old} -> {new}")
    print("tip: add a \"thumb\" to its plays.json entry for a mini-court preview (see existing entries)")
    sys.exit(subprocess.call([sys.executable, str(ROOT / "tools" / "check.py")]))


if __name__ == "__main__":
    main()

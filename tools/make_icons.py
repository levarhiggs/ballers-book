"""Generate Baller's Book app icons into icons/.  python tools/make_icons.py

A basketball over half-court lines on the app's dark navy. Drawn at 4x and
downsampled for clean edges. Maskable variant keeps the art inside the 80%
safe zone; apple-touch-icon is opaque (iOS rounds the corners itself).
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
NAVY = (20, 32, 43)
LINE = (70, 92, 112)
ORANGE = (239, 159, 39)
SEAM = (60, 34, 8)


def draw(size, art_scale):
    S = size * 4
    img = Image.new("RGB", (S, S), NAVY)
    d = ImageDraw.Draw(img)
    c = S / 2
    u = S * art_scale  # art box side
    w = max(2, round(S * 0.012))
    # half-court: baseline, lane, three-point arc (court sits behind the ball)
    top = c - u * 0.46
    d.line([(c - u * 0.5, top), (c + u * 0.5, top)], fill=LINE, width=w)
    d.rectangle([c - u * 0.16, top, c + u * 0.16, top + u * 0.38], outline=LINE, width=w)
    d.arc([c - u * 0.44, top - u * 0.44, c + u * 0.44, top + u * 0.62], 0, 180, fill=LINE, width=w)
    for x in (c - u * 0.44, c + u * 0.44):  # straight corner-three segments down from the baseline
        d.line([(x, top), (x, top + u * 0.09)], fill=LINE, width=w)
    # basketball
    r = u * 0.27
    by = c + u * 0.08
    box = [c - r, by - r, c + r, by + r]
    d.ellipse(box, fill=ORANGE)
    sw = max(2, round(S * 0.016))
    d.line([(c - r, by), (c + r, by)], fill=SEAM, width=sw)
    d.line([(c, by - r), (c, by + r)], fill=SEAM, width=sw)
    d.arc([c - r * 1.55, by - r, c - r * 0.25, by + r], -60, 60, fill=SEAM, width=sw)
    d.arc([c + r * 0.25, by - r, c + r * 1.55, by + r], 120, 240, fill=SEAM, width=sw)
    d.ellipse(box, outline=SEAM, width=sw)
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    for name, size, scale in [
        ("apple-touch-icon.png", 180, 0.86),
        ("icon-192.png", 192, 0.86),
        ("icon-512.png", 512, 0.86),
        ("icon-maskable-512.png", 512, 0.66),
        ("favicon-32.png", 32, 0.95),
    ]:
        draw(size, scale).save(OUT / name, optimize=True)
        print(name, (OUT / name).stat().st_size, "bytes")


if __name__ == "__main__":
    main()

"""Draws the app icons in public/icons/ (run by hand: python3 tools/make-icons.py; needs Pillow).
A little house with an arched doorway and a lantern, amber on the app's night colour."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
BG, FG, WATER = (22, 21, 29), (242, 184, 75), (92, 200, 184)


def draw(size, pad_frac=0.0, rounded=True):
    s = 1024
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)
    else:
        d.rectangle([0, 0, s, s], fill=BG)
    k = (1 - pad_frac)
    c = s / 2
    def P(x, y):  # icon space is 32x32, centred
        return (c + (x - 16) * s / 32 * 0.78 * k, c + (y - 16.5) * s / 32 * 0.78 * k)
    w = int(s * 0.058 * k)
    d.line([P(4, 14), P(16, 4.5), P(28, 14)], fill=FG, width=w, joint="curve")
    d.line([P(7.5, 12), P(7.5, 27.5), P(24.5, 27.5), P(24.5, 12)], fill=FG, width=w, joint="curve")
    for x, y in [P(4, 14), P(28, 14), P(16, 4.5), P(7.5, 27.5), P(24.5, 27.5)]:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=FG)
    # Doorway: an arch with water at the bottom (tobar is a well)
    x0, y0 = P(11.5, 17)
    x1, y1 = P(20.5, 27.5)
    d.rectangle([x0, (y0 + y1) / 2, x1, y1], fill=WATER)
    d.pieslice([x0, y0, x1, y0 + (x1 - x0)], 180, 360, fill=WATER)
    d.rectangle([x0, y0 + (x1 - x0) / 2, x1, y1], fill=WATER)
    lx, ly = P(16, 13)
    r = s * 0.035 * k
    d.ellipse([lx - r, ly - r, lx + r, ly + r], fill=FG)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
draw(192).save(OUT / "icon-192.png")
draw(512).save(OUT / "icon-512.png")
draw(512, pad_frac=0.25, rounded=False).save(OUT / "icon-maskable-512.png")
draw(180, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png")
draw(32).save(OUT / "favicon-32.png")
print("icons written to", OUT)

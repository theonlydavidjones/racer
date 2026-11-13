"""Compose the band-ownership option stills into one comparison sheet: rows A/B/C, columns none/some/all."""
import sys
from PIL import Image, ImageDraw, ImageFont
d = sys.argv[1]
opts = {'A': 'A  ·  Word on the tab: "Auto-trim" / "3 yours · Hand back" / "All yours · Hand back"',
        'B': 'B  ·  Two-way switch on the tab: Crew N | You N (click You to take every line)',
        'C': 'C  ·  Auto-trim / Hand back with a 12-segment meter of the lines you hold'}
cols = [('none', 'Crew trimming everything'), ('some', 'You hold the mainsheet, jib sheet, vang'), ('all', 'You hold every line')]
ims = {(o, c): Image.open(f'{d}/{o}-{c}.png') for o in opts for c, _ in cols}
w, h = ims[('A', 'none')].size
s = 0.5; tw, th = int(w * s), int(h * s)
pad, head, lab = 24, 60, 44
W = pad + len(cols) * (tw + pad); H = head + len(opts) * (lab + th + pad) + pad
img = Image.new('RGB', (W, H), (16, 22, 30)); g = ImageDraw.Draw(img)
try:
    f1 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
except OSError:
    f1 = f2 = ImageFont.load_default()
for i, (_, t) in enumerate(cols):
    g.text((pad + i * (tw + pad), 22), t, font=f2, fill=(170, 185, 200))
y = head
for o, t in opts.items():
    g.text((pad, y + 10), t, font=f1, fill=(240, 190, 70)); y += lab
    for i, (c, _) in enumerate(cols):
        img.paste(ims[(o, c)].resize((tw, th), Image.LANCZOS), (pad + i * (tw + pad), y))
    y += th + pad
img.save(f'{d}/band-ownership-options.png'); print(img.size)

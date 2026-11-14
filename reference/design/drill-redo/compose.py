"""One sheet per drill: the five stills by race clock, each captioned with its cue and what's on the water."""
import sys
from PIL import Image, ImageDraw, ImageFont
d, kind, out = sys.argv[1], sys.argv[2], sys.argv[3]
caps = {
  'tack': [('1-approach', 'Rep 3: the lane to sail and the bar to tack at; chevrons on the new course'),
           ('2-hold', 'Nearly there: "Hold"'),
           ('3-tack-now', 'At the bar: "Tack now"'),
           ('4-ease', 'Through the turn: her wake (amber) against a good crew\'s turn (white)'),
           ('5-score', 'After the rep: the short score by the boat; full advice in the Pause list')],
  'round': [('1-approach', 'On the starboard layline: the lane in, the zone, the path round and the exit'),
            ('2-wide-in', 'At the zone: "Wide in"'),
            ('3-bear-away', 'Abeam the mark: "Bear away", ease the main'),
            ('4-close-out', 'Past the mark: "Close out", her wake against the path'),
            ('5-score', 'After the rounding: the short score by the boat (100 m in to 100 m out)')]}[kind]
ims = [Image.open(f'{d}/{kind}-{n}.png') for n, _ in caps]
w, h = ims[0].size; s = 0.34; tw, th = int(w * s), int(h * s)
pad, cap, cols = 20, 40, 3
rows = (len(ims) + cols - 1) // cols
W = pad + cols * (tw + pad); H = 70 + rows * (cap + th + pad)
img = Image.new('RGB', (W, H), (16, 22, 30)); g = ImageDraw.Draw(img)
f1 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 26)
f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 17)
g.text((pad, 22), {'tack': 'Tack drill redo (mock-up): cues by the boat, guides on the water',
                   'round': 'Mark-rounding drill redo (mock-up): the mark ahead, a marked path round it'}[kind], font=f1, fill=(240, 190, 70))
for i, (im, (_, t)) in enumerate(zip(ims, caps)):
    x = pad + (i % cols) * (tw + pad); y = 70 + (i // cols) * (cap + th + pad)
    g.text((x, y + 10), f'{i + 1}. {t}', font=f2, fill=(220, 228, 236))
    img.paste(im.resize((tw, th), Image.LANCZOS), (x, y + cap))
img.save(out); print(img.size)

import sys, os
from PIL import Image, ImageDraw, ImageFont
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst + '/frames', exist_ok=True)
f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
def sheet(name, items, W, cols):
    ims = []
    for label, path, box in items:
        im = Image.open(path).convert('RGB')
        if box: im = im.crop(box)
        h = round(im.height * W / im.width); ims.append((label, im.resize((W, h), Image.LANCZOS)))
    H = max(i[1].height for i in ims); rows = (len(ims) + cols - 1) // cols
    out = Image.new('RGB', (W * cols + 8 * (cols - 1), (H + 34) * rows), (11, 28, 40)); d = ImageDraw.Draw(out)
    for i, (label, im) in enumerate(ims):
        x, y = (i % cols) * (W + 8), (i // cols) * (H + 34); d.text((x + 10, y + 6), label, fill=(255, 182, 39), font=f); out.paste(im, (x, y + 34))
    out.save(os.path.join(dst, name))
A2 = (380, 470, 830, 700); D = (380, 380, 900, 700); TODAY = (500, 180, 900, 700)
for sc, t in [('12kt-port', '12 kt, port tack'), ('12kt-stbd', '12 kt, starboard tack'), ('22kt', '22 kt, overpowered')]:
    sheet(f'compare-{sc}.png', [(f'{t}: today', f'{src}/{sc}-today.png', None), ('A2: plan arc, panel', f'{src}/{sc}-A2-panel.png', None), ('D: tape on the deck', f'{src}/{sc}-D.png', None)], 700, 3)
    sheet(f'zoom-{sc}.png', [(f'{t}: today', f'{src}/{sc}-today.png', TODAY), ('A2 with panel', f'{src}/{sc}-A2-panel.png', A2), ('A2 bare', f'{src}/{sc}-A2-bare.png', A2), ('D, band as is', f'{src}/{sc}-D.png', D), ('D, band put away', f'{src}/{sc}-D-bandaway.png', D)], 620, 3)
for fn in os.listdir(src):
    if fn.endswith('.png'): Image.open(os.path.join(src, fn)).save(os.path.join(dst, 'frames', fn), optimize=True)

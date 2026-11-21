import sys, os
from PIL import Image, ImageDraw, ImageFont
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except Exception: f = ImageFont.load_default()
def sheet(name, items, cols):
    W = 700; ims = []
    for label, path in items:
        im = Image.open(path).convert('RGB'); h = round(im.height * W / im.width); ims.append((label, im.resize((W, h), Image.LANCZOS)))
    H = ims[0][1].height; rows = (len(ims) + cols - 1) // cols
    out = Image.new('RGB', (W * cols + 8 * (cols - 1), (H + 34) * rows), (11, 28, 40)); d = ImageDraw.Draw(out)
    for i, (label, im) in enumerate(ims):
        x, y = (i % cols) * (W + 8), (i // cols) * (H + 34)
        d.text((x + 10, y + 6), label, fill=(255, 182, 39), font=f); out.paste(im, (x, y + 34))
    out.save(os.path.join(dst, name))
for sc, title in [('12kt-port', '12 kt beat, port tack'), ('12kt-stbd', '12 kt beat, starboard tack'), ('22kt', '22 kt beat, overpowered'), ('4kt', '4 kt beat, light')]:
    sheet(f'compare-{sc}.png', [(f'{title}: today', f'{src}/{sc}-today.png'), ('A: tiller arc', f'{src}/{sc}-A.png'), ('B: the cursor', f'{src}/{sc}-B.png')], 3)
sheet('C-sequence.png', [('C1: a puff loads it, held', f'{src}/C1-puff-held-A.png'), ('C2: let go, she rounds up', f'{src}/C2-let-go-A.png'), ('C3: the stall goes light', f'{src}/C3-stall-light-A.png')], 3)
for fn in os.listdir(src):
    if fn.endswith('.png'):
        os.makedirs(os.path.join(dst, 'frames'), exist_ok=True); Image.open(os.path.join(src, fn)).save(os.path.join(dst, 'frames', fn), optimize=True)

# zoomed crops of the part of the screen each direction uses
def zoom(name, items, cols, W=640):
    ims = []
    for label, path, box in items:
        im = Image.open(path).convert('RGB').crop(box); h = round(im.height * W / im.width); ims.append((label, im.resize((W, h), Image.LANCZOS)))
    H = max(i[1].height for i in ims); out = Image.new('RGB', (W * cols + 8 * (cols - 1), H + 34), (11, 28, 40)); d = ImageDraw.Draw(out)
    for i, (label, im) in enumerate(ims):
        x = i * (W + 8); d.text((x + 10, 6), label, fill=(255, 182, 39), font=f); out.paste(im, (x, 34))
    out.save(os.path.join(dst, name))
TODAY = (500, 180, 900, 700); ARC = (470, 615, 720, 700); CUR = lambda ang: (int(700 + ang * 5) - 130, 470, int(700 + ang * 5) + 130, 640)
for sc, title, ang in [('12kt-port', '12 kt, port', -3.0), ('12kt-stbd', '12 kt, starboard', 3.5), ('22kt', '22 kt, overpowered', -11), ('4kt', '4 kt, light', -0.5)]:
    zoom(f'zoom-{sc}.png', [(f'{title}: today', f'{src}/{sc}-today.png', TODAY), ('A: arc', f'{src}/{sc}-A.png', ARC), ('B: cursor', f'{src}/{sc}-B.png', CUR(ang))], 3)
zoom('zoom-C-sequence.png', [('C1: held against the puff', f'{src}/C1-puff-held-A.png', ARC), ('C2: let go', f'{src}/C2-let-go-A.png', ARC), ('C3: stall, light', f'{src}/C3-stall-light-A.png', ARC)], 3)

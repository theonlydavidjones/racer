import sys, os, shutil
from PIL import Image, ImageDraw, ImageFont
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 24)
for fn in sorted(os.listdir(src)):
    if fn.endswith('.png'): shutil.copy(os.path.join(src, fn), os.path.join(dst, fn))  # the full frames, as taken
def horizon(path):
    im = Image.open(path).convert('RGB'); px = im.load(); best, by = 0, 0
    for y in range(100, 700):  # the biggest brightness drop down column x=40 and x=1300 (sky to sea)
        d = sum(sum(px[x, y - 3]) - sum(px[x, y + 3]) for x in (40, 1300)) 
        if d > best: best, by = d, y
    return by
def sheet(name, items, cols, W):
    ims = []
    for label, path, box in items:
        im = Image.open(path).convert('RGB')
        if box: im = im.crop(box)
        ims.append((label, im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)))
    H = max(i[1].height for i in ims); rows = (len(ims) + cols - 1) // cols
    out = Image.new('RGB', (W * cols + 8 * (cols - 1), (H + 38) * rows), (11, 28, 40)); d = ImageDraw.Draw(out)
    for i, (label, im) in enumerate(ims):
        x, y = (i % cols) * (W + 8), (i // cols) * (H + 38); d.text((x + 10, y + 6), label, fill=(255, 182, 39), font=f); out.paste(im, (x, y + 38))
    out.save(os.path.join(dst, name))
S = [('12kt-port', '12 kt, port'), ('12kt-stbd', '12 kt, starboard'), ('22kt', '22 kt')]
# zoom A3: the tab on the open band, and the tab alone with the band away
sheet('zoom-A3.png', sum([[(f'{t}: band open', f'{src}/{s}-A3-band-open.png', (520, 590, 830, 720)), (f'{t}: band away', f'{src}/{s}-A3-band-away.png', (520, 730, 830, 860))] for s, t in S], []), 2, 700)
sheet('zoom-D2.png', [(f'{t}: D2', f'{src}/{s}-D2.png', (430, 330, 930, 700)) for s, t in S], 3, 640)
for s, t in S:
    h0, h1 = horizon(f'{src}/{s}-today.png'), horizon(f'{src}/{s}-D2.png')
    sheet(f'D2-vs-today-{s}.png', [(f'{t}: today', f'{src}/{s}-today.png', None), (f'{t}: D2, camera tipped down', f'{src}/{s}-D2.png', None)], 2, 900)
    print(s, 'horizon today', h0, 'D2', h1)

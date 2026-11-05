# HARD ENTRY のアイコン: 暗い地に、扉の枠と、開いた扉から差す青い光、下に HARD / ENTRY
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import sys
OUT = sys.argv[1]
BLACK = '/usr/share/fonts/opentype/inter/Inter-Black.otf'
def make(S, maskable=False):
    im = Image.new('RGB', (S, S), (7, 9, 12))
    d = ImageDraw.Draw(im)
    # 縦のグラデーション
    for y in range(S):
        t = y / S
        c = (int(9 + 10 * t), int(12 + 13 * t), int(17 + 18 * t))
        d.line([(0, y), (S, y)], fill=c)
    k = 0.78 if maskable else 1.0   # maskable は中央に寄せる
    cx, cy = S / 2, S / 2
    def P(x, y): return (cx + (x - 0.5) * S * k, cy + (y - 0.5) * S * k)
    # 扉の枠（白）と、少し開いた扉（暗い板）、すき間から差す青い光
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    x0, y0 = P(0.30, 0.13); x1, y1 = P(0.70, 0.62)
    g.polygon([P(0.47, 0.17), P(0.66, 0.17), P(0.86, 0.66), P(0.40, 0.66)], fill=(74, 168, 255, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.03))
    im.paste(glow, (0, 0), glow)
    d = ImageDraw.Draw(im)
    fw = max(2, int(S * 0.028))
    d.rectangle([P(0.30, 0.13), P(0.70, 0.62)], outline=(232, 236, 240), width=fw)
    # すき間の光（明るい青）
    d.polygon([P(0.49, 0.16), P(0.67, 0.16), P(0.67, 0.6), P(0.49, 0.6)], fill=(110, 190, 255))
    # 扉の板（内側へ開いて斜めに見える）
    d.polygon([P(0.32, 0.155), P(0.49, 0.19), P(0.49, 0.575), P(0.32, 0.6)], fill=(28, 34, 44), outline=(60, 70, 84))
    d.ellipse([P(0.445, 0.38), P(0.47, 0.405)], fill=(200, 205, 210))
    # 床の線
    d.line([P(0.18, 0.62), P(0.82, 0.62)], fill=(232, 236, 240), width=fw)
    # 文字
    f1 = ImageFont.truetype(BLACK, int(S * 0.165 * k))
    for txt, yy, col in (('HARD', 0.665, (240, 242, 245)), ('ENTRY', 0.80, (74, 168, 255))):
        w = d.textlength(txt, font=f1)
        px, py = P(0.5, yy)
        d.text((px - w / 2, py), txt, font=f1, fill=col)
    return im
for s in (180, 192, 512):
    make(s).save(f'{OUT}/icon-{s}.png', optimize=True)
make(512, True).save(f'{OUT}/icon-512-maskable.png', optimize=True)
print('ok')

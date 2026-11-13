# WAR BIT のアイコン: 暗い地に、独自のブロック文字で WAR（白）と BIT（琥珀色）を2段に。1升ずらした影。
# 文字の形はタイトルのロゴ（src/ui/screens.js の GLYPH）と同じ 5×7 の升目
from PIL import Image, ImageDraw
import sys
OUT = sys.argv[1]
GLYPH = {
    'W': ['X...X', 'X...X', 'X...X', 'X.X.X', 'X.X.X', 'XX.XX', 'X...X'],
    'A': ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
    'R': ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
    'B': ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X...X', 'X...X', 'XXXX.'],
    'I': ['XXX', '.X.', '.X.', '.X.', '.X.', '.X.', 'XXX'],
    'T': ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
}
def word_w(w): return sum(len(GLYPH[c][0]) + 1 for c in w) - 1
def make(S, maskable=False):
    im = Image.new('RGB', (S, S), (14, 17, 20))
    d = ImageDraw.Draw(im)
    for y in range(S):
        t = y / S
        d.line([(0, y), (S, y)], fill=(int(16 + 14 * t), int(20 + 14 * t), int(18 + 10 * t)))
    k = 0.56 if maskable else 0.7   # maskable は中央に寄せる（角の丸みで切れないように）
    # 升目の大きさ: 横は WAR（17升）が入るように、縦は 2段（7＋3＋7 升）
    cell = S * k / max(word_w('WAR'), 17)
    tot_h = cell * 17
    y0 = (S - tot_h) / 2
    for row, (word, col) in enumerate((('WAR', (244, 241, 234)), ('BIT', (242, 179, 61)))):
        x = (S - word_w(word) * cell) / 2
        yy = y0 + row * cell * 10
        for ch in word:
            g = GLYPH[ch]
            for j, line in enumerate(g):
                for i, c in enumerate(line):
                    if c != 'X': continue
                    px, py = x + i * cell, yy + j * cell
                    d.rectangle([px + cell * 0.4, py + cell * 0.4, px + cell * 1.4, py + cell * 1.4], fill=(0, 0, 0))
            for j, line in enumerate(g):
                for i, c in enumerate(line):
                    if c != 'X': continue
                    px, py = x + i * cell, yy + j * cell
                    d.rectangle([px, py, px + cell * 1.02, py + cell * 1.02], fill=col)
            x += (len(g[0]) + 1) * cell
    return im
for s in (180, 192, 512):
    make(s).save(f'{OUT}/icon-{s}.png', optimize=True)
make(512, True).save(f'{OUT}/icon-512-maskable.png', optimize=True)
print('ok')

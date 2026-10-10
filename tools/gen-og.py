"""生成 og-cover.png（1200x630 分享卡片）
用法：python tools/gen-og.py
改完 data.js 后重跑一次即可同步封面文字。
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'og-cover.png')

TITLE = '钟意 · 作品导航'
SUB = 'Web 全栈开发工程师 · 网页 / 小程序 / 小游戏 / 应用定制'
DOMAIN = 'zhongyiya.cn'

BG = (251, 251, 252)
TEXT = (22, 22, 26)
MUTED = (107, 107, 118)
ACCENT = (79, 70, 229)
CARD = (255, 255, 255)
BORDER = (236, 236, 240)

W, H = 1200, 630


def font(size, bold=False):
    candidates = [
        'C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc',
        'C:/Windows/Fonts/msyh.ttc',
        '/System/Library/Fonts/PingFang.ttc',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def center(draw, y, text, f, fill):
    bbox = draw.textbbox((0, 0), text, font=f)
    x = (W - (bbox[2] - bbox[0])) / 2 - bbox[0]
    draw.text((x, y), text, font=f, fill=fill)


img = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(img)

# 头像：优先用 assets/avatar.jpg 圆形裁剪，没有则回退姓氏首字
r = 52
cx, cy = W // 2, 150
avatar_path = os.path.join(ROOT, 'assets', 'avatar.jpg')
if os.path.exists(avatar_path):
    src = Image.open(avatar_path).convert('RGB')
    side = min(src.size)
    sx0 = (src.width - side) // 2
    sy0 = (src.height - side) // 2
    mask = Image.new('L', (side, side), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, side, side], fill=255)
    avatar = src.crop((sx0, sy0, sx0 + side, sy0 + side)).resize((r * 2, r * 2), Image.LANCZOS)
    mask = mask.resize((r * 2, r * 2), Image.LANCZOS)
    img.paste(avatar, (cx - r, cy - r), mask)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=BORDER, width=3)
else:
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(238, 240, 255))
    initial = TITLE[0] if TITLE else 'Z'
    f_init = font(46, True)
    ib = d.textbbox((0, 0), initial, font=f_init)
    d.text((cx - (ib[2] - ib[0]) / 2 - ib[0], cy - (ib[3] - ib[1]) / 2 - ib[1]), initial, font=f_init, fill=ACCENT)

center(d, 236, TITLE, font(60, True), TEXT)
center(d, 330, SUB, font(28), MUTED)

# 底部站点色块
colors = [(79, 70, 229), (15, 118, 110), (180, 83, 9), (24, 95, 165), (153, 53, 86), (95, 94, 90)]
bw, bh, gap = 150, 88, 18
total = len(colors) * bw + (len(colors) - 1) * gap
sx = (W - total) / 2
sy = 430
for i, c in enumerate(colors):
    x0 = sx + i * (bw + gap)
    d.rounded_rectangle([x0, sy, x0 + bw, sy + bh], radius=14, fill=CARD, outline=BORDER, width=2)
    d.rounded_rectangle([x0 + 16, sy + 18, x0 + 46, sy + 48], radius=10, fill=c)

center(d, 552, DOMAIN, font(22), (154, 154, 166))

img.save(OUT, 'PNG', optimize=True)
print('og-cover.png 已生成 ->', OUT)

# -*- coding: utf-8 -*-
"""Export the contour cutouts into the game's asset folder."""
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, ".cache", "cutouts")
DST = os.path.join(ROOT, "assets", "faces")
os.makedirs(DST, exist_ok=True)

labels = ["ピンク", "ドアップ", "紫メガネ", "ポテチ", "クマ", "爆笑", "虹色漢", "siva", "siva・暴", "坊主", "大坊主"]
sheet = Image.new("RGB", (6 * 260, 2 * 290), (18, 15, 30))
d = ImageDraw.Draw(sheet)
font = ImageFont.truetype("C:/Windows/Fonts/meiryo.ttc", 18)
for i, label in enumerate(labels):
    im = Image.open(os.path.join(SRC, f"cut{i}.png")).convert("RGBA")
    im.save(os.path.join(DST, f"face{i}.webp"), "WEBP", quality=92, alpha_quality=96, method=6)
    print(i, os.path.getsize(os.path.join(DST, f"face{i}.webp")))
    thumb = im.resize((240, 240), Image.LANCZOS)
    x = (i % 6) * 260 + 10
    y = (i // 6) * 290 + 30
    sheet.paste(thumb, (x, y), thumb)
    d.text((x, y - 24), f"{i} {label}", fill=(255, 240, 200), font=font)
sheet.save(os.path.join(ROOT, "preview_faces.jpg"), quality=90)

# square favicon with a dark rounded tile
face = Image.open(os.path.join(SRC, "cut10.png")).convert("RGBA")
tile = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
td = ImageDraw.Draw(tile)
td.rounded_rectangle((0, 0, 127, 127), 28, fill=(18, 13, 32, 255))
face = face.resize((118, 118), Image.LANCZOS)
tile.alpha_composite(face, (5, 5))
tile.save(os.path.join(ROOT, "assets", "favicon.png"))
print("done")

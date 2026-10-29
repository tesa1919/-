# -*- coding: utf-8 -*-
"""Segment head cutouts along their natural contour from the source photos with high-precision alpha matting."""
from rembg import remove, new_session
from PIL import Image, ImageDraw, ImageFilter
import os

SRC = r"C:\Users\USER\Downloads\otakugame"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(ROOT, "assets", "faces")
os.makedirs(DST, exist_ok=True)

ITEMS = [
    ("61677.jpg", (0, 0, 205, 205), 105, 45, 135, 160, "ピンク"),
    ("61671.jpg", (0, 150, 1024, 1412), 480, 420, 1080, 1220, "ドアップ"),
    ("61666.jpg", (120, 380, 1000, 1330), 440, 210, 580, 705, "紫メガネ"),
    ("61667.jpg", (100, 40, 1000, 1310), 450, 230, 720, 840, "ポテチ"),
    ("61668.jpg", (390, 380, 810, 1030), 210, 140, 400, 475, "クマ"),
    ("61679.jpg", (0, 160, 850, 1250), 400, 260, 620, 735, "爆笑"),
    ("虹色漢.jpg", (150, 320, 900, 1260), 370, 250, 590, 705, "虹色漢"),
    (r"siva\61675.jpg", (340, 140, 740, 600), 195, 80, 280, 335, "siva"),
    (r"siva\関智一.jpg", (880, 0, 1300, 430), 225, 160, 310, 380, "siva・暴"),
    ("坊主.jpg", (150, 290, 810, 1270), 360, 240, 770, 905, "坊主"),
    ("大坊主.jpg", (550, 20, 1100, 600), 176, 105, 295, 365, "大坊主"),
]

SIZE = 512
PAD = 20

session = new_session("u2net_human_seg")
sheet = Image.new("RGB", (6 * 260, 2 * 290), (18, 15, 30))

for idx, (rel, box, cx, jw, jy, cy, label) in enumerate(ITEMS):
    fp = os.path.join(SRC, rel)
    im = Image.open(fp).convert("RGB").crop(box)
    w, h = im.size

    # 1. 高精度アルファマッティング(毛先や微細な境界をアンチエイリアス保持)
    cut = remove(
        im,
        session=session,
        post_process_mask=False,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=6,
    ).convert("RGBA")

    # 2. 自然な顎ライン(フェイスライン)で首・服のみを滑らかに除去
    mask = Image.new("L", (w, h), 255)
    md = ImageDraw.Draw(mask)
    curve_pts = []
    steps = 24
    for i in range(steps + 1):
        t = i / steps
        x_rel = -jw + 2 * jw * t
        norm_x = abs(x_rel) / jw
        curve_factor = max(0, 1.0 - norm_x ** 1.8)
        y_pos = jy + (cy - jy) * curve_factor
        curve_pts.append((cx + x_rel, y_pos))

    poly = [(0, jy)] + curve_pts + [(w, jy), (w, h), (0, h)]
    md.polygon(poly, fill=0)
    mask = mask.filter(ImageFilter.GaussianBlur(2.0))

    alpha = cut.getchannel("A")
    new_alpha = Image.composite(alpha, Image.new("L", (w, h), 0), mask)
    cut.putalpha(new_alpha)

    # 3. クロップ & センタリング(白フチなし、純粋な透過写真素材)
    bbox = new_alpha.getbbox()
    if not bbox:
        continue
    cut = cut.crop(bbox)
    cw, ch = cut.size
    scale = (SIZE - PAD * 2) / max(cw, ch)
    nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
    scaled = cut.resize((nw, nh), Image.LANCZOS)

    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(scaled, ((SIZE - nw) // 2, (SIZE - nh) // 2))

    out_webp = os.path.join(DST, f"face{idx}.webp")
    canvas.save(out_webp, "WEBP", quality=95, alpha_quality=98, method=6)
    print(f"Exported face{idx}.webp ({label})")

    thumb = canvas.resize((240, 240), Image.LANCZOS)
    x = (idx % 6) * 260 + 10
    y = (idx // 6) * 290 + 30
    sheet.paste(thumb, (x, y), thumb)

sheet.save(os.path.join(ROOT, "preview_faces.jpg"), quality=92)
print("Updated preview_faces.jpg")

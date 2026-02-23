from PIL import Image, ImageDraw
import numpy as np
import os

SRC = os.path.join(os.path.dirname(__file__), "..", "assets", "icon.png")
OUT = SRC
BG = np.array([11, 18, 32], dtype=np.uint8)
SCALE = 0.65

img = Image.open(SRC).convert("RGB")
px = np.array(img)
h, w, _ = px.shape
print(f"Loaded {w}x{h}")

is_figure = np.any(px != BG, axis=-1)
fig_count = is_figure.sum()
print(f"Figure pixels: {fig_count:,}")
if fig_count == 0:
    print("No figure pixels found")
    exit(1)

fig_rows = np.any(is_figure, axis=1)
fig_cols = np.any(is_figure, axis=0)
r_min, r_max = np.where(fig_rows)[0][[0, -1]]
c_min, c_max = np.where(fig_cols)[0][[0, -1]]
fig_h = r_max - r_min + 1
fig_w = c_max - c_min + 1
print(f"Figure bbox: {fig_w}x{fig_h}")

fig_crop_rgb = img.crop((c_min, r_min, c_max + 1, r_max + 1))
fig_mask_arr = (is_figure[r_min:r_max+1, c_min:c_max+1] * 255).astype(np.uint8)
fig_mask = Image.fromarray(fig_mask_arr)
fig_crop = fig_crop_rgb.convert("RGBA")
fig_crop.putalpha(fig_mask)

new_fig_w = int(fig_w * SCALE)
new_fig_h = int(fig_h * SCALE)
fig_small = fig_crop.resize((new_fig_w, new_fig_h), Image.LANCZOS)
print(f"Shrunk to {new_fig_w}x{new_fig_h}")

canvas = Image.new("RGB", (w, h), tuple(BG))
cx_pos = (w - new_fig_w) // 2
cy_pos = (h - new_fig_h) // 2
canvas.paste(fig_small, (cx_pos, cy_pos), fig_small)

radius = int(min(w, h) * 0.12)
mask_img = Image.new("L", (w, h), 0)
ImageDraw.Draw(mask_img).rounded_rectangle([(0, 0), (w-1, h-1)], radius=radius, fill=255)
corner_arr = np.array(mask_img) <= 128
out = np.array(canvas)
out[corner_arr] = BG
Image.fromarray(out).save(OUT, "PNG")
print(f"Saved to {os.path.abspath(OUT)}")

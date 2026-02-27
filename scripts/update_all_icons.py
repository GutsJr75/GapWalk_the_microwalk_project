#!/usr/bin/env python3
"""Regenerate Android launcher icons and theme-aware splash logos from assets/icon.png."""
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "assets", "icon.png")
BRAND_MARK_OUT = os.path.join(ROOT, "assets", "icons", "brand-mark.png")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

SPLASH_SIZES = {
    "drawable-mdpi": 144,
    "drawable-hdpi": 216,
    "drawable-xhdpi": 288,
    "drawable-xxhdpi": 432,
    "drawable-xxxhdpi": 576,
}

LAUNCHER_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

SPLASH_STYLE = {
    "dark": {
        "tile": (7, 26, 46),
        "mark": (46, 233, 166),
    },
    "light": {
        "tile": (237, 241, 247),
        "mark": (4, 120, 87),
    },
}

BG_TOLERANCE = 24
MIN_FIGURE_PIXELS = 600
MARK_HEIGHT_RATIO = 0.42
CORNER_RADIUS_RATIO = 0.21


def detect_background(rgb: np.ndarray) -> np.ndarray:
    border_pixels = np.concatenate(
        [rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]],
        axis=0,
    )
    return np.median(border_pixels, axis=0).astype(np.uint8)


def extract_brand_mark(source_rgb: Image.Image) -> Image.Image:
    rgb = np.array(source_rgb, dtype=np.uint8)
    bg = detect_background(rgb)
    diff = np.abs(rgb.astype(np.int16) - bg.astype(np.int16)).sum(axis=2)
    is_figure = diff > BG_TOLERANCE
    figure_pixels = int(is_figure.sum())

    print(f"Detected source background: {tuple(int(v) for v in bg)}")
    print(f"Figure pixels: {figure_pixels:,}")
    if figure_pixels < MIN_FIGURE_PIXELS:
        raise RuntimeError(
            "Could not extract the walking mark from assets/icon.png (too few figure pixels)."
        )

    rows = np.where(is_figure.any(axis=1))[0]
    cols = np.where(is_figure.any(axis=0))[0]
    if rows.size == 0 or cols.size == 0:
        raise RuntimeError("Could not extract the walking mark from assets/icon.png.")

    r_min, r_max = rows[[0, -1]]
    c_min, c_max = cols[[0, -1]]
    fig_h = int(r_max - r_min + 1)
    fig_w = int(c_max - c_min + 1)
    print(f"Figure bbox: {fig_w}x{fig_h}")

    alpha = (is_figure[r_min:r_max + 1, c_min:c_max + 1] * 255).astype(np.uint8)
    mark = np.zeros((fig_h, fig_w, 4), dtype=np.uint8)
    mark[..., :3] = 255  # White mark lets UI/splash tint this shape safely.
    mark[..., 3] = alpha
    return Image.fromarray(mark, mode="RGBA")


def tint_rgba(mask_rgba: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    tinted = Image.new("RGBA", mask_rgba.size, rgb + (255,))
    out = Image.new("RGBA", mask_rgba.size, (0, 0, 0, 0))
    out.paste(tinted, (0, 0), mask_rgba.split()[-1])
    return out


def compose_splash_logo(
    mark_mask: Image.Image,
    size: int,
    tile_color: tuple[int, int, int],
    mark_color: tuple[int, int, int],
) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rounded_mask = Image.new("L", (size, size), 0)
    radius = max(1, int(size * CORNER_RADIUS_RATIO))
    ImageDraw.Draw(rounded_mask).rounded_rectangle(
        [(0, 0), (size - 1, size - 1)],
        radius=radius,
        fill=255,
    )

    tile = Image.new("RGBA", (size, size), tile_color + (255,))
    canvas.paste(tile, (0, 0), rounded_mask)

    target_h = max(1, int(size * MARK_HEIGHT_RATIO))
    scale = target_h / mark_mask.height
    target_w = max(1, int(mark_mask.width * scale))
    mark_resized = mark_mask.resize((target_w, target_h), Image.LANCZOS)
    mark_tinted = tint_rgba(mark_resized, mark_color)

    pos = ((size - target_w) // 2, (size - target_h) // 2)
    canvas.alpha_composite(mark_tinted, pos)
    return canvas


def write_splash_assets(mark_mask: Image.Image) -> None:
    for folder, size in SPLASH_SIZES.items():
        day_logo = compose_splash_logo(
            mark_mask,
            size,
            SPLASH_STYLE["light"]["tile"],
            SPLASH_STYLE["light"]["mark"],
        )
        day_out = os.path.join(RES, folder, "splashscreen_logo.png")
        os.makedirs(os.path.dirname(day_out), exist_ok=True)
        day_logo.save(day_out, "PNG")
        print(f"  Splash day: {folder}/splashscreen_logo.png ({size}x{size})")

        night_folder = folder.replace("drawable-", "drawable-night-")
        night_logo = compose_splash_logo(
            mark_mask,
            size,
            SPLASH_STYLE["dark"]["tile"],
            SPLASH_STYLE["dark"]["mark"],
        )
        night_out = os.path.join(RES, night_folder, "splashscreen_logo.png")
        os.makedirs(os.path.dirname(night_out), exist_ok=True)
        night_logo.save(night_out, "PNG")
        print(f"  Splash night: {night_folder}/splashscreen_logo.png ({size}x{size})")


def write_launcher_assets(source_rgb: Image.Image) -> None:
    for folder, size in LAUNCHER_SIZES.items():
        resized = source_rgb.resize((size, size), Image.LANCZOS)
        fd, tmp_png = tempfile.mkstemp(suffix=".png")
        os.close(fd)
        try:
            resized.save(tmp_png, "PNG")
            for name in ["ic_launcher_foreground", "ic_launcher", "ic_launcher_round"]:
                out_path = os.path.join(RES, folder, f"{name}.webp")
                if os.path.exists(out_path):
                    subprocess.run(
                        ["cwebp", "-q", "90", tmp_png, "-o", out_path],
                        capture_output=True,
                        check=True,
                    )
                    print(f"  Launcher: {folder}/{name}.webp ({size}x{size})")
        finally:
            if os.path.exists(tmp_png):
                os.remove(tmp_png)


def main() -> None:
    source_rgb = Image.open(SRC).convert("RGB")
    print(f"Source icon: {source_rgb.size[0]}x{source_rgb.size[1]}")

    mark_mask = extract_brand_mark(source_rgb)
    os.makedirs(os.path.dirname(BRAND_MARK_OUT), exist_ok=True)
    mark_mask.save(BRAND_MARK_OUT, "PNG")
    print(f"  Brand mark: assets/icons/brand-mark.png ({mark_mask.size[0]}x{mark_mask.size[1]})")

    write_splash_assets(mark_mask)
    write_launcher_assets(source_rgb)
    print("Done - all icons updated")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Regenerate all Android launcher icons and splash logos from assets/icon.png"""
from PIL import Image
import subprocess
import os
import tempfile

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "assets", "icon.png")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

img = Image.open(SRC).convert("RGB")
print(f"Source icon: {img.size[0]}x{img.size[1]}")

# Splash screen logos (PNG) — crisp but not huge (very large PNGs can cause OOM on some devices)
splash_sizes = {
    "drawable-mdpi": 144,
    "drawable-hdpi": 216,
    "drawable-xhdpi": 288,
    "drawable-xxhdpi": 432,
    "drawable-xxxhdpi": 576,
}

for folder, size in splash_sizes.items():
    out_path = os.path.join(RES, folder, "splashscreen_logo.png")
    resized = img.resize((size, size), Image.LANCZOS)
    resized.save(out_path, "PNG")
    print(f"  Splash: {folder} ({size}x{size})")

# Launcher icons (webp)
launcher_sizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

for folder, size in launcher_sizes.items():
    resized = img.resize((size, size), Image.LANCZOS)

    # Use mkstemp to avoid Windows file locking issues
    fd, tmp_png = tempfile.mkstemp(suffix=".png")
    os.close(fd)

    try:
        resized.save(tmp_png, "PNG")

        for name in ["ic_launcher_foreground", "ic_launcher", "ic_launcher_round"]:
            out_path = os.path.join(RES, folder, f"{name}.webp")
            if os.path.exists(out_path):
                subprocess.run(["cwebp", "-q", "90", tmp_png, "-o", out_path],
                             capture_output=True, check=True)
                print(f"  Launcher: {folder}/{name}.webp ({size}x{size})")
    finally:
        if os.path.exists(tmp_png):
            os.remove(tmp_png)

print("Done - all icons updated")

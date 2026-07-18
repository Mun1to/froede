# Generates the extension icon PNGs (16/32/48/128) from the master logo
# at docs/brand/froede_logo_png.png. The master canvas has margin around
# the mark (fine for a README image), so this crops to the actual content
# bounding box, pads it back to a square with the same background color
# (no stretching), then downscales - giving a full-bleed icon that stays
# legible at 16px instead of a tiny mark floating in a large white frame.
import os
from collections import Counter
from PIL import Image
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "..", "docs", "brand", "froede_logo_png.png")
OUT = os.path.join(HERE, "..", "packages", "extension", "static", "icons")
os.makedirs(OUT, exist_ok=True)

img = Image.open(SOURCE).convert("RGB")
arr = np.array(img)

# The two most common colors in the source are the canvas margin and the
# solid square fill behind the mark (in that order) - far more reliable
# than sampling a single pixel, which can land on a rounded corner or the
# ring stroke.
counts = Counter(img.getdata())
canvas_bg, mark_color = (c for c, _ in counts.most_common(2))

dist = np.abs(arr.astype(int) - np.array(canvas_bg)).sum(axis=2)
content = dist > 40  # anything far enough from the canvas background color
ys, xs = np.where(content)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
cropped = img.crop((x0, y0, x1, y1))

side = max(cropped.width, cropped.height)
square = Image.new("RGB", (side, side), mark_color)
square.paste(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2))

for size in (16, 32, 48, 128):
    square.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f"icon{size}.png"))
    print(f"icon{size}.png")
print("done ->", os.path.normpath(OUT))

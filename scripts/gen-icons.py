# Generates the extension icon PNGs (16/32/48/128) mirroring
# docs/brand/froede-logo.svg: indigo rounded square, selection frame,
# amber corner handles, text caret. Draws at 512px and downscales.
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "packages", "extension", "static", "icons")
os.makedirs(OUT, exist_ok=True)

S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# background: vertical-ish gradient indigo-900 -> indigo-950, then mask to rounded rect
grad = Image.new("RGBA", (S, S))
gd = ImageDraw.Draw(grad)
top, bottom = (49, 46, 129, 255), (30, 27, 75, 255)
for y in range(S):
    t = y / (S - 1)
    gd.line(
        [(0, y), (S, y)],
        fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)),
    )
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([16, 16, 496, 496], radius=112, fill=255)
img.paste(grad, (0, 0), mask)

# selection frame
d.rounded_rectangle([136, 164, 376, 348], radius=22, outline=(129, 140, 248, 255), width=16)
# text caret
d.rounded_rectangle([242, 204, 270, 308], radius=14, fill=(224, 231, 255, 255))
# corner handles
for cx, cy in [(136, 164), (376, 164), (136, 348), (376, 348)]:
    d.rounded_rectangle(
        [cx - 24, cy - 24, cx + 24, cy + 24],
        radius=12,
        fill=(245, 158, 11, 255),
        outline=(30, 27, 75, 255),
        width=10,
    )

for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f"icon{size}.png"))
    print(f"icon{size}.png")
print("done ->", os.path.normpath(OUT))

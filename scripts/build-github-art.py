#!/usr/bin/env python3
"""Typeset Cove's GitHub artwork using the existing AI-generated background.

Documentation-only tooling: Python 3 + Pillow. Does not call a generation API.
Run from any directory: python3 scripts/build-github-art.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
IVORY = (247, 244, 235)
GREEN = (31, 85, 70)
MUTED = (82, 112, 101)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    names = (
        ["/System/Library/Fonts/Supplemental/Arial Bold.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
        if bold else
        ["/System/Library/Fonts/Supplemental/Arial.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    )
    for name in names:
        if Path(name).is_file():
            return ImageFont.truetype(name, size)
    raise SystemExit("Install Arial or DejaVu Sans to typeset the documentation artwork.")


def compose(width: int, height: int, destination: str) -> None:
    with Image.open(ASSETS / "cove-art.png") as source:
        canvas = ImageOps.fit(source.convert("RGB"), (width, height),
                              method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    # An opaque text area fading into the AI background keeps letters readable.
    veil = Image.new("RGB", canvas.size, IVORY)
    row = Image.new("L", (width, 1))
    row.putdata([255 if x < width * 0.35 else
                 max(0, round(255 * (width * 0.57 - x) / (width * 0.22)))
                 for x in range(width)])
    canvas.paste(veil, (0, 0), row.resize(canvas.size))
    draw = ImageDraw.Draw(canvas)
    scale = width / 1600
    x = round(width * 0.055)

    def text(y: float, value: str, size: int, color=GREEN, bold=False) -> None:
        draw.text((x, round(height * y)), value,
                  font=font(round(size * scale), bold), fill=color)

    text(0.105, "MONASH COVE", 22, bold=True)
    text(0.205, "cove", 150, bold=True)
    text(0.48, "Your coursework.", 45)
    text(0.565, "A clearer view.", 45)
    text(0.76, "Moodle  /  Ed  /  OnTrack  /  Gmail", 24, MUTED)
    text(0.855, "LOCAL-FIRST CAMPUS WORKSPACE", 18, MUTED)
    canvas.save(ASSETS / destination, optimize=True)
    print(f"{destination}: {width}x{height}, {(ASSETS / destination).stat().st_size:,} bytes")


if __name__ == "__main__":
    compose(1600, 720, "cove-banner.png")
    compose(1280, 640, "cove-social.png")

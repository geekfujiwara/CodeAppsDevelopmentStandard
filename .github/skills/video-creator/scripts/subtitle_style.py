"""Shared original Pillow subtitle style for edits and word-timed narration."""
import sys

from PIL import Image, ImageDraw

from common import wrap_text


def subtitle_image(text, font, width=1920, height=1080):
    scale = height / 1080
    lines = wrap_text(text, font, width * .78 - 60 * scale) or [""]
    line_height = int(54 * scale)
    if len(lines) > 2:
        print(f"警告: 字幕が {len(lines)} 行です（2 行以内推奨）: {text[:40]}…", file=sys.stderr)
    box_width = int(max(font.getlength(line) for line in lines) + 60 * scale)
    box_height = int(len(lines) * line_height + 30 * scale)
    image = Image.new("RGBA", (box_width, box_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, box_width, box_height), int(14 * scale), fill=(10, 18, 34, 190))
    for index, line in enumerate(lines):
        draw.text((box_width / 2 - font.getlength(line) / 2, int(12 * scale) + index * line_height),
                  line, font=font, fill=(255, 255, 255))
    return image

"""株主総会 想定問答アシスタントのアイコン（color.png 192x192 / outline.png 32x32）を描く。

モチーフ: 質問（Q）と回答（A）の吹き出しが重なり、右下に根拠の資料（罫線の紙）。配色は紺の背景に、
質問 = 水色・回答 = 金色（アプリの配色と同じ）。outline は白の線画・透明背景。

使い方: python scripts/draw_icons.py [--out <プラグインのフォルダー>]
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

NAVY = (16, 34, 64, 255)
ACCENT = (92, 200, 255, 255)
GOLD = (255, 200, 87, 255)
PAPER = (232, 238, 248, 255)
WHITE = (255, 255, 255, 255)


def font(size: int) -> ImageFont.ImageFont:
    for name in ("seguisb.ttf", "segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def bubble(d: ImageDraw.ImageDraw, box: tuple[int, int, int, int], tail: str, fill, outline=None, width: int = 0) -> None:
    x0, y0, x1, y1 = box
    r = (y1 - y0) // 3
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)
    h = (y1 - y0) // 3
    if tail == "left":
        pts = [(x0 + h, y1 - 2), (x0 + h * 2, y1 - 2), (x0 + h // 2, y1 + h)]
    else:
        pts = [(x1 - h * 2, y1 - 2), (x1 - h, y1 - 2), (x1 - h // 2, y1 + h)]
    d.polygon(pts, fill=fill if fill else None, outline=outline)


def draw_agm_qa_icon(size: int, outline_only: bool = False) -> Image.Image:
    s = size / 192
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if outline_only:
        w = max(1, round(2 * s * 3))
        bubble(d, (int(10 * s), int(26 * s), int(120 * s), int(92 * s)), "left", None, WHITE, w)
        bubble(d, (int(72 * s), int(84 * s), int(182 * s), int(150 * s)), "right", None, WHITE, w)
        return img
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(40 * s), fill=NAVY)
    # 根拠の資料（右下の罫線の紙）
    d.rounded_rectangle((int(118 * s), int(108 * s), int(170 * s), int(170 * s)), radius=int(6 * s), fill=PAPER)
    for i in range(4):
        y = int((122 + i * 11) * s)
        d.line((int(128 * s), y, int(160 * s) - (12 if i == 3 else 0) * s, y), fill=NAVY, width=max(1, int(3 * s)))
    # 質問（Q）と回答（A）の吹き出し
    bubble(d, (int(22 * s), int(28 * s), int(122 * s), int(88 * s)), "left", ACCENT)
    bubble(d, (int(58 * s), int(80 * s), int(150 * s), int(136 * s)), "right", GOLD)
    f = font(int(40 * s))
    d.text((int(72 * s), int(58 * s)), "Q", font=f, fill=NAVY, anchor="mm")
    d.text((int(104 * s), int(108 * s)), "A", font=f, fill=NAVY, anchor="mm")
    return img


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    draw_agm_qa_icon(192).save(args.out / "color.png", optimize=True)
    draw_agm_qa_icon(32, outline_only=True).save(args.out / "outline.png", optimize=True)
    print(f"color.png / outline.png を書き出しました: {args.out}")


if __name__ == "__main__":
    main()

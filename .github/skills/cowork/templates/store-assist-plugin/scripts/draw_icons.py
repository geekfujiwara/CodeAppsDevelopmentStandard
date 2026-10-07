"""店長アシストのアイコン（color 192x192 / outline 32x32）を描く。

モチーフ: 店舗の日よけ（オーニング）と、承認のチェック。
色: アクセントカラー #0E7C66（実在チェーンのブランド色は使わない）。

    python cowork-plugin/draw_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ACCENT = (14, 124, 102, 255)
ACCENT_DARK = (9, 88, 72, 255)
LIGHT = (176, 232, 216, 255)
WHITE = (255, 255, 255, 255)
AMBER = (255, 193, 7, 255)


def draw_store(d: ImageDraw.ImageDraw, s: float, fg, accent_fill, stripe_alt, check_color, outline_only: bool) -> None:
    """192 基準の座標を s 倍して描く。"""

    def r(*xy: float) -> list[float]:
        return [v * s for v in xy]

    lw = max(1, round(6 * s))
    # 建物
    if outline_only:
        d.rectangle(r(44, 92, 148, 156), outline=fg, width=lw)
    else:
        d.rectangle(r(44, 92, 148, 156), fill=fg)
        d.rectangle(r(84, 116, 108, 156), fill=accent_fill)  # 入口
        d.rectangle(r(56, 108, 76, 128), fill=accent_fill)  # 窓
    # 日よけ（ストライプ）
    stripes = 5
    left, right, top, bottom = 34, 158, 56, 92
    width = (right - left) / stripes
    for i in range(stripes):
        x0 = left + i * width
        if outline_only:
            if i % 2 == 0:
                d.polygon(r(x0, top, x0 + width, top, x0 + width, bottom, x0, bottom), fill=fg)
        else:
            d.polygon(r(x0, top, x0 + width, top, x0 + width, bottom, x0, bottom), fill=fg if i % 2 == 0 else stripe_alt)
    for i in range(stripes):
        cx = left + i * width + width / 2
        d.pieslice(r(cx - width / 2, bottom - width / 2, cx + width / 2, bottom + width / 2), 0, 180, fill=fg if (outline_only or i % 2 == 0) else stripe_alt)
    # 承認のチェック（右下の丸）
    if outline_only:
        d.ellipse(r(112, 112, 172, 172), fill=(0, 0, 0, 0), outline=fg, width=lw)
        d.line(r(126, 142, 138, 154, 158, 128), fill=fg, width=lw, joint="curve")
    else:
        d.ellipse(r(108, 108, 176, 176), fill=check_color, outline=WHITE, width=lw)
        d.line(r(124, 142, 138, 156, 160, 128), fill=ACCENT_DARK, width=round(9 * s), joint="curve")


def color_icon() -> Image.Image:
    size = 192
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=36, fill=ACCENT)
    draw_store(d, 1.0, WHITE, ACCENT, LIGHT, AMBER, outline_only=False)
    return img


def outline_icon() -> Image.Image:
    big = 192
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_store(d, 1.0, WHITE, (0, 0, 0, 0), WHITE, WHITE, outline_only=True)
    return img.resize((32, 32), Image.LANCZOS)


if __name__ == "__main__":
    color_icon().save(HERE / "color.png")
    outline_icon().save(HERE / "outline.png")
    print(f"[OK] {HERE / 'color.png'} (192x192) / {HERE / 'outline.png'} (32x32)")

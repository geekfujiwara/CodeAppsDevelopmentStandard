from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
ORANGE = "#EA580C"
NAVY = "#1E293B"
WHITE = "#FFFFFF"


def draw_icon(size: int, outline: bool) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0) if outline else ORANGE)
    draw = ImageDraw.Draw(image)
    scale = size / 192

    def box(values: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
        return tuple(round(value * scale) for value in values)

    stroke = max(2, round(8 * scale))
    color = WHITE
    draw.arc(box((38, 34, 154, 142)), 190, 350, fill=color, width=stroke)
    draw.rectangle(box((49, 91, 143, 119)), fill=color)
    draw.rounded_rectangle(box((31, 112, 161, 143)), radius=round(10 * scale), fill=color)
    draw.line(box((96, 44, 96, 91)), fill=color, width=stroke)
    draw.ellipse(box((78, 153, 89, 164)), fill=color)
    draw.ellipse(box((91, 153, 102, 164)), fill=color)
    draw.ellipse(box((104, 153, 115, 164)), fill=color)
    if not outline:
        draw.line(box((45, 169, 147, 169)), fill=NAVY, width=max(2, round(5 * scale)))
    return image


draw_icon(192, False).save(ROOT / "color.png")
draw_icon(32, True).save(ROOT / "outline.png")

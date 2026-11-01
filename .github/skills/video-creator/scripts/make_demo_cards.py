"""Create a business-process opening card and matching active-step ribbons."""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw

from common import load_font, resolve_font, wrap_text

BG, PANEL, ACCENT, WHITE, MUTED = "#101c2c", "#192d40", "#6edce0", "#f4f8fc", "#becddd"


def fit_font(text, path, size, width, weight="Bold"):
    for candidate in range(size, 17, -1):
        font = load_font(path, candidate, weight)
        if font.getlength(text) <= width:
            return font
    raise ValueError(f"Card text is too long; shorten this label: {text}")


def ribbon_image(workflow, active, font_path):
    if not 2 <= len(workflow) <= 6 or not 1 <= active <= len(workflow):
        raise ValueError("A ribbon needs two to six steps and a valid one-based active step.")
    image = Image.new("RGB", (1920, 94), BG)
    draw = ImageDraw.Draw(image)
    width = (1720 - (len(workflow) - 1) * 30) / len(workflow)
    for index, item in enumerate(workflow):
        left = round(100 + index * (width + 30))
        fill, color = (ACCENT, BG) if index + 1 == active else (PANEL, MUTED)
        draw.rounded_rectangle((left, 14, left + width, 80), 12, fill=fill)
        text = f"{index + 1}  {item['name']}"
        font = fit_font(text, font_path, 24, width - 24, "Bold" if index + 1 == active else "Regular")
        draw.text((left + (width - font.getlength(text)) / 2, 29), text, font=font, fill=color)
        if index + 1 < len(workflow):
            edge = round(left + width + 7)
            draw.line((edge, 47, edge + 16, 47), fill=ACCENT, width=2)
            draw.polygon([(edge + 13, 42), (edge + 19, 47), (edge + 13, 52)], fill=ACCENT)
    return image


def opening_image(script, font_path):
    workflow, opening = script.get("workflow", []), script["opening"]
    benefits = opening["benefits"]
    if not 2 <= len(workflow) <= 6 or not 1 <= len(benefits) <= 3:
        raise ValueError("The opening needs two to six workflow steps and one to three benefits.")
    image = Image.new("RGB", (1920, 1080), BG)
    draw = ImageDraw.Draw(image)

    def center(text, y, size, color=WHITE, weight="Bold"):
        font = fit_font(text, font_path, size, 1720, weight)
        draw.text(((1920 - font.getlength(text)) / 2, y), text, font=font, fill=color)

    center(opening.get("kicker", "BUSINESS DEMO | Fictional data"), 65, 30, ACCENT)
    center(opening["title"], 135, 60)
    center(opening["subtitle"], 230, 31, MUTED, "Regular")
    center("THE BUSINESS PROCESS", 335, 24, ACCENT)
    width = (1720 - (len(workflow) - 1) * 30) / len(workflow)
    for index, step in enumerate(workflow):
        left = round(100 + index * (width + 30))
        draw.rounded_rectangle((left, 405, left + width, 615), 20, fill=PANEL, outline="#38566d", width=2)
        draw.ellipse((left + 24, 426, left + 70, 472), fill=ACCENT)
        draw.text((left + 39, 430), str(index + 1), font=load_font(font_path, 25), fill=BG)
        font = fit_font(step["name"], font_path, 27, width - 48)
        draw.text((left + 24, 495), step["name"], font=font, fill=WHITE)
        font = load_font(font_path, 22, "Regular")
        lines = wrap_text(step["purpose"], font, width - 48)
        if len(lines) > 2:
            raise ValueError(f"Shorten this step's plain-language purpose: {step['purpose']}")
        for line_index, line in enumerate(lines):
            draw.text((left + 24, 549 + line_index * 27), line, font=font, fill=MUTED)
        if index + 1 < len(workflow):
            edge = round(left + width + 6)
            draw.line((edge, 510, edge + 17, 510), fill=ACCENT, width=3)
            draw.polygon([(edge + 17, 503), (edge + 25, 510), (edge + 17, 517)], fill=ACCENT)
    center("THE BUSINESS BENEFIT", 680, 24, ACCENT)
    column_width = 1720 / len(benefits)
    for index, benefit in enumerate(benefits):
        middle = 100 + (index + .5) * column_width
        for key, y, size, weight, color in [
                ("title", 745, 30, "Bold", WHITE), ("detail", 800, 23, "Regular", MUTED)]:
            text = benefit[key]
            font = fit_font(text, font_path, size, column_width - 36, weight)
            draw.text((middle - font.getlength(text) / 2, y), text, font=font, fill=color)
    return image


def main():
    from narrate_video import read_script

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("script", type=Path)
    parser.add_argument("out_dir", type=Path, help="A new directory; existing artwork is never overwritten")
    parser.add_argument("--font")
    args = parser.parse_args()
    script = read_script(args.script)
    font = resolve_font(args.font)
    opening = opening_image(script, font)
    ribbons = [ribbon_image(script["workflow"], step, font) for step in range(1, len(script["workflow"]) + 1)]
    args.out_dir.mkdir(parents=True, exist_ok=False)
    (args.out_dir / "opening").mkdir()
    opening.save(args.out_dir / "opening" / "overview.png")
    for step, image in enumerate(ribbons, 1):
        image.save(args.out_dir / f"workflow-{step}.png")
    print(args.out_dir.resolve())


if __name__ == "__main__":
    main()

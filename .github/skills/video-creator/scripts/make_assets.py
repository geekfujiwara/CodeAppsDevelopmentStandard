"""Generate original conceptual symbols; these are not Microsoft product logos."""

import argparse
from pathlib import Path
from PIL import Image, ImageDraw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path.cwd() / 'capture' / 'icons')
    folder = parser.parse_args().output
    folder.mkdir(parents=True, exist_ok=True)
    for key in ('assistant', 'calendar', 'database', 'conversation', 'code'):
        image = Image.new('RGBA', (96, 96), 'white')
        draw = ImageDraw.Draw(image)
        if key == 'database':
            draw.rectangle((18, 27, 78, 66), fill='#3979ff')
            for y in (18, 37, 56):
                draw.ellipse((18, y, 78, y + 24), fill='#3979ff', outline='#19282f', width=3)
        elif key == 'calendar':
            draw.rounded_rectangle((15, 19, 81, 79), 6, outline='#3979ff', width=5)
            draw.line((16, 37, 80, 37), fill='#3979ff', width=5)
            for x in (30, 49, 68):
                for y in (49, 65):
                    draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill='#19282f')
        elif key == 'conversation':
            draw.rounded_rectangle((14, 16, 81, 65), 12, fill='#3979ff')
            draw.polygon((25, 60, 25, 82, 44, 63), fill='#3979ff')
            draw.line((26, 35, 68, 35), fill='white', width=5)
            draw.line((26, 48, 58, 48), fill='white', width=5)
        elif key == 'code':
            draw.line((34, 25, 16, 48, 34, 71), fill='#3979ff', width=7)
            draw.line((62, 25, 80, 48, 62, 71), fill='#3979ff', width=7)
            draw.line((56, 19, 41, 77), fill='#19282f', width=5)
        else:
            draw.rounded_rectangle((16, 26, 80, 78), 12, fill='#3979ff')
            draw.line((48, 13, 48, 29), fill='#19282f', width=4)
            draw.ellipse((42, 8, 54, 20), fill='#63d7ff', outline='#19282f', width=2)
            for x in (33, 63):
                draw.ellipse((x - 5, 41, x + 5, 51), fill='white')
            draw.line((33, 64, 63, 64), fill='white', width=4)
        image.save(folder / f'{key}.png')


if __name__ == '__main__':
    main()

"""Reusable screen-first motion graphics, independent of the source application."""

import math
import sys
import json
from bisect import bisect_right
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from project_paths import ROOT, SKILL
sys.path.insert(0, str(SKILL / 'scripts'))
from common import load_font, resolve_font

WIDTH, HEIGHT = 1920, 1080
SCREEN_GUTTER = 32
SCREEN_MATTE = '#19282f'
BG = '#101719'
TEXT = '#f1f7fa'
MUTED = '#abc1cb'
ACCENT = '#63d7ff'
BLUE = '#3979ff'
FONT = resolve_font()


def ease(value):
    value = max(0, min(1, value))
    return 1 - (1 - value) ** 3


@lru_cache(maxsize=64)
def font(size, weight='Regular'):
    return load_font(FONT, size, weight)


def text(draw, value, xy, size, color=TEXT, width=1800, weight='Regular'):
    while size > 18 and font(size, weight).getlength(value) > width:
        size -= 1
    if font(size, weight).getlength(value) > width:
        raise ValueError(f'Text does not fit: {value}')
    draw.text(xy, value, font=font(size, weight), fill=color)


@lru_cache(maxsize=1)
def background():
    image = Image.new('RGB', (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)
    for row in range(HEIGHT):
        phase = row / HEIGHT
        draw.line((0, row, WIDTH, row), fill=(16 + round(5 * phase), 23 + round(10 * phase), 25 + round(11 * phase)))
    for column in range(64, WIDTH, 80):
        draw.line((column, 245, column, 985), fill='#203037', width=1)
    for row in range(265, 986, 80):
        draw.line((64, row, 1856, row), fill='#203037', width=1)
    return image


def base_scene(series, scene, index, total):
    image = background().copy()
    if scene.get('kind') == 'title':
        return image
    draw = ImageDraw.Draw(image)
    text(draw, series['eyebrow'], (64, 25), 21, ACCENT, weight='Bold')
    text(draw, scene['title'], (64, 62), 49, width=1792, weight='Bold')
    text(draw, scene['lead'], (66, 128), 25, MUTED, width=1788)
    steps = series['steps']
    track = 1792 / len(steps)
    for step_index, label in enumerate(steps):
        left = round(64 + track * step_index)
        active = step_index + 1 == scene.get('step')
        color = ACCENT if active else '#617d8a'
        draw.line((left, 205, round(left + track - 18), 205), fill=color, width=3 if active else 1)
        text(draw, f'{step_index + 1:02d}  {label}', (left, 172), 22, TEXT if active else MUTED, width=track - 22, weight='Bold' if active else 'Regular')
    return image


@lru_cache(maxsize=32)
def icon(key):
    with Image.open(icon_path(key)) as source:
        image = source.convert('RGBA')
    image.thumbnail((66, 66), Image.Resampling.LANCZOS)
    return image


def icon_path(key):
    if not isinstance(key, str) or not key or any(character not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for character in key):
        raise ValueError('Icon keys must be lowercase names, not filesystem paths')
    for path in (ROOT / 'capture' / 'icons' / f'{key}.png', SKILL / 'assets' / 'icons' / f'{key}.png'):
        if path.is_file():
            return path
    raise FileNotFoundError(f'Provide an authorized {key}.png in the project capture/icons directory')


def rounded_paste(canvas, content, left, top, radius=18):
    mask = Image.new('L', content.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, content.width - 1, content.height - 1), radius, fill=255)
    canvas.paste(content, (left, top), mask)


@lru_cache(maxsize=48)
def screen_asset(path, crop):
    image = screen_source(path)
    return image.crop(crop) if crop else image


@lru_cache(maxsize=24)
def screen_source(path):
    with Image.open(path) as source:
        return source.convert('RGB')


def screen_bounds(motion, seconds):
    source = screen_source(motion['path'])
    full = motion.get('overview', [0, 0, source.width, source.height])
    target = motion.get('crop') or full
    for bounds in (full, target):
        if not (0 <= bounds[0] < bounds[2] <= source.width and 0 <= bounds[1] < bounds[3] <= source.height):
            raise ValueError(f'Crop outside source image: {motion["path"]} {bounds}')
    camera = motion.get('camera')
    if not camera:
        return tuple(target)
    if camera.get('zoom_seconds', 2) <= 0:
        raise ValueError('zoom_seconds must be positive')
    phase = ease((seconds - camera.get('overview_seconds', 3)) / camera.get('zoom_seconds', 2))
    return tuple(first + (second - first) * phase for first, second in zip(full, target))


def screen_frame(base, motion, seconds):
    image = base.copy()
    bounds = screen_bounds(motion, seconds)
    factor = min((1872 - 2 * SCREEN_GUTTER) / (bounds[2] - bounds[0]),
                 (836 - 2 * SCREEN_GUTTER) / (bounds[3] - bounds[1]))
    size = (round((bounds[2] - bounds[0]) * factor), round((bounds[3] - bounds[1]) * factor))
    asset = screen_source(motion['path']).resize(size, Image.Resampling.LANCZOS, box=bounds)
    plate = Image.new('RGB', (asset.width + 2 * SCREEN_GUTTER, asset.height + 2 * SCREEN_GUTTER), SCREEN_MATTE)
    rounded_paste(plate, asset, SCREEN_GUTTER, SCREEN_GUTTER, 6)
    left = (WIDTH - plate.width) // 2
    top = 220 + (836 - plate.height) // 2 + round(20 * (1 - ease(seconds / .7)))
    shadow = Image.new('RGBA', image.size)
    ImageDraw.Draw(shadow).rounded_rectangle((left, top + 12, left + plate.width, top + plate.height + 12), 18, fill=(0, 0, 0, 160))
    image = Image.alpha_composite(image.convert('RGBA'), shadow.filter(ImageFilter.GaussianBlur(14))).convert('RGB')
    rounded_paste(image, plate, left, top)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((left, top, left + plate.width - 1, top + plate.height - 1), 18, outline='#6c8c9b', width=1)
    pointer = motion.get('pointer')
    pointer_start = 5 if motion.get('camera') else 2
    if pointer and pointer_start <= seconds <= pointer_start + 4:
        phase = ease((seconds - pointer_start) / 1.1)
        first, destination = pointer['from'], pointer['point']
        position = [first[axis] + (destination[axis] - first[axis]) * phase for axis in (0, 1)]
        x = left + SCREEN_GUTTER + asset.width * position[0]
        y = top + SCREEN_GUTTER + asset.height * position[1]
        sprite = cursor_sprite().copy()
        alpha = min(1, (seconds - pointer_start) / .2, (pointer_start + 4 - seconds) / .3)
        sprite.putalpha(sprite.getchannel('A').point(lambda value: round(value * alpha)))
        image = image.convert('RGBA')
        image.alpha_composite(sprite, (round(x - 9), round(y - 7)))
    return image.convert('RGB')


@lru_cache(maxsize=1)
def cursor_sprite():
    scale = 3
    size = (64 * scale, 86 * scale)
    points = [(left * scale, top * scale) for left, top in [(9, 7), (16, 62), (29, 46), (54, 41)]]
    shadow = Image.new('RGBA', size)
    ImageDraw.Draw(shadow).polygon([(left + 6, top + 10) for left, top in points], fill=(0, 8, 24, 130))
    image = shadow.filter(ImageFilter.GaussianBlur(9))
    mask = Image.new('L', size, 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    gradient = Image.new('RGBA', size)
    draw = ImageDraw.Draw(gradient)
    for row in range(size[1]):
        phase = row / size[1]
        color = tuple(round(first + (second - first) * phase) for first, second in zip((148, 243, 255), (37, 76, 239)))
        draw.line((0, row, size[0], row), fill=(*color, 255))
    gradient.putalpha(mask)
    image = Image.alpha_composite(image, gradient)
    ImageDraw.Draw(image).line(points + [points[0]], fill='white', width=7, joint='curve')
    return image.resize((64, 86), Image.Resampling.LANCZOS)


def node_layer(node, active=False):
    width, height = node['rect'][2:]
    image = Image.new('RGBA', (width, height))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, width - 1, height - 1), 8, fill='#1d333e' if active else '#19282f', outline=ACCENT if active else '#46616d', width=2)
    offset = 24
    if node.get('icon'):
        draw.rounded_rectangle((24, 22, 104, 102), 8, fill='white')
        asset = icon(node['icon'])
        image.alpha_composite(asset, (64 - asset.width // 2, 62 - asset.height // 2))
        offset = 124
    text(draw, node['label'], (offset, 27), 30, width=width - offset - 20, weight='Bold')
    text(draw, node.get('detail', ''), (24, height - 52), 22, MUTED, width=width - 48)
    return image


@lru_cache(maxsize=128)
def cached_node(serialized, active):
    import json
    return node_layer(json.loads(serialized), active)


def flow_frame(base, motion, seconds):
    import json
    image = base.copy().convert('RGBA')
    nodes = {node['id']: node for node in motion['nodes']}
    draw = ImageDraw.Draw(image)
    for edge_index, edge in enumerate(motion['edges']):
        first, second = nodes[edge['from']], nodes[edge['to']]
        start = (first['rect'][0] + first['rect'][2], first['rect'][1] + first['rect'][3] / 2)
        end = (second['rect'][0], second['rect'][1] + second['rect'][3] / 2)
        start_at = .8 + edge_index * .52
        phase = ease((seconds - start_at) / .9)
        if phase <= 0:
            continue
        middle = (start[0] + end[0]) / 2
        path = [start, (middle, start[1]), (middle, end[1]), end]
        draw.line(path, fill='#527381', width=3, joint='curve')
        draw.polygon([(end[0], end[1]), (end[0] - 12, end[1] - 7), (end[0] - 12, end[1] + 7)], fill=ACCENT)
        lengths = [math.dist(path[index], path[index + 1]) for index in range(3)]
        distance = ((seconds - start_at) % 2.8) / 2.8 * sum(lengths)
        for index, length in enumerate(lengths):
            if distance <= length:
                factor = distance / length if length else 0
                x = path[index][0] + (path[index + 1][0] - path[index][0]) * factor
                y = path[index][1] + (path[index + 1][1] - path[index][1]) * factor
                draw.ellipse((x - 6, y - 6, x + 6, y + 6), fill=ACCENT)
                break
            distance -= length
    for index, node in enumerate(motion['nodes']):
        phase = ease((seconds - index * .12) / .65)
        layer = cached_node(json.dumps(node, sort_keys=True), node.get('hub', False)).copy()
        layer.putalpha(layer.getchannel('A').point(lambda value: round(value * phase)))
        image.alpha_composite(layer, (node['rect'][0], node['rect'][1] + round(18 * (1 - phase))))
    return image.convert('RGB')


def title_frame(base, motion, seconds):
    image = base.copy().convert('RGBA')
    shift = round(24 * (1 - ease(seconds / 1.2)))
    with Image.open(icon_path(motion['icon'])) as source:
        asset = source.convert('RGBA')
    asset.thumbnail((148, 148), Image.Resampling.LANCZOS)
    plate = Image.new('RGB', (184, 184), 'white')
    rounded_paste(image, plate, 868, 252 + shift, 8)
    image.alpha_composite(asset, (960 - asset.width // 2, 344 - asset.height // 2 + shift))
    draw = ImageDraw.Draw(image)
    title = motion['title']
    size = 72
    while font(size, 'Bold').getlength(title) > 1760:
        size -= 1
    text(draw, title, ((WIDTH - font(size, 'Bold').getlength(title)) / 2, 500 + shift), size, width=1760, weight='Bold')
    subtitle = motion['subtitle']
    text(draw, subtitle, ((WIDTH - font(34).getlength(subtitle)) / 2, 614 + shift), 34, MUTED, width=1760)
    draw.line((824, 718 + shift, 1096, 718 + shift), fill=ACCENT, width=3)
    return image.convert('RGB')


@lru_cache(maxsize=8)
def recording_manifest(path):
    manifest = json.loads(Path(path).read_text(encoding='utf-8'))
    frames = manifest['frames']
    if len(frames) < 2 or not math.isfinite(manifest['duration']) or manifest['duration'] <= 0:
        raise ValueError('A recording requires at least two frames and a positive finite duration')
    times = [frame['at'] for frame in frames]
    if times[0] != 0 or any(not math.isfinite(at) for at in times) or any(first >= second for first, second in zip(times, times[1:])) or times[-1] >= manifest['duration']:
        raise ValueError('Recording timestamps must start at zero and increase within its duration')
    for frame in frames:
        candidate = Path(frame['path'])
        if not candidate.is_absolute():
            frame['path'] = str((Path(path).parent / candidate).resolve())
        actual_size = screen_source(frame['path']).size
        if frame.get('size') and tuple(frame['size']) != actual_size:
            raise ValueError('Declared recording dimensions differ from the actual frame')
        frame['size'] = list(actual_size)
    return manifest, [frame['at'] for frame in manifest['frames']]


def recording_timeline(motion):
    manifest, source_times = recording_manifest(motion['recording'])
    gap = motion.get('max_gap_seconds')
    if gap is None:
        return source_times, manifest['duration']
    if not math.isfinite(gap) or gap <= 0:
        raise ValueError('max_gap_seconds must be positive')
    times = [0.0]
    for previous, current in zip(source_times, source_times[1:]):
        times.append(times[-1] + min(current - previous, gap))
    return times, times[-1] + min(manifest['duration'] - source_times[-1], gap)


def recording_frame(base, motion, seconds):
    manifest, _ = recording_manifest(motion['recording'])
    times, duration = recording_timeline(motion)
    at = min(duration, max(0, seconds - motion.get('hold_before', 2)))
    index = max(0, bisect_right(times, at) - 1)
    return screen_frame(base, {**motion, 'path': manifest['frames'][index]['path']}, seconds)


def motion_frame(base, motion, seconds):
    if motion['kind'] == 'screen':
        image = screen_frame(base, motion, seconds)
    elif motion['kind'] == 'title':
        image = title_frame(base, motion, seconds)
    elif motion['kind'] == 'prompt':
        raise ValueError('Reconstructed application screens are not permitted; capture the real application.')
    elif motion['kind'] == 'recording':
        image = recording_frame(base, motion, seconds)
    elif motion['kind'] == 'flow':
        image = flow_frame(base, motion, seconds)
    else:
        raise ValueError(f'Unknown scene kind: {motion["kind"]}')
    duration = motion.get('duration', 1000)
    opacity = min(ease(seconds / .45), ease((duration - seconds) / .45))
    return Image.blend(base.convert('RGB'), image, opacity)
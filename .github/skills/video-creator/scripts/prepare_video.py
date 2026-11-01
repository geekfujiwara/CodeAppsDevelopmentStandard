"""Prepare a screen-first storyboard using only actual captures or labeled diagrams."""

import argparse
import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import ImageDraw

from motion_design import ROOT, SKILL, BG, ACCENT, base_scene, motion_frame, icon_path, recording_timeline, text


def validate_duration(duration, evidence):
    if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
        raise ValueError('Duration must be positive and finite')
    limits = evidence.get('duration_range_seconds')
    if limits is None:
        return
    if (not isinstance(limits, list) or len(limits) != 2
            or any(isinstance(value, bool) or not isinstance(value, (int, float))
                   or not math.isfinite(value) or value <= 0 for value in limits)
            or limits[0] > limits[1]):
        raise ValueError('duration_range_seconds requires two positive finite ordered bounds')
    if not limits[0] <= duration <= limits[1]:
        raise ValueError(f'Duration {duration:.3f}s is outside the requested {limits[0]}-{limits[1]}s range')


def build_role_rows(rows, caption):
    if not isinstance(rows, list) or len(rows) != 2:
        raise ValueError('Use two named role rows with 2-4 ordered stages each')
    roles = []
    nodes, edges = [], []
    for row_index, row in enumerate(rows):
        if (not isinstance(row, dict) or not isinstance(row.get('role'), str) or not row['role'].strip()
                or not isinstance(row.get('steps'), list) or not 2 <= len(row['steps']) <= 4):
            raise ValueError('Use two named role rows with 2-4 ordered stages each')
        roles.append(row['role'].strip())
        width = 400 if len(row['steps']) == 4 else 460
        stride = (1792 - width) / (len(row['steps']) - 1)
        for column_index, entry in enumerate(row['steps']):
            if not isinstance(entry, dict) or not isinstance(entry.get('label'), str) or not entry['label'].strip():
                raise ValueError('Every role stage requires a nonempty label')
            if entry.get('icon'):
                icon_path(entry['icon'])
            node_id = f'{row_index}-{column_index}'
            nodes.append({**entry, 'id': node_id,
                          'rect': [round(64 + stride * column_index), 350 + 310 * row_index, width, 160]})
            if column_index:
                edges.append({'from': f'{row_index}-{column_index - 1}', 'to': node_id})
    if roles[0] == roles[1]:
        raise ValueError('Role rows must have distinct names')
    return {'kind': 'flow', 'nodes': nodes, 'edges': edges, 'caption': caption}


def build_flow(columns, caption):
    if not 2 <= len(columns) <= 4 or any(not 1 <= len(column) <= 3 for column in columns):
        raise ValueError('Use 2-4 diagram columns with 1-3 nodes per column')
    nodes, edges = [], []
    width = 400 if len(columns) == 4 else 460
    stride = (1792 - width) / (len(columns) - 1)
    for column_index, column in enumerate(columns):
        for row_index, entry in enumerate(column):
            if entry.get('icon'):
                icon_path(entry['icon'])
            node = {'id': f'{column_index}-{row_index}', **entry}
            node['rect'] = [round(64 + stride * column_index), round(570 + (row_index - (len(column) - 1) / 2) * 190 - 80), width, 160]
            nodes.append(node)
            if column_index:
                edges.extend({'from': f'{column_index - 1}-{previous}', 'to': node['id']} for previous in range(len(columns[column_index - 1])))
    return {'kind': 'flow', 'nodes': nodes, 'edges': edges, 'caption': caption}


def make_scene(series, index, scene, folder, count):
    if 'ref' in scene or 'prompt' in scene:
        raise ValueError('Use explicit wording and genuine captures; inherited business stories and reconstructed UI are not permitted')
    if scene.get('kind') not in (None, 'title'):
        raise ValueError('Scene content must be title, columns, rows, shot or recording')
    if sum(key in scene for key in ('shot', 'recording', 'columns', 'rows')) + (scene.get('kind') == 'title') != 1:
        raise ValueError('A scene requires exactly one explicit content form')
    base = base_scene(series, scene, index, count)
    duration = scene.get('duration', 12)
    if not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
        raise ValueError('Scene duration must be positive and finite')
    if scene.get('kind') == 'title':
        icon_path(scene['icon'])
        motion = {'kind': 'title', 'title': scene['title'], 'subtitle': scene['lead'], 'icon': scene['icon']}
    elif 'recording' in scene:
        path = (ROOT / 'capture' / scene['recording']).resolve()
        motion = {'kind': 'recording', 'recording': str(path), 'caption': scene['caption'], 'hold_before': 2}
        for key in ('max_gap_seconds', 'crop', 'overview', 'camera', 'result_region'):
            if key in scene:
                motion[key] = scene[key]
        motion['asset_sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
        _, playback = recording_timeline(motion)
        if duration < playback + motion['hold_before']:
            raise ValueError(f'Scene {index + 1} must cover playback plus the initial hold ({playback + 2:.3f}s)')
    elif 'columns' in scene:
        motion = build_flow(scene['columns'], scene['caption'])
    elif 'rows' in scene:
        motion = build_role_rows(scene['rows'], scene['caption'])
        draw = ImageDraw.Draw(base)
        for row_index, row in enumerate(scene['rows']):
            top = 285 + 310 * row_index
            text(draw, row['role'], (64, top), 36, ACCENT, width=1792, weight='Bold')
            draw.line((64, top + 49, 1856, top + 49), fill='#46616d', width=2)
    elif 'shot' in scene:
        path = (ROOT / 'capture' / scene['shot']).resolve()
        motion = {'kind': 'screen', 'path': str(path), 'crop': scene.get('crop', []), 'caption': scene['caption'],
                  'pointer': scene.get('pointer'), 'camera': scene.get('camera', {'overview_seconds': 3, 'zoom_seconds': 2})}
        if scene.get('overview'):
            motion['overview'] = scene['overview']
        motion['asset_sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    else:
        raise ValueError(f'Scene {index + 1} has no authorized capture or labeled diagram')
    motion['duration'] = duration
    base.save(folder / f'{index + 1:02d}.png')
    for label, seconds in [('overview', 1), ('detail', 6), ('result', duration - 1)]:
        motion_frame(base, motion, min(seconds, duration - .1)).save(folder.parent / f'review-{index + 1:02d}-{label}.png')
    return {'image': index, 'duration': duration, 'zoom': [[0, 'full']], 'callouts': [], 'highlights': [], 'subtitles': [],
            'motion': motion, 'review': {'title': scene['title'], 'expected_content': scene.get('caption', scene['lead'])}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, default=ROOT)
    parser.add_argument('--series', default='demo')
    parser.add_argument('--storyboard', type=Path)
    parser.add_argument('--revision', default='v1')
    parser.add_argument('--source', action='store_true')
    args = parser.parse_args()
    for name in (args.series, args.revision):
        if not name or any(character not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for character in name):
            parser.error('Series and revision must be lowercase names, not paths')
    stories = json.loads((args.storyboard or ROOT / 'storyboard.json').read_text(encoding='utf-8'))
    if args.series not in stories:
        parser.error(f'Unknown series: {args.series}; available: {", ".join(stories)}')
    series = stories[args.series]
    if not series['scenes'] or not any(key in series['scenes'][0] for key in ('columns', 'rows')):
        parser.error('Explain the process before showing detailed application screens')
    series['scenes'].insert(0, {'kind': 'title', 'duration': 5, **series['title_card']})
    for scene in series['scenes']:
        validate_duration(scene.get('duration', 12), {})
    validate_duration(sum(scene.get('duration', 12) for scene in series['scenes']), series.get('evidence', {}))
    work = ROOT / 'work' / f'{args.series}-{args.revision}'
    images = work / 'images'
    images.mkdir(parents=True, exist_ok=True)
    (ROOT / 'output').mkdir(parents=True, exist_ok=True)
    segments = [make_scene(series, index, scene, images, len(series['scenes'])) for index, scene in enumerate(series['scenes'])]
    plan = {'name': series.get('name', args.series), 'source': 'source.mp4', 'images_meta': 'source.meta.json',
            'output': {'width': 1920, 'height': 1080, 'fps': 30}, 'design_version': 'screen-first-safe-gutter',
            'renderer_sha256': hashlib.sha256((SKILL / 'scripts' / 'motion_design.py').read_bytes() + (SKILL / 'scripts' / 'render_video.py').read_bytes()).hexdigest(),
            'style': {'accent': ACCENT, 'highlight': ACCENT, 'background': BG, 'font_family': 'Noto Sans JP', 'zoom_seconds': 1, 'zoom_margin': 0, 'callout_accent_bar': False},
            'evidence': series.get('evidence', {}), 'segments': segments}
    (work / 'edit-plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf-8')
    if args.source:
        subprocess.run([sys.executable, '-B', str(SKILL / 'scripts' / 'images_to_source.py'), str(images), '--out', str(work / 'source.mp4'),
                        '--durations', ','.join(str(segment['duration']) for segment in segments)], check=True)
    print(json.dumps({'plan': str(work / 'edit-plan.json'), 'scenes': len(segments), 'duration': sum(segment['duration'] for segment in segments)}))


if __name__ == '__main__':
    main()

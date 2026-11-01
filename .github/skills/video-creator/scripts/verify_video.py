"""Verify final MP4s by full decode, expected timing, and representative frame pixels."""

import json
import argparse
import hashlib
import subprocess
import sys
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from PIL import Image, ImageStat, ImageChops
from motion_design import ROOT, SKILL, SCREEN_GUTTER, SCREEN_MATTE, motion_frame, rounded_paste, cursor_sprite, screen_bounds, screen_source, recording_manifest, recording_timeline, background, text, icon_path

sys.path.insert(0, str(SKILL / 'scripts'))
from video_media import ffmpeg, probe


def verify_loaded_result(frame, region):
    left, top, right, bottom = region
    assert 0 <= left < right <= frame.width and 0 <= top < bottom <= frame.height, 'Result region must be inside the actual frame'
    assert max(ImageStat.Stat(frame.crop(tuple(region))).stddev) >= 10, 'End on the loaded result, not a blank loading panel'


def verify_screen_gutter(base, motion, seconds):
    with patch('motion_design.rounded_paste', wraps=rounded_paste) as placing:
        frame = motion_frame(base, motion, seconds)
    inner, outer = placing.call_args_list
    plate, asset, inset_x, inset_y = inner.args[:4]
    _, _, left, top = outer.args[:4]
    assert inset_x == inset_y == SCREEN_GUTTER >= 32
    assert plate.width - asset.width - inset_x == SCREEN_GUTTER
    assert plate.height - asset.height - inset_y == SCREEN_GUTTER
    assert 24 <= left and left + plate.width <= 1896
    assert 220 <= top and top + plate.height <= 1056
    matte = Image.new('RGB', (1, 1), SCREEN_MATTE).getpixel((0, 0))
    for x, y in (
        (left + 1, top + plate.height // 2),
        (left + plate.width - 2, top + plate.height // 2),
        (left + plate.width // 2, top + 1),
        (left + plate.width // 2, top + plate.height - 2),
    ):
        assert frame.getpixel((x, y)) == matte, 'Keep a clean interior gutter on all four sides'


def verify_plan(plan_path, layout_preview=False):
    work = Path(plan_path).resolve().parent
    plan = json.loads(Path(plan_path).read_text(encoding='utf-8'))
    segments = plan['segments']
    source_checks = []
    assert segments[0]['motion']['kind'] == 'title', 'Start with a standalone title'
    assert segments[0]['duration'] == 5
    assert segments[1]['motion']['kind'] == 'flow', 'Explain the process before detailed screens'
    assert all(segment['motion']['kind'] in ('title', 'flow', 'screen', 'recording') for segment in segments), 'Never reconstruct application UI'
    if not layout_preview:
        assert any(segment['motion']['kind'] in ('screen', 'recording') for segment in segments), 'Add actual captures; diagrams alone are only a layout preview'
    expected = plan.get('evidence', {}).get('required_recordings', [])
    recorded = {Path(segment['motion'].get('recording', '')).name for segment in segments}
    assert set(expected).issubset(recorded), 'Include every required actual recording'
    renderer_hash = hashlib.sha256((SKILL / 'scripts' / 'motion_design.py').read_bytes() + (SKILL / 'scripts' / 'render_video.py').read_bytes()).hexdigest()
    assert plan['renderer_sha256'] == renderer_hash, 'Regenerate plans after changing rendering code'
    for index, segment in enumerate(segments):
        assert not segment.get('subtitles')
        assert segment['zoom'] == [[0, 'full']], 'Camera uses original-resolution sources, not the downscaled intermediate'
        assert not segment.get('rationale'), 'No annotation connectors or left explanation column'
        motion = segment['motion']
        base = Image.open(work / 'images' / f'{index + 1:02d}.png').convert('RGB')
        assert not ImageChops.difference(base.crop((0, 980, 1920, 1080)), background().crop((0, 980, 1920, 1080))).getbbox(), 'No bottom source, disclaimer or scene number'
        with patch('motion_design.text', wraps=text) as drawing:
            frame = motion_frame(base, motion, min(6, segment['duration'] / 2))
            assert all(call.args[1] != motion.get('caption') for call in drawing.call_args_list), 'Do not draw bottom captions'
        if motion['kind'] in ('screen', 'recording'):
            for seconds in (1, 3.5, 4.5, 6):
                verify_screen_gutter(base, motion, min(seconds, segment['duration'] / 2))
        assert frame.size == (1920, 1080)
        assert segment['review']['expected_content']
        if motion['kind'] == 'title':
            assert motion['title'] and motion['subtitle']
            assert icon_path(motion['icon']).is_file()
            assert ImageChops.difference(frame, base).getbbox(), 'Title and official icon must render'
        elif motion['kind'] == 'flow':
            difference = ImageChops.difference(frame, motion_frame(base, motion, 5.7))
            assert difference.getbbox(), 'Data flow must move'
            for node in motion['nodes']:
                left, top, width, height = node['rect']
                assert 64 <= left and left + width <= 1856
                assert 235 <= top and top + height <= 920
        elif motion['kind'] == 'recording':
            path = Path(motion['recording'])
            assert motion['asset_sha256'] == hashlib.sha256(path.read_bytes()).hexdigest()
            recording, _ = recording_manifest(str(path))
            frames = recording['frames']
            assert len(frames) >= 10
            assert len({tuple(item['size']) for item in frames}) == 1, 'Recording viewport must stay fixed'
            assert len({hashlib.sha256(Path(item['path']).read_bytes()).hexdigest() for item in frames}) > 1, 'Actual screen content must change'
            assert all(first['at'] < second['at'] for first, second in zip(frames, frames[1:]))
            assert recording['duration'] >= frames[-1]['at']
            if motion.get('result_region'):
                verify_loaded_result(screen_source(frames[-1]['path']), motion['result_region'])
            if recording.get('source'):
                with Path(recording['source']).open('rb') as source:
                    assert recording['source_sha256'] == hashlib.file_digest(source, 'sha256').hexdigest()
                assert len(frames) / recording['sample_fps'] <= recording['duration'] + 1 / recording['sample_fps']
                trim = recording['trim']
                assert abs(recording['duration'] - (trim['end'] - trim['start'])) < 1e-6
                assert all(trim['start'] <= item['source_at'] < trim['end'] for item in frames)
                assert all(abs(item['source_at'] - trim['start'] - item['at']) < 1e-6 for item in frames)
                for sampled in (frames[0], frames[len(frames) // 2], frames[-1]):
                    original = subprocess.run([
                        ffmpeg(), '-v', 'error', '-ss', str(sampled['source_at']),
                        '-i', recording['source'], '-frames:v', '1',
                        '-f', 'image2pipe', '-c:v', 'png', '-',
                    ], check=True, capture_output=True).stdout
                    native = Image.open(BytesIO(original)).convert('RGB')
                    imported = Image.open(sampled['path']).convert('RGB')
                    assert native.size == imported.size
                    error = sum(ImageStat.Stat(ImageChops.difference(native, imported)).mean) / 3
                    assert error <= 4, 'Imported frame must match its original MP4 timestamp within JPEG tolerance'
                    source_checks.append({'recording': path.name, 'source_at': sampled['source_at'], 'mean_rgb_error': error})
            times, playback_duration = recording_timeline(motion)
            assert len(times) == len(frames) and times[0] == 0
            assert all(first < second for first, second in zip(times, times[1:]))
            if motion.get('max_gap_seconds'):
                assert all(second - first <= motion['max_gap_seconds'] + 1e-6 for first, second in zip(times, times[1:]))
            assert segment['duration'] >= playback_duration + motion.get('hold_before', 2)
        else:
            assert motion['asset_sha256'] == hashlib.sha256(Path(motion['path']).read_bytes()).hexdigest()
            assert len(motion.get('crop', [])) in (0, 4)
            source = screen_source(motion['path'])
            overview = tuple(motion.get('overview', [0, 0, source.width, source.height]))
            assert screen_bounds(motion, 1) == overview, 'Show complete application before zooming'
            assert screen_bounds(motion, 6) == tuple(motion.get('crop') or overview)
            assert min(source.size) >= 800, 'Do not use the former isolated low-resolution crops'
            pointer = motion.get('pointer')
            if pointer:
                assert all(0 <= value <= 1 for value in pointer['from'] + pointer['point'])
            assert not ImageChops.difference(motion_frame(base, motion, 0), base).getbbox(), 'Screen/diagram must fade in'
    canvas = Image.new('RGB', (100, 100), 'black')
    rounded_paste(canvas, Image.new('RGB', (60, 60), 'white'), 20, 20)
    assert canvas.getpixel((20, 20)) == (0, 0, 0)
    assert canvas.getpixel((50, 50)) == (255, 255, 255)
    cursor = cursor_sprite()
    assert cursor.getpixel((16, 20))[2] > cursor.getpixel((16, 20))[0]
    assert cursor.getpixel((26, 35))[:3] != cursor.getpixel((16, 20))[:3], 'Keep the blue gradient'
    assert cursor.getpixel((37, 65))[3] == cursor.getpixel((32, 80))[3] == 0, 'No cursor shaft'
    try:
        motion_frame(canvas, {'kind': 'prompt'}, 1)
    except ValueError:
        pass
    else:
        raise AssertionError('Reconstructed application UI must be rejected')
    plan['_source_checks'] = source_checks
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plans-only', action='store_true')
    parser.add_argument('plan', type=Path)
    parser.add_argument('--video', type=Path)
    parser.add_argument('--project', type=Path, default=ROOT)
    parser.add_argument('--layout-preview', action='store_true')
    args = parser.parse_args()
    results = []
    if not args.plans_only and not args.video:
        parser.error('--video is required for final MP4 verification')
    for plan_path in [args.plan]:
        name = str(args.video) if args.video else str(plan_path)
        plan = verify_plan(plan_path, args.layout_preview)
        duration = sum(segment['duration'] for segment in plan['segments'])
        if args.plans_only:
            print(f'{plan_path}: layout, original-source camera, margins, provenance and result panels: OK')
            continue
        path = args.video
        info = probe(str(path))
        if (info['width'], info['height'], info['fps']) != (1920, 1080, 30):
            raise ValueError(f'Unexpected format: {name} {info}')
        if abs(info['duration'] - duration) > .1:
            raise ValueError(f'Unexpected timing: {name}')
        subprocess.run([ffmpeg(), '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'], check=True, capture_output=True)
        frames = []
        checkpoints = []
        elapsed = 0
        result_checkpoints = {}
        for segment in plan['segments']:
            checkpoints.extend([elapsed + 1, elapsed + min(6, segment['duration'] / 2)])
            if segment['motion']['kind'] == 'recording':
                checkpoints.append(elapsed + segment['duration'] - 1)
                if segment['motion'].get('result_region'):
                    result_checkpoints[elapsed + segment['duration'] - 1] = segment
            elapsed += segment['duration']
        checkpoints.extend([4.3, duration - 1])
        for seconds in checkpoints:
            output = subprocess.run([ffmpeg(), '-v', 'error', '-ss', str(seconds), '-i', str(path), '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'], check=True, capture_output=True).stdout
            image = Image.open(BytesIO(output)).convert('RGB')
            if seconds in result_checkpoints:
                segment = result_checkpoints[seconds]
                motion = segment['motion']
                recording, _ = recording_manifest(motion['recording'])
                native_motion = {**motion, 'path': recording['frames'][-1]['path']}
                bounds = screen_bounds(native_motion, segment['duration'] - 1)
                factor = min((1872 - 2 * SCREEN_GUTTER) / (bounds[2] - bounds[0]), (836 - 2 * SCREEN_GUTTER) / (bounds[3] - bounds[1]))
                width = round((bounds[2] - bounds[0]) * factor)
                height = round((bounds[3] - bounds[1]) * factor)
                left = (1920 - width - 2 * SCREEN_GUTTER) // 2 + SCREEN_GUTTER
                top = 220 + (836 - height - 2 * SCREEN_GUTTER) // 2 + SCREEN_GUTTER
                roi = motion['result_region']
                output_roi = (round(left + (roi[0] - bounds[0]) * width / (bounds[2] - bounds[0])),
                              round(top + (roi[1] - bounds[1]) * height / (bounds[3] - bounds[1])),
                              round(left + (roi[2] - bounds[0]) * width / (bounds[2] - bounds[0])),
                              round(top + (roi[3] - bounds[1]) * height / (bounds[3] - bounds[1])))
                verify_loaded_result(image, output_roi)
            if max(ImageStat.Stat(image).stddev) < 10:
                raise ValueError(f'Blank frame: {name} at {seconds}')
            image.thumbnail((640, 360))
            frames.append(image)
        contact = Image.new('RGB', (1920, 360 * ((len(frames) + 2) // 3)))
        for index, image in enumerate(frames):
            contact.paste(image, ((index % 3) * 640, (index // 3) * 360))
        contact.save(path.with_suffix('.check.png'))
        result = {'file': name, **info, 'bytes': path.stat().st_size, 'full_decode': 'ok', 'every_scene_pixels': 'nonblank', 'loaded_results_checked': len(result_checkpoints), 'subtitles': False, 'overview_before_zoom': True, 'layout_preview': args.layout_preview, 'actual_recording': any(segment['motion']['kind'] == 'recording' for segment in plan['segments']), 'animated_flow': True, 'screen_gutter_px': SCREEN_GUTTER, 'source_frame_checks': plan['_source_checks'], 'semantic_review': 'manual review images; not automated OCR'}
        results.append(result)
        print(json.dumps(result, ensure_ascii=False))
    if not args.plans_only:
        args.video.with_suffix('.verification.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
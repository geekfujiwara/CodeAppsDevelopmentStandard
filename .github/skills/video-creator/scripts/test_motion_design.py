import unittest
import json
import hashlib
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

from PIL import Image, ImageChops, ImageColor, ImageDraw

from motion_design import SKILL, SCREEN_GUTTER, SCREEN_MATTE, background, screen_frame
from video_media import ffmpeg
from verify_video import verify_loaded_result

SCRIPTS = Path(__file__).resolve().parent


class ScreenGutterTests(unittest.TestCase):
    def test_nonblank_heading_does_not_hide_a_blank_result_panel(self):
        frame = Image.new('RGB', (1920, 1080), 'white')
        ImageDraw.Draw(frame).rectangle((0, 0, 1919, 179), fill='navy')
        region = [90, 200, 1420, 710]
        with self.assertRaisesRegex(AssertionError, 'blank loading panel'):
            verify_loaded_result(frame, region)
        ImageDraw.Draw(frame).rectangle((100, 220, 600, 380), fill='black')
        verify_loaded_result(frame, region)
        with self.assertRaisesRegex(AssertionError, 'inside the actual frame'):
            verify_loaded_result(frame, [0, 0, 1930, 1080])

    def test_all_camera_phases_keep_32_pixel_interior_margins(self):
        source = Image.new('RGB', (3200, 2000), 'white')
        motion = {
            'path': 'test-source',
            'crop': [560, 178, 3124, 1390],
            'camera': {'overview_seconds': 3, 'zoom_seconds': 2},
        }
        for seconds in (1, 3, 3.5, 4, 4.5, 5, 6):
            with self.subTest(seconds=seconds), patch('motion_design.screen_source', return_value=source):
                frame = screen_frame(background(), motion, seconds)
                white = ImageChops.difference(frame, Image.new('RGB', frame.size, 'white'))
                mask = white.convert('L').point(lambda value: 255 if value == 0 else 0)
                left, top, right, bottom = mask.getbbox()
                self.assertGreaterEqual(left - SCREEN_GUTTER, 24)
                self.assertGreaterEqual(top - SCREEN_GUTTER, 220)
                self.assertLessEqual(right + SCREEN_GUTTER, 1896)
                self.assertLessEqual(bottom + SCREEN_GUTTER, 1056)
                matte = ImageColor.getrgb(SCREEN_MATTE)
                for x, y in (
                    (left - SCREEN_GUTTER + 1, (top + bottom) // 2),
                    (right + SCREEN_GUTTER - 2, (top + bottom) // 2),
                    ((left + right) // 2, top - SCREEN_GUTTER + 1),
                    ((left + right) // 2, bottom + SCREEN_GUTTER - 2),
                ):
                    self.assertEqual(frame.getpixel((x, y)), matte)

    def test_pointer_is_positioned_relative_to_inset_content(self):
        source = Image.new('RGB', (1600, 1000), 'white')
        motion = {'path': 'test-source', 'pointer': {'from': [0, 0], 'point': [0, 0]}}
        with patch('motion_design.screen_source', return_value=source):
            plain = screen_frame(background(), {**motion, 'pointer': None}, 3)
            pointed = screen_frame(background(), motion, 3)
        changed = ImageChops.difference(plain, pointed).getbbox()
        self.assertIsNotNone(changed)
        self.assertGreater(changed[0], (1920 - 1299) // 2 + SCREEN_GUTTER - 20)
        self.assertGreaterEqual(changed[1], 220 + SCREEN_GUTTER - 20)


class StoryRequirementsTests(unittest.TestCase):
    def test_templates_are_explicit_layouts_not_fake_application_screens(self):
        for name in ('screen-first', 'two-personas', 'development-story'):
            folder = SKILL / 'templates' / name
            manifest = json.loads((folder / 'scaffold.json').read_text(encoding='utf-8'))
            self.assertIn('VIDEO_TITLE', manifest['variables'])
            story = json.loads((folder / 'storyboard.json').read_text(encoding='utf-8'))['demo']
            self.assertIn('columns', story['scenes'][0])
            self.assertTrue(all('columns' in scene for scene in story['scenes']))
            self.assertIn('模式図', story['scenes'][0]['lead'])
            expected_icon = 'github-copilot' if name == 'development-story' else 'assistant'
            self.assertEqual(story['title_card']['icon'], expected_icon)

    def test_synthetic_application_input_is_rejected(self):
        from prepare_video import make_scene
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'reconstructed UI'):
                make_scene({}, 0, {'prompt': 'invented input'}, Path(folder), 1)


class RecordingImportTests(unittest.TestCase):
    def test_unicode_filename_trim_provenance_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            source = folder / '実録画.mp4'
            output = folder / 'clip.frames.json'
            subprocess.run([
                ffmpeg(), '-v', 'error', '-f', 'lavfi', '-i',
                'testsrc2=size=64x48:rate=10:duration=2',
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(source),
            ], check=True)
            command = [
                sys.executable, '-B', str(SCRIPTS / 'import_recording.py'), str(source),
                '--start', '0.5', '--end', '1.5', '--fps', '10', '--output', str(output),
            ]
            result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(result.returncode, 0, result.stderr)
            manifest = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(len(manifest['frames']), 10)
            self.assertEqual(manifest['duration'], 1)
            self.assertEqual(manifest['source_sha256'], hashlib.sha256(source.read_bytes()).hexdigest())
            self.assertEqual(manifest['trim'], {'start': 0.5, 'end': 1.5})
            self.assertEqual(json.loads(result.stdout)['duration'], 1)
            for index, frame in enumerate(manifest['frames']):
                self.assertEqual(frame['at'], index / 10)
                self.assertEqual(frame['source_at'], 0.5 + index / 10)
                self.assertEqual(frame['size'], [64, 48])
                with Image.open(frame['path']) as image:
                    self.assertEqual(image.size, (64, 48))
            original = output.read_bytes()
            repeated = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
            self.assertNotEqual(repeated.returncode, 0)
            self.assertIn('Refusing to mix', repeated.stderr)
            self.assertEqual(output.read_bytes(), original)
            invalid = subprocess.run([
                sys.executable, '-B', str(SCRIPTS / 'import_recording.py'), str(source),
                '--fps', '0', '--output', str(folder / 'invalid.frames.json'),
            ], capture_output=True, text=True, encoding='utf-8')
            self.assertNotEqual(invalid.returncode, 0)
            self.assertFalse((folder / 'invalid').exists())


class TemplatePipelineTests(unittest.TestCase):
    def test_every_template_scaffolds_and_prepares_without_private_assets(self):
        with tempfile.TemporaryDirectory() as temporary:
            for name in ('screen-first', 'two-personas', 'development-story'):
                job = Path(temporary) / name
                command = [
                    sys.executable, '-B', str(SCRIPTS / 'scaffold_from_template.py'),
                    '--template', str(SKILL / 'templates' / name), '--target', str(job),
                    '--var', 'VIDEO_TITLE=画面中心デモ', '--var', 'PERSONA_ONE=担当者',
                    '--var', 'PERSONA_TWO=上司', '--var', 'STANDARD_REPOSITORY_URL=https://example.org/standard',
                ]
                result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
                self.assertEqual(result.returncode, 0, result.stderr)
                prepared = subprocess.run([
                    sys.executable, '-B', str(SCRIPTS / 'prepare_video.py'),
                    '--project', str(job), '--series', 'demo', '--revision', 'v1', '--source',
                ], capture_output=True, text=True, encoding='utf-8')
                self.assertEqual(prepared.returncode, 0, prepared.stderr)
                plan = job / 'work' / 'demo-v1' / 'edit-plan.json'
                verification = [sys.executable, '-B', str(SCRIPTS / 'verify_video.py'), str(plan), '--project', str(job), '--plans-only']
                preview = subprocess.run([*verification, '--layout-preview'], capture_output=True, text=True, encoding='utf-8')
                self.assertEqual(preview.returncode, 0, preview.stderr)
                production = subprocess.run(verification, capture_output=True, text=True, encoding='utf-8')
                self.assertNotEqual(production.returncode, 0)
                self.assertIn('diagrams alone are only a layout preview', production.stderr)
                if name == 'screen-first':
                    self.verify_encoded_calibration(job)

    def verify_encoded_calibration(self, job):
        # A generated calibration pattern is test data, never a fabricated application screen.
        source = job / 'calibration.mp4'
        subprocess.run([
            ffmpeg(), '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10:duration=2',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(source),
        ], check=True)
        manifest = job / 'capture' / 'calibration-v1.frames.json'
        subprocess.run([
            sys.executable, '-B', str(SCRIPTS / 'import_recording.py'), str(source),
            '--fps', '10', '--output', str(manifest),
        ], check=True, capture_output=True)
        story_path = job / 'storyboard.json'
        stories = json.loads(story_path.read_text(encoding='utf-8'))
        stories['demo']['evidence']['required_recordings'] = [manifest.name]
        stories['demo']['scenes'].append({
            'title': '校正パターンのテスト', 'lead': 'アプリ実演ではない、自動検証専用の素材です。',
            'caption': 'Generated calibration data, not application evidence.',
            'recording': manifest.name, 'duration': 4, 'max_gap_seconds': .05,
            'result_region': [0, 0, 320, 180],
        })
        story_path.write_text(json.dumps(stories, ensure_ascii=False), encoding='utf-8')
        commands = [
            [str(SCRIPTS / 'prepare_video.py'), '--project', str(job), '--revision', 'v2', '--source'],
            [str(SCRIPTS / 'render_video.py'), str(job / 'work' / 'demo-v2' / 'edit-plan.json'),
             str(job / 'output' / 'calibration-v2.mp4'), '--project', str(job), '--part-seconds', '30'],
            [str(SCRIPTS / 'verify_video.py'), str(job / 'work' / 'demo-v2' / 'edit-plan.json'),
             '--project', str(job), '--video', str(job / 'output' / 'calibration-v2.mp4')],
        ]
        for arguments in commands:
            result = subprocess.run([sys.executable, '-B', *arguments], capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(result.returncode, 0, result.stderr)
        verified = json.loads(result.stdout)
        self.assertEqual(verified['full_decode'], 'ok')
        self.assertEqual(verified['screen_gutter_px'], 32)
        self.assertEqual(verified['loaded_results_checked'], 1)
        self.assertEqual(len(verified['source_frame_checks']), 3)
        self.assertTrue(verified['actual_recording'])
        self.assertFalse(verified['layout_preview'])

if __name__ == '__main__':
    unittest.main()

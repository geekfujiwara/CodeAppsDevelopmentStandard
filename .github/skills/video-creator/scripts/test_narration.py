"""Offline tests: synthetic tones are fixtures, not a claim of TTS intelligibility."""
import asyncio
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from PIL import Image, ImageDraw

from common import ffmpeg, load_font, resolve_font, wrap_text
from make_demo_cards import opening_image, ribbon_image
from narrate_video import normalized, prepare_scene, read_script, text_groups, timed_cues
from subtitle_style import subtitle_image
from verify_narrated_video import verify_video

SCRIPTS = Path(__file__).resolve().parent


class NarrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.font_path = resolve_font()
        cls.font = load_font(cls.font_path, 38, "Medium")

    def test_original_subtitle_pixels_at_both_sizes(self):
        for width, height in [(1920, 1080), (960, 540)]:
            scale = height / 1080
            font = load_font(self.font_path, int(38 * scale), "Medium")
            for text in ["A clear handover, with human control.", "字幕と音声を同じ原文で生成する。"]:
                lines = wrap_text(text, font, width * .78 - 60 * scale) or [""]
                line_height = int(54 * scale)
                w = int(max(font.getlength(line) for line in lines) + 60 * scale)
                h = int(len(lines) * line_height + 30 * scale)
                expected = Image.new("RGBA", (w, h), (0, 0, 0, 0))
                draw = ImageDraw.Draw(expected)
                draw.rounded_rectangle((0, 0, w, h), int(14 * scale), fill=(10, 18, 34, 190))
                for index, line in enumerate(lines):
                    draw.text((w / 2 - font.getlength(line) / 2, int(12 * scale) + index * line_height),
                              line, font=font, fill=(255, 255, 255))
                actual = subtitle_image(text, font, width, height)
                self.assertEqual(expected.size, actual.size)
                self.assertEqual(expected.tobytes(), actual.tobytes())

    def test_exact_groups_and_word_timing(self):
        text = "One request. Human review."
        scene = {"start": 10, "duration": 5, "text": text}
        words = [
            {"text": "One", "offset": 1_000_000, "duration": 2_000_000},
            {"text": "request", "offset": 4_000_000, "duration": 3_000_000},
            {"text": "Human", "offset": 9_000_000, "duration": 2_000_000},
            {"text": "review", "offset": 12_000_000, "duration": 3_000_000},
        ]
        cues = timed_cues(scene, words, 1.25, self.font)
        self.assertEqual(" ".join(cue["text"] for cue in cues), text)
        self.assertAlmostEqual(cues[0]["start"], 10 + .15 + .1 / 1.25 - .04)
        self.assertLess(cues[0]["end"], cues[1]["start"])
        self.assertEqual(len(cues), 2)
        with self.assertRaisesRegex(ValueError, "canonical text"):
            timed_cues({**scene, "text": "Different words."}, words, 1, self.font)
        with self.assertRaisesRegex(ValueError, "clipped"):
            timed_cues({**scene, "duration": 1}, words, 1, self.font)
        with self.assertRaisesRegex(ValueError, "overlap"):
            timed_cues(scene, [{**words[0], "offset": -1}, *words[1:]], 1, self.font)

    def test_unicode_and_oversize_caption(self):
        self.assertEqual(normalized("Ｆａｃｔｓ — café!"), "factscafé")
        text = "Keep the available records together, and let a person check what is known and missing before the handover."
        self.assertEqual(" ".join(group[2] for group in text_groups(text, self.font)), text)
        with self.assertRaisesRegex(ValueError, "cannot fit"):
            text_groups("W" * 200, self.font)

    def test_script_validation(self):
        example = SCRIPTS.parent / "assets" / "templates" / "business-demo.example.json"
        script = read_script(example)
        self.assertEqual(sum(scene["duration"] for scene in script["scenes"]), 88)
        self.assertEqual(opening_image(script, self.font_path).size, (1920, 1080))
        self.assertEqual(ribbon_image(script["workflow"], 3, self.font_path).size, (1920, 94))
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "script.json"
            cases = [
                {"start": 1, "duration": 2, "text": "One request."},
                {"start": 0, "duration": float("nan"), "text": "One request."},
                {"start": 0, "duration": 2, "text": "One  request."},
                {"start": 0, "duration": 2, "text": "One request.", "step": True},
                {"start": 0, "duration": 2, "text": "One request.", "position": "left"},
            ]
            for scene in cases:
                path.write_text(json.dumps({"scenes": [scene]}), encoding="utf-8")
                with self.assertRaises(ValueError):
                    read_script(path)
            path.write_text(json.dumps({"max_duration": 1, "scenes": [
                {"start": 0, "duration": 2, "text": "One request."}]}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "exceeding"):
                read_script(path)

    def test_network_consent_before_provider_import(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            scene = {"start": 0, "duration": 3, "text": "One request."}
            with patch("narrate_video.synthesize", new_callable=AsyncMock) as provider:
                with self.assertRaises(PermissionError):
                    asyncio.run(prepare_scene(0, scene, "example-voice", folder, folder, self.font, False))
                provider.assert_not_awaited()

    def test_speech_tempo_limit_is_enforced(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            scene = {"start": 0, "duration": 2, "text": "One request."}
            key = hashlib.sha256(b"fixture-voice|WordBoundary|One request.").hexdigest()
            (folder / f"{key}.mp3").write_bytes(b"fixture")
            (folder / f"{key}.json").write_text("[]", encoding="utf-8")
            with patch("narrate_video.probe", return_value={"duration": 2.7}):
                with self.assertRaisesRegex(ValueError, "shorten its canonical text"):
                    asyncio.run(prepare_scene(
                        0, scene, "fixture-voice", folder, folder, self.font, False))


class NarratedVideoIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="video-creator-narration-test-")
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.root = Path(cls.temporary.name)
        cls.font_path = resolve_font()
        cls.work = cls.root / "work"
        cache = cls.work / "speech-cache"
        cache.mkdir(parents=True)
        cls.base, cls.output = cls.root / "base.mp4", cls.root / "narrated.mp4"
        cls.script_path = cls.root / "script.json"
        cls.environment = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
        cls.script = {
            "voice": "fixture-voice", "language": "eng", "max_duration": 8,
            "workflow": [{"name": "Open request", "purpose": "Understand the question"},
                         {"name": "Human review", "purpose": "Check the response"}],
            "scenes": [
                {"start": 0, "duration": 2.2, "text": "One request.", "step": None},
                {"start": 2.2, "duration": 2.2, "text": "Human review.", "step": 1},
                {"start": 4.4, "duration": 2.2, "text": "Clear handover.", "step": 2, "position": "top"},
            ],
        }
        cls.script_path.write_text(json.dumps(cls.script), encoding="utf-8")
        cls.ff(["-f", "lavfi", "-i", "color=c=0x203040:s=1920x1080:r=30:d=6.6",
                "-an", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", cls.base])
        cls.original_base = hashlib.sha256(cls.base.read_bytes()).hexdigest()
        for scene in cls.script["scenes"]:
            key = hashlib.sha256(f"fixture-voice|WordBoundary|{scene['text']}".encode()).hexdigest()
            cls.ff(["-f", "lavfi", "-i", "sine=frequency=880:duration=1.1",
                    "-c:a", "libmp3lame", cache / f"{key}.mp3"])
            words = [
                {"text": scene["text"].split()[0], "offset": 1_000_000, "duration": 2_500_000},
                {"text": scene["text"].split()[1], "offset": 5_000_000, "duration": 3_000_000},
            ]
            (cache / f"{key}.json").write_text(json.dumps(words), encoding="utf-8")
        result = cls.cli(cls.output)
        if result.returncode:
            raise AssertionError(result.stderr)

    @classmethod
    def ff(cls, args):
        subprocess.run([ffmpeg(), "-v", "error", "-y", *map(str, args)], check=True,
                       capture_output=True, text=True)

    @classmethod
    def cli(cls, output):
        return subprocess.run(
            [sys.executable, "-B", str(SCRIPTS / "narrate_video.py"), str(cls.base),
             str(cls.script_path), str(output), "--work-dir", str(cls.work), "--font", cls.font_path],
            env=cls.environment, capture_output=True, text=True)

    def test_full_offline_render_and_manifest(self):
        checks = verify_video(self.output, 8, "eng", 6.6)
        self.assertTrue(all(value for key, value in checks.items() if key.endswith("_ok")))
        manifest = json.loads((self.work / "narration-manifest.json").read_text(encoding="utf-8"))
        for original, prepared in zip(self.script["scenes"], manifest["scenes"]):
            self.assertEqual(original["text"], " ".join(cue["text"] for cue in prepared["cues"]))
        self.assertEqual(hashlib.sha256(self.base.read_bytes()).hexdigest(), self.original_base)
        self.assertFalse(any(self.work.glob("narration-*/*candidate.mp4")))

    def test_workflow_ribbon_matches_active_scene(self):
        for time, x, accented in [(1, 200, False), (3.2, 200, True), (5.4, 1100, True)]:
            path = self.root / f"frame-{time}.png"
            self.ff(["-ss", time, "-i", self.output, "-frames:v", "1", path])
            with Image.open(path) as image:
                pixel = image.convert("RGB").getpixel((x, 40))
            close = all(abs(actual - expected) < 10 for actual, expected in zip(pixel, (110, 220, 224)))
            self.assertEqual(close, accented)

    def test_verifier_rejects_silence_language_and_overlength(self):
        with self.assertRaisesRegex(ValueError, "verification failed"):
            verify_video(self.output, 6, "eng")
        with self.assertRaisesRegex(ValueError, "verification failed"):
            verify_video(self.output, 8, "fra")
        silent = self.root / "silent.mp4"
        self.ff(["-i", self.output, "-af", "volume=0", "-c:v", "copy", "-c:a", "aac",
                 "-metadata:s:a:0", "language=eng", "-disposition:a:0", "default",
                 "-movflags", "+faststart", silent])
        with self.assertRaisesRegex(ValueError, "verification failed"):
            verify_video(silent, 8, "eng")
        with self.assertRaisesRegex(ValueError, "verification failed"):
            verify_video(self.base, 8, "eng")

    def test_output_and_style_are_protected(self):
        result = self.cli(self.output)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("new output filename", result.stderr)
        style_path = self.work / "caption-style.json"
        original = style_path.read_text(encoding="utf-8")
        try:
            style_path.write_text("{}", encoding="utf-8")
            result = self.cli(self.root / "changed-style.mp4")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Caption style changed", result.stderr)
            self.assertFalse((self.root / "changed-style.mp4").exists())
        finally:
            style_path.write_text(original, encoding="utf-8")


if __name__ == "__main__":
    unittest.main()

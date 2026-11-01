import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image, ImageChops

import common
import compress_video


class PlanTests(unittest.TestCase):
    def test_natural_order(self):
        names = ["image (10).png", "image (2).png", "image.png", "image (1).png"]
        self.assertEqual(sorted(names, key=common.natural_key),
                         ["image.png", "image (1).png", "image (2).png", "image (10).png"])

    def test_concat_quote(self):
        self.assertIn("editor'\\''s", common.concat_file("editor's.mp4"))

    def test_image_coordinates_and_subtitle_preservation(self):
        segment = {"image": 0, "duration": 2, "zoom": [[0, [10, 20, 30, 40]]],
                   "highlights": [{"t": [0, 1], "rect": [10, 20, 30, 40]}],
                   "subtitles": [{"t": [0, 1], "text": "Sample subtitle"}]}
        common.image_segment(segment, [{"k": 2, "ox": 4, "oy": 8, "start": 3, "dur": 4}])
        self.assertEqual(segment["src"], [3.2, 5.2])
        self.assertEqual(segment["zoom"][0][1], [24, 48, 64, 88])
        self.assertEqual(segment["highlights"][0]["rect"], [24, 48, 64, 88])
        self.assertEqual(segment["subtitles"][0]["text"], "Sample subtitle")
        self.assertEqual(segment["coords"], "source")

    def test_image_index_out_of_range(self):
        with self.assertRaisesRegex(SystemExit, "image=1"):
            common.image_segment({"image": 1}, [{"dur": 1}])

    def test_font_download_is_not_implicit(self):
        with patch.object(common, "FONT_DIR", ""), \
                patch.object(common, "SYSTEM_CANDIDATES", []), \
                patch.object(common, "FALLBACK_FONTS", []), \
                patch.dict(os.environ, {}, clear=True), \
                patch.object(common.urllib.request, "urlretrieve") as download:
            with self.assertRaises(SystemExit):
                common.resolve_font()
            download.assert_not_called()

    def test_filters_never_upscale_or_raise_fps(self):
        small = {"width": 640, "height": 360, "fps": 24}
        self.assertNotIn("fps=", compress_video.build_filters(small, 1080, 30))
        large = {"width": 2160, "height": 3840, "fps": 60}
        filters = compress_video.build_filters(large, 1080, 30)
        self.assertIn("1080", filters)
        self.assertIn("fps=30", filters)


class VideoIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="video editor's ")
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.scripts = Path(__file__).resolve().parent
        self.env = dict(os.environ, PYTHONUTF8="1", PYTHONDONTWRITEBYTECODE="1")

    def run_script(self, name, *args, expected=0):
        result = subprocess.run([sys.executable, "-B", str(self.scripts / name),
                                 *(str(arg) for arg in args)], capture_output=True,
                                text=True, encoding="utf-8", env=self.env, timeout=120)
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return result.stdout

    def test_slideshow_subtitles_grid_resume_and_compression(self):
        images = self.work / "images"
        images.mkdir()
        Image.new("RGB", (320, 240), "#447799").save(images / "image.png")
        Image.new("RGB", (400, 200), "#994477").save(images / "image (1).png")
        source = self.work / "source.mp4"
        self.run_script("images_to_source.py", images, "--out", source,
                        "--dur", 1, "--buffer", 0.5, "--size", "320x180", "--fps", 30)
        meta = json.loads(source.with_suffix(".meta.json").read_text(encoding="utf-8"))
        self.assertEqual([m["file"] for m in meta["images"]], ["image.png", "image (1).png"])
        self.assertEqual(meta["images"][1]["start"], 1.5)
        self.assertEqual(meta["images"][0]["k"], 0.75)
        plan = {
            "source": "source.mp4", "images_meta": "source.meta.json",
            "output": {"width": 320, "height": 180, "fps": 30},
            "segments": [
                {"image": 0, "duration": 1,
                 "subtitles": [{"t": [0, 1], "text": "日本語字幕 / Sample subtitle"}]},
                {"image": 1, "duration": 1}
            ]
        }
        plan_path = self.work / "plan.json"
        plan_path.write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
        out = self.work / "edited.mp4"
        self.run_script("render_preview.py", plan_path, out, "--stills", "0.5,1.5", "--grid")
        self.assertTrue((self.work / "edited_grid_01.png").exists())
        with Image.open(self.work / "edited_still_000.50.png") as still:
            self.assertEqual(still.size, (320, 180))
            subtitle_still = still.copy()
        plan["segments"][0]["subtitles"] = []
        plain_plan = self.work / "plain.json"
        plain_plan.write_text(json.dumps(plan), encoding="utf-8")
        self.run_script("render_preview.py", plain_plan, self.work / "plain.mp4", "--stills", "0.5")
        with Image.open(self.work / "plain_still_000.50.png") as plain:
            self.assertIsNotNone(ImageChops.difference(subtitle_still, plain).getbbox())
        self.run_script("inspect_video.py", source, self.work / "inspect", "--every", 1, "--at", "0.5")
        self.assertTrue((self.work / "inspect" / "contact_sheet.png").exists())
        self.run_script("render_preview.py", plan_path, out, "--part-seconds", 1, "--only-part", 0)
        part = Path(str(out) + ".parts") / "part000.mp4"
        modified = part.stat().st_mtime_ns
        self.run_script("render_preview.py", plan_path, out, "--part-seconds", 1, "--keep-parts")
        self.assertEqual(part.stat().st_mtime_ns, modified)
        info = json.loads(self.run_script("compress_video.py", out, "--info"))
        self.assertEqual((info["width"], info["height"]), (320, 180))
        self.assertAlmostEqual(info["duration"], 2, delta=0.1)
        for mode in (("--preset", "standard"), ("--target-mb", "0.1")):
            compressed = self.work / ("compressed" + mode[0] + ".mp4")
            result = json.loads(self.run_script("compress_video.py", out, compressed, *mode))
            self.assertTrue(result["checks"]["duration_ok"])
            self.assertTrue(result["checks"]["playable"])
            self.assertEqual((result["after"]["width"], result["after"]["height"]), (320, 180))
            if mode[0] == "--target-mb":
                self.assertTrue(result["checks"]["target_size_ok"])
                self.assertLessEqual(compressed.stat().st_size, 100000)
        self.run_script("compress_video.py", out, self.work / "denied.mp4", "--fps", 15, expected=1)
        project = self.work / "hyperframes"
        self.run_script("build_hyperframes.py", plan_path, project, "--copy-video")
        html = (project / "index.html").read_text(encoding="utf-8")
        self.assertIn("日本語字幕 / Sample subtitle", html)
        self.assertTrue((project / "assets" / "fonts" / "OFL.txt").exists())
        self.assertTrue((project / "assets" / "source.mp4").exists())

    def test_hd_compression_preserves_floor(self):
        source = self.work / "hd.mp4"
        subprocess.run([common.ffmpeg(), "-v", "error", "-f", "lavfi", "-i",
                        "testsrc2=size=1920x1080:rate=60:duration=1",
                        "-c:v", "libx264", "-preset", "ultrafast", str(source)],
                       check=True, capture_output=True, timeout=120)
        with patch.object(compress_video.shutil, "which", return_value=None):
            fallback = compress_video.probe(str(source))
        self.assertEqual((fallback["width"], fallback["height"]), (1920, 1080))
        self.assertEqual(fallback["fps"], 60)
        result = json.loads(self.run_script("compress_video.py", source,
                                           self.work / "hd_compressed.mp4", "--preset", "standard"))
        self.assertEqual((result["after"]["width"], result["after"]["height"]), (1920, 1080))
        self.assertEqual(result["after"]["fps"], 30)
        self.assertTrue(result["checks"]["duration_ok"])
        self.assertTrue(result["checks"]["playable"])


if __name__ == "__main__":
    unittest.main()

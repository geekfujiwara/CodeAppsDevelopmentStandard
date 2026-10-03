"""validate_3d_assets.py の単体テスト（python -m unittest scripts/test_validate_3d_assets.py）"""
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_3d_assets import check_glb, check_materials  # noqa: E402

from PIL import Image  # noqa: E402


def glb(path: Path, gltf: dict) -> Path:
    js = json.dumps(gltf).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    body = struct.pack("<I4s", len(js), b"JSON") + js
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body)
    return path


def library(root: Path, *, gray=True, rough=200, size=256, tint="luminance", avg=(0.5, 0.5, 0.5), license="CC0-1.0"):
    folder = root / "materials" / "wall"
    folder.mkdir(parents=True)
    Image.new("RGB", (size, size), (128, 128, 128) if gray else (200, 120, 40)).save(folder / "color.jpg")
    Image.new("RGB", (size, size), (128, 128, 255)).save(folder / "normal.jpg")
    Image.new("L", (size, size), rough).save(folder / "rough.jpg")
    m = root / "lib.json"
    m.write_text(json.dumps({"materials": [{"slot": "wall:siding", "path": "materials/wall", "tile": 1.6, "tint": tint, "avgLinear": list(avg), "license": license, "source": "https://example.com/x"}]}))
    return m


KW = dict(max_px=1024, max_slot_bytes=600_000, max_total_bytes=6_000_000, min_rough=0.45)


class MaterialTests(unittest.TestCase):
    def test_valid_library_passes(self):
        with tempfile.TemporaryDirectory() as d:
            errs, _ = check_materials(library(Path(d)), Path(d), **KW)
            self.assertEqual(errs, [])

    def test_detects_color_cast_low_roughness_bad_size_and_missing_license(self):
        with tempfile.TemporaryDirectory() as d:
            errs, _ = check_materials(library(Path(d), gray=False, rough=40, size=300, avg=(0, 0.5, 0.5), license=""), Path(d), **KW)
            text = "\n".join(errs)
            for needle in ("色相が残って", "粗さの平均", "2 の累乗", "avgLinear", "license"):
                self.assertIn(needle, text)


class GlbTests(unittest.TestCase):
    def test_self_contained_glb_with_known_materials_passes(self):
        with tempfile.TemporaryDirectory() as d:
            p = glb(Path(d) / "a.glb", {"asset": {"version": "2.0"}, "materials": [{"name": "roof"}, {"name": "furn_wood"}]})
            self.assertEqual(check_glb(p, material_keys={"roof"}, key_prefixes=("furn_",), max_bytes=10_000), [])

    def test_detects_external_uri_embedded_image_worker_extension_and_unknown_material(self):
        with tempfile.TemporaryDirectory() as d:
            p = glb(Path(d) / "b.glb", {
                "asset": {"version": "2.0"},
                "buffers": [{"uri": "https://cdn.example.com/b.bin", "byteLength": 4}],
                "images": [{"name": "albedo", "mimeType": "image/png", "bufferView": 0}],
                "extensionsUsed": ["KHR_draco_mesh_compression"],
                "materials": [{"name": "Material.001"}],
            })
            text = "\n".join(check_glb(p, material_keys={"roof"}, max_bytes=10_000))
            for needle in ("外部バッファ", "埋め込んで", "KHR_draco_mesh_compression", "Material.001"):
                self.assertIn(needle, text)


if __name__ == "__main__":
    unittest.main()

"""外部の 3D モデル（glTF）を、家具カタログで使える GLB に整える（Blender でヘッドレス実行）。

  blender -b --factory-startup --python blender/normalize_model.py -- \
      --in .tools/models-src/Sofa_01/Sofa_01_1k.gltf --out src/assets/models/sofa_01.glb --type sofaModel --rot 0 --tex 512

- 親子関係・変換を焼き込み、1 つのメッシュにまとめる
- 鉛直軸まわりに --rot 度回し、正面を Code App の +z（Blender の -Y）へ向ける
- 底面の中心を原点に置く（床に置いたときに沈まない・浮かない）
- 材質名を furn_<type>_<n> にする（建物の材質ライブラリと名前が衝突しないように）
- テクスチャを --tex px 以下に縮め、JPEG で GLB に埋め込む（Draco / KTX2 は使わない: Worker が要る）
結果（寸法・材質・ポリゴン数）を 1 行の JSON で標準出力へ出す。
"""
from __future__ import annotations

import argparse
import json
import math
import sys

import bpy
from mathutils import Matrix, Vector


def parse() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="src", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--type", required=True)
    p.add_argument("--rot", type=float, default=0.0)
    p.add_argument("--scale", type=float, default=1.0)
    p.add_argument("--tex", type=int, default=512)
    p.add_argument("--quality", type=int, default=82)
    return p.parse_args(argv)


def main() -> None:
    a = parse()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=a.src)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit("メッシュがありません")
    # 変換を頂点へ焼き込み、親（空のノード）を外す
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.data = o.data.copy()
        o.data.transform(mw)
        o.matrix_world = Matrix.Identity(4)
    for o in [o for o in bpy.context.scene.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = a.type
    obj.data.transform(Matrix.Rotation(math.radians(a.rot), 4, "Z") @ Matrix.Scale(a.scale, 4))
    vs = [v.co for v in obj.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    obj.data.transform(Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
    size = hi - lo

    names = []
    for i, slot in enumerate(obj.material_slots):
        if slot.material:
            slot.material.name = f"furn_{a.type}_{i}"
            names.append(slot.material.name)
    for img in bpy.data.images:
        w, h = img.size
        if max(w, h) > a.tex:
            k = a.tex / max(w, h)
            img.scale(max(1, round(w * k)), max(1, round(h * k)))

    opts = dict(filepath=a.out, export_format="GLB", export_yup=True, export_apply=True,
                export_draco_mesh_compression_enable=False, export_image_format="JPEG",
                export_cameras=False, export_lights=False)
    try:
        bpy.ops.export_scene.gltf(**opts, export_image_quality=a.quality)
    except TypeError:
        bpy.ops.export_scene.gltf(**opts, export_jpeg_quality=a.quality)
    print("NORMALIZED " + json.dumps({
        # Blender の x = 幅、y = 奥行（-Y が正面）、z = 高さ → カタログの w / d / h
        "w": round(size.x, 3), "d": round(size.y, 3), "h": round(size.z, 3),
        "materials": names, "polys": len(obj.data.polygons),
    }))


main()

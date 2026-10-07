"""
家具・車（src/data/furniture-catalog.json）の展開と Blender メッシュ化

カタログは Code App（src/lib/furniture.ts）と共有する。use（入れ子の部品）の展開は expandParts と同じ結果になる
（tests/furniture.test.mjs で検証）。expand_parts / load_catalog は bpy に依存しない。
"""
from __future__ import annotations

import json
import math
from pathlib import Path

CATALOG_PATH = Path(__file__).resolve().parents[1] / "src" / "data" / "furniture-catalog.json"
MODEL_LIBRARY_PATH = Path(__file__).resolve().parents[1] / "src" / "data" / "model-library.json"
MODEL_DIR = Path(__file__).resolve().parents[1] / "src" / "assets" / "models"


def load_catalog(job: dict | None = None) -> dict:
    """ジョブ JSON に同梱されていればそれを、無ければリポジトリのカタログ + 3D モデルの manifest を読む（furniture.ts の CATALOG と同じ統合）"""
    if job and isinstance(job.get("furnitureCatalog"), dict):
        return job["furnitureCatalog"]
    cat = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    if MODEL_LIBRARY_PATH.exists():
        cat["items"].update(json.loads(MODEL_LIBRARY_PATH.read_text(encoding="utf-8"))["models"])
    return cat


def _rot_y(p, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]


def expand_parts(catalog: dict, item_type: str, depth: int = 0) -> list[dict]:
    item = catalog["items"].get(item_type)
    if not item or depth > 4:
        return []
    out = []
    for part in item["parts"]:
        if "use" in part:
            ry = part.get("ry", 0)
            for child in expand_parts(catalog, part["use"], depth + 1):
                p = _rot_y(child["p"], ry)
                rot = child.get("rot") or [0, 0, 0]
                out.append({**child, "p": [p[0] + part["p"][0], p[1] + part["p"][1], p[2] + part["p"][2]], "rot": [rot[0], rot[1] + ry, rot[2]]})
        else:
            out.append(part)
    return out


# ── Blender（bpy が使えるときだけ） ───────────────────────────

def ceiling_height(spec: dict, level: int) -> float:
    """床から天井面まで。src/lib/furniture.ts の ceilingHeight と同じ（最上階は屋根下、それ以外は上階スラブの下面）"""
    floor = next((f for f in spec["floors"] if f["level"] == level), None)
    if floor is None:
        return spec.get("wallHeightDefault", 2.4)
    top = all(f["level"] <= level for f in spec["floors"])
    return floor["height"] - (0.005 if top else 0.15)


def build_furniture(spec: dict, catalog: dict, col, floor_base, fl: float) -> list:
    """spec["furniture"] を Blender オブジェクトにする。アイテムごとに 1 オブジェクト"""
    import bmesh
    import bpy
    from mathutils import Matrix

    # three.js 座標（右手系・Y-up）→ Blender 座標（x, y, z）→（x, -z, y）。
    # C は行列式 +1 の回転なので、three.js 空間で組んだ変換を C で挟めばそのまま Blender で使える
    C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    mat_cache: dict = {}

    def material(key: str, color: str | None):
        spec_m = catalog["materials"].get(key, {"color": "#cccccc", "roughness": 0.6, "metalness": 0})
        c = color or spec_m["color"]
        name = f"furn_{key}_{c.lstrip('#')}"
        if name in mat_cache:
            return mat_cache[name]
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes.get("Principled BSDF")
        h = c.lstrip("#")
        srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        lin = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in srgb]
        b.inputs["Base Color"].default_value = (*lin, 1)
        b.inputs["Roughness"].default_value = spec_m.get("roughness", 0.6)
        b.inputs["Metallic"].default_value = spec_m.get("metalness", 0)
        if spec_m.get("coat"):
            b.inputs["Coat Weight"].default_value = spec_m["coat"]
            b.inputs["Coat Roughness"].default_value = 0.05
        if key == "carGlass":
            # 車のガラスは空を鏡のように映すと白く飛ぶため、反射を弱めて濃色ガラスに見せる
            b.inputs["Specular IOR Level"].default_value = 0.2
            b.inputs["Roughness"].default_value = 0.15
        if spec_m.get("sheen"):
            b.inputs["Sheen Weight"].default_value = spec_m["sheen"]
        if spec_m.get("emissive"):
            b.inputs["Emission Color"].default_value = (*lin, 1)
            b.inputs["Emission Strength"].default_value = spec_m["emissive"] * 2
        mat_cache[name] = m
        return m

    def rot_yxz(r):
        rx, ry, rz = (math.radians(v) for v in r)
        return Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(rz, 4, "Z")

    pre_axis = {"y": Matrix.Rotation(math.radians(-90), 4, "X"), "x": Matrix.Rotation(math.radians(90), 4, "Y"), "z": Matrix.Identity(4)}
    objs = []
    for item in spec.get("furniture") or []:
        cat = catalog["items"].get(item["type"])
        if not cat:
            continue
        outdoor = cat.get("place") == "parking"
        base_y = 0.0 if outdoor else fl + floor_base(spec, item.get("level", 0))
        if cat.get("mount") == "ceiling":
            base_y += ceiling_height(spec, item.get("level", 0))
        M_item = Matrix.Translation((item["x"], base_y, item["z"])) @ Matrix.Rotation(math.radians(item.get("ry", 0)), 4, "Y")
        model = cat.get("model")
        glb = MODEL_DIR / model["file"] if model else None
        if glb and glb.exists():
            # 実在の 3D モデル: GLB を取り込み（Blender 座標）、three.js 空間の配置を C で挟んで掛ける
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=str(glb))
            M = C @ M_item @ C.inverted()
            for o in [o for o in bpy.data.objects if o not in before]:
                if o.parent is None:
                    o.matrix_world = M @ o.matrix_world
                for c in list(o.users_collection):
                    c.objects.unlink(o)
                col.objects.link(o)
                if o.type == "MESH":
                    objs.append(o)
            continue
        mats: list = []
        bm = bmesh.new()
        for part in expand_parts(catalog, item["type"]):
            key = part["m"]
            color = item.get("color") if key == cat.get("colorable") else None
            mat = material(key, color)
            if mat not in mats:
                mats.append(mat)
            idx = mats.index(mat)
            tbm = bmesh.new()
            shape = part.get("s", "box")
            if shape == "box":
                bmesh.ops.create_cube(tbm, size=1.0)
                pre = Matrix.Identity(4)
            elif shape == "cyl":
                bmesh.ops.create_cone(tbm, cap_ends=True, cap_tris=False, segments=24, radius1=0.5, radius2=0.5, depth=1.0)
                pre = pre_axis[part.get("axis", "y")]
            else:
                bmesh.ops.create_icosphere(tbm, subdivisions=2, radius=0.5)
                pre = Matrix.Identity(4)
            sx, sy, sz = part["z"]
            if shape == "cyl" and part.get("axis", "y") == "x":
                scale = Matrix.Diagonal((sy, sx, sz, 1))  # 円柱の長さ方向を x に
            elif shape == "cyl" and part.get("axis") == "z":
                scale = Matrix.Diagonal((sx, sx, sy, 1))
            else:
                scale = Matrix.Diagonal((sx, sy, sz, 1))
            M = C @ M_item @ Matrix.Translation(part["p"]) @ rot_yxz(part.get("rot") or [0, 0, 0]) @ scale @ pre
            bmesh.ops.transform(tbm, matrix=M, verts=tbm.verts)
            r = part.get("r", 0)
            if shape == "box" and r > 0:
                rr = min(r, min(sx, sy, sz) / 2 - 1e-4)
                if rr > 0.002:
                    bmesh.ops.bevel(tbm, geom=list(tbm.edges), offset=rr, segments=3, affect="EDGES", profile=0.5)
            for f in tbm.faces:
                f.material_index = idx
                f.smooth = shape != "box" or r > 0
            tmp = bpy.data.meshes.new("tmp")
            tbm.to_mesh(tmp)
            tbm.free()
            bm.from_mesh(tmp)
            bpy.data.meshes.remove(tmp)
        mesh = bpy.data.meshes.new(f"furn_{item['type']}")
        bm.to_mesh(mesh)
        bm.free()
        for m in mats:
            mesh.materials.append(m)
        obj = bpy.data.objects.new(f"{cat['label']}", mesh)
        col.objects.link(obj)
        objs.append(obj)
    return objs

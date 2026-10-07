"""
BuildingSpec → Blender シーン生成・レンダリング・書き出し

使い方（Blender 4.2 LTS 以降、ヘッドレス実行）:
  blender -b --factory-startup -P blender/build_from_spec.py -- \
      --spec blender/samples/sample-spec.json --out blender/out/sample \
      [--renders exterior,interior,panorama] [--variants] [--sun-study] \
      [--samples 64] [--res 1600x900] [--engine cycles|eevee] [--no-render]

入力:
  - BuildingSpec JSON（Code App の「Blender 出力」タブで書き出したジョブ、または spec 単体）
  - ジョブ形式: {"spec": {...}, "variants": [{"id","name","materials"}], "renders": [...], "sunStudy": bool, "samples", "resolution"}

出力（--out 配下）:
  model.glb          … Code App の 3D 内見へ取り込める glTF（Y-up, m 単位。材質名 = Code App の材質キー）
  model.blend        … 設計チームが詳細化するための元データ（プロシージャル材質付き）
  renders/*.png      … 外観 / 内観 / 360° パノラマ / カラーバリエーション / 冬至の日影
  quantities.json    … 床面積・外壁面積・開口数などの概算数量
  manifest.json      … 生成物一覧

部材の形（基礎・サッシ・水切り・窓台・額縁・巾木・扉・軒天・破風・雨樋・ポーチ）は geometry.py、
仕上げ材のシェーダーは materials.py。どちらも Code App（src/lib/building-geometry.ts / procedural-textures.ts）と対応する。
座標系: spec は three.js 準拠（x=間口, y=上, z=奥行, 正面=+z=南）。Blender では X=x, Y=-z, Z=y。
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import furniture as furn  # noqa: E402
import geometry as geo  # noqa: E402
import lightmap as lm  # noqa: E402
import materials as matlib  # noqa: E402

LATITUDE = 35.68  # 東京
FL = geo.FL


# ───────────────────────── 引数 ─────────────────────────

def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="BuildingSpec → Blender")
    p.add_argument("--spec", required=True)
    p.add_argument("--out", default="blender/out/job")
    p.add_argument("--renders", default=None, help="exterior,interior,panorama のカンマ区切り")
    p.add_argument("--variants", action="store_true", help="ジョブの variants（提案プラン）で外観を一括レンダリング")
    p.add_argument("--sun-study", action="store_true", help="冬至 9/12/15 時の日影レンダリング")
    p.add_argument("--samples", type=int, default=None, help="既定: ジョブの samples または 64")
    p.add_argument("--res", default=None, help="既定: ジョブの resolution または 1600x900")
    p.add_argument("--engine", choices=["cycles", "eevee"], default="cycles")
    p.add_argument("--hour", type=float, default=10.0, help="外観・内観レンダリングの時刻")
    p.add_argument("--no-render", action="store_true", help="GLB / .blend / 数量のみ出力")
    p.add_argument("--no-bevel", action="store_true", help="角の面取り（ハイライト）を付けない")
    p.add_argument("--hdri", default=None, help="背景・反射に使う HDRI（.hdr / .exr）。拡散光は物理空 + 太陽のまま（太陽が二重にならない）")
    p.add_argument("--hdri-rotation", type=float, default=0.0, help="HDRI の鉛直軸まわりの回転（度）")
    p.add_argument("--lightmap", type=int, default=0, help="室内の間接光を焼き込む画像サイズ（例: 1024）。0 = 焼かない")
    return p.parse_args(argv)


def b(x: float, y: float, z: float) -> Vector:
    """spec 座標（three.js）→ Blender 座標"""
    return Vector((x, -z, y))


# ───────────────────────── メッシュ化 ─────────────────────────

def to_object(name: str, polys: list, mats: dict, col, y_offset: float = 0.0, bevel: float = 0.0):
    if not polys:
        return None
    keys: list[str] = []
    for key, _, _ in polys:
        if key not in keys:
            keys.append(key)
    index = {k: i for i, k in enumerate(keys)}
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for key, pts, uvs in polys:
        verts = [bm.verts.new(b(p[0], p[1] + y_offset, p[2])) for p in pts]
        try:
            face = bm.faces.new(verts)
        except ValueError:
            continue
        face.material_index = index[key]
        for loop, uv in zip(face.loops, uvs):
            loop[uv_layer].uv = uv
    # 同じ位置の頂点を結合して箱を閉じた立体にする（面取り・影の漏れ防止）
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0003)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for k in keys:
        mesh.materials.append(mats[k])
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(50)
        mod.use_clamp_overlap = True
    return obj


def build_scene(spec: dict, mats: dict, cols: dict, bevel: float) -> list:
    objs = []
    for name, polys in geo.build_all(spec).items():
        o = to_object(name, polys, mats, cols["building"], y_offset=FL, bevel=0.0 if name == "Ceiling" else bevel)
        if o:
            objs.append(o)
    lb = geo.Batch()
    extra = geo.add_landscape(lb, spec)
    ground = to_object("Site", lb.take(), mats, cols["site"])
    if ground:
        objs.append(ground)
    for i, (x, z) in enumerate(extra["trees"]):
        objs.extend(add_tree(x, z, 2.4 + (i % 3) * 0.7, mats["foliageDark" if i % 2 == 0 else "foliage"], mats["trunk"], cols["site"]))
    for x, z in extra["shrubs"]:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.32, location=b(x, 0.22, z))
        s = bpy.context.active_object
        s.scale = (1.2, 1.0, 0.8)
        s.data.materials.append(mats["foliageDark"])
        _move_to(s, cols["site"])
        objs.append(s)
    return objs


def _move_to(obj, col) -> None:
    for c in obj.users_collection:
        c.objects.unlink(obj)
    col.objects.link(obj)


def add_tree(x: float, z: float, h: float, leaf, bark, col) -> list:
    out = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.09, depth=h * 0.5, location=b(x, h * 0.25, z))
    trunk = bpy.context.active_object
    trunk.data.materials.append(bark)
    out.append(trunk)
    for i in range(3):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=h * (0.26 - i * 0.04), location=b(x + (i - 1) * h * 0.08, h * (0.55 + i * 0.13), z + ((i * 7) % 3 - 1) * h * 0.06))
        crown = bpy.context.active_object
        crown.scale.z = 1.15
        crown.data.materials.append(leaf)
        # ランダムな凹凸で葉の塊らしくする
        disp = crown.modifiers.new("Leaves", "DISPLACE")
        tex = bpy.data.textures.new(f"leafnoise{len(bpy.data.textures)}", "CLOUDS")
        tex.noise_scale = 0.25
        disp.texture = tex
        disp.strength = 0.25
        out.append(crown)
    for o in out:
        _move_to(o, col)
    return out


# ───────────────────────── 光・カメラ ─────────────────────────

def solar_position(hour: float, day_of_year: int) -> tuple[float, float]:
    """(高度, 方位[南=0, 西=+]) をラジアンで返す（簡易式）"""
    decl = math.radians(-23.44 * math.cos(2 * math.pi * (day_of_year + 10) / 365))
    lat = math.radians(LATITUDE)
    ha = math.radians(15 * (hour - 12))
    elev = math.asin(math.sin(lat) * math.sin(decl) + math.cos(lat) * math.cos(decl) * math.cos(ha))
    az = math.atan2(math.sin(ha), math.cos(ha) * math.sin(lat) - math.tan(decl) * math.cos(lat))
    return elev, az


def setup_world(hour: float, day: int, hdri: str | None = None, hdri_rotation: float = 0.0):
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes["Background"]
    try:
        sky = nt.nodes.new("ShaderNodeTexSky")
        sky.sky_type = "NISHITA"
        sky.sun_disc = False
        sky.air_density = 1.0
        sky.dust_density = 1.5
        nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 0.3
    except Exception:  # noqa: BLE001 — Sky ノード非対応版は単色背景
        bg.inputs["Color"].default_value = (0.55, 0.7, 0.9, 1)
        bg.inputs["Strength"].default_value = 0.8
    if hdri:
        # 実写の空はカメラから見える背景と、ガラス・金属の映り込みだけに使う。
        # 拡散光（室内の明るさ・影）は物理空 + 太陽のまま（HDRI の太陽と二重にならず、時刻の指定どおりの影になる）
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(Path(hdri).resolve()), check_existing=True)
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Rotation"].default_value[2] = math.radians(hdri_rotation)
        coord = nt.nodes.new("ShaderNodeTexCoord")
        nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
        bg_hdri = nt.nodes.new("ShaderNodeBackground")
        nt.links.new(env.outputs["Color"], bg_hdri.inputs["Color"])
        bg_hdri.inputs["Strength"].default_value = 0.6
        path = nt.nodes.new("ShaderNodeLightPath")
        either = nt.nodes.new("ShaderNodeMath")
        either.operation = "MAXIMUM"
        nt.links.new(path.outputs["Is Camera Ray"], either.inputs[0])
        nt.links.new(path.outputs["Is Glossy Ray"], either.inputs[1])
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(either.outputs["Value"], mix.inputs["Fac"])
        nt.links.new(bg.outputs["Background"], mix.inputs[1])
        nt.links.new(bg_hdri.outputs["Background"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], nt.nodes["World Output"].inputs["Surface"])
        print(f"[world] HDRI {Path(hdri).name}（背景・反射のみ）")
    light = bpy.data.lights.new("Sun", "SUN")
    light.energy = 4.5
    light.angle = math.radians(1.0)
    sun = bpy.data.objects.new("Sun", light)
    bpy.context.scene.collection.objects.link(sun)
    place_sun(sun, hour, day)
    return sun


def place_sun(sun, hour: float, day: int) -> None:
    elev, az = solar_position(hour, day)
    vec = Vector((-math.sin(az) * math.cos(elev), -math.cos(az) * math.cos(elev), math.sin(max(elev, 0.02))))
    sun.rotation_euler = vec.to_track_quat("Z", "Y").to_euler()
    for n in bpy.context.scene.world.node_tree.nodes:
        if n.bl_idname == "ShaderNodeTexSky":
            n.sun_elevation = max(0.02, elev)
            n.sun_rotation = math.pi - az


def add_room_lights(spec: dict, col) -> None:
    for f in spec["floors"]:
        y = FL + geo.floor_base(spec, f["level"]) + f["height"] - geo.SLAB - 0.08
        for r in f["rooms"]:
            light = bpy.data.lights.new(f"Light {r['name']}", "AREA")
            light.energy = max(50.0, r["area"] * 6)
            light.size = 1.0
            light.color = (1.0, 0.9, 0.78)
            obj = bpy.data.objects.new(light.name, light)
            obj.location = b(r["x"], y, r["z"])
            col.objects.link(obj)


def make_camera(name: str, loc: Vector, target: Vector, lens: float = 28):
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = lens
    cam_data.clip_start = 0.05
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (target - loc).to_track_quat("-Z", "Y").to_euler()
    return cam


def exterior_camera(spec: dict):
    W, D = spec["footprint"]["width"], spec["footprint"]["depth"]
    H = geo.total_height(spec) + FL
    size = max(W, D, H)
    cam = make_camera("ExteriorCam", b(W * 0.5 + size * 0.8, 1.6, D + size * 1.15), b(W / 2, H * 0.42, D / 2), 26)
    cam.data.shift_y = 0.14  # 2 点透視（建築写真の縦線を保つ）
    cam.rotation_euler[0] = math.radians(90)
    return cam


def biggest_room(spec: dict):
    best = None
    for f in spec["floors"]:
        for r in f["rooms"]:
            if best is None or r["area"] > best[1]["area"]:
                best = (f, r)
    if best is None:
        f = spec["floors"][0]
        s = f["slabs"][0]
        return f, {"name": "室内", "x": s["x"] + s["w"] / 2, "z": s["z"] + s["d"] / 2, "area": 0}
    return best


def interior_camera(spec: dict):
    f, r = biggest_room(spec)
    base = FL + geo.floor_base(spec, f["level"])
    cam = make_camera("InteriorCam", b(r["x"] - 0.8, base + 1.35, max(0.6, r["z"] - 2.2)), b(r["x"] + 0.6, base + 1.3, r["z"] + 3), 16)
    cam.rotation_euler[0] = math.radians(90)
    return cam


def panorama_camera(spec: dict):
    f, r = biggest_room(spec)
    base = FL + geo.floor_base(spec, f["level"])
    cam = make_camera("PanoramaCam", b(r["x"], base + 1.5, r["z"]), b(r["x"], base + 1.5, r["z"] + 1))
    cam.rotation_euler = (math.pi / 2, 0, 0)
    cam.data.type = "PANO"
    try:
        cam.data.panorama_type = "EQUIRECTANGULAR"
    except AttributeError:
        cam.data.cycles.panorama_type = "EQUIRECTANGULAR"
    return cam


# ───────────────────────── レンダリング・書き出し ─────────────────────────

def configure_render(engine: str, samples: int, res: str) -> None:
    scene = bpy.context.scene
    w, h = (int(v) for v in res.lower().split("x"))
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    if engine == "cycles":
        scene.render.engine = "CYCLES"
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
        scene.cycles.max_bounces = 8
        scene.cycles.diffuse_bounces = 4
        scene.cycles.glossy_bounces = 4
        scene.cycles.transmission_bounces = 8
        scene.cycles.caustics_reflective = False
        scene.cycles.caustics_refractive = False
        scene.cycles.blur_glossy = 1.0
        scene.cycles.device = "CPU"
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            for backend in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
                try:
                    prefs.compute_device_type = backend
                    prefs.get_devices()
                    if any(d.type != "CPU" for d in prefs.devices):
                        for d in prefs.devices:
                            d.use = True
                        scene.cycles.device = "GPU"
                        print(f"[render] GPU backend: {backend}")
                        break
                except TypeError:
                    continue
        except Exception:  # noqa: BLE001
            pass
    else:
        engines = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
        scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"


def render(cam, path: Path, res: str | None = None, exposure: float = 0.0) -> str:
    scene = bpy.context.scene
    scene.camera = cam
    scene.view_settings.exposure = exposure
    keep = (scene.render.resolution_x, scene.render.resolution_y)
    if res:
        scene.render.resolution_x, scene.render.resolution_y = (int(v) for v in res.split("x"))
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    scene.render.resolution_x, scene.render.resolution_y = keep
    print(f"[render] {path.name} {time.time() - t0:.1f}s")
    return str(path)


def count_openings(walls: list[dict], kinds: tuple[str, ...]) -> int:
    """接している同種の開口 rect を 1 箇所として数える（Code App の computeQuantities と同じ）"""
    items = [w for w in walls if w["kind"] in kinds]
    parent = list(range(len(items)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    eps = 0.06
    for i, a in enumerate(items):
        for j in range(i + 1, len(items)):
            c = items[j]
            if a["x"] <= c["x"] + c["w"] + eps and c["x"] <= a["x"] + a["w"] + eps and a["z"] <= c["z"] + c["d"] + eps and c["z"] <= a["z"] + a["d"] + eps:
                parent[find(i)] = find(j)
    return len({find(i) for i in range(len(items))})


def quantities(spec: dict) -> dict:
    floor_area = sum(s["w"] * s["d"] for f in spec["floors"] for s in f["slabs"])
    ext_wall = sum(max(w["w"], w["d"]) * f["height"] for f in spec["floors"] for w in f["walls"] if w.get("outside"))
    win = sum(count_openings(f["walls"], ("window", "glassdoor")) for f in spec["floors"])
    door = sum(count_openings(f["walls"], ("door",)) for f in spec["floors"])
    W, D, o = spec["footprint"]["width"], spec["footprint"]["depth"], spec["roof"]["overhang"]
    plan = (W + 2 * o) * (D + 2 * o)
    roof = plan if spec["roof"]["type"] == "flat" else plan / math.cos(math.radians(spec["roof"]["pitch"]))
    return {
        "floorArea": round(floor_area, 2),
        "floorAreaTsubo": round(floor_area / 3.30579, 2),
        "exteriorWallArea": round(ext_wall, 1),
        "windowCount": win,
        "doorCount": door,
        "roomCount": sum(len(f["rooms"]) for f in spec["floors"]),
        "roofArea": round(roof, 1),
        "rooms": [{"floor": f["level"] + 1, "name": r["name"], "area": r["area"]} for f in spec["floors"] for r in f["rooms"]],
    }


def export_glb(objs: list, mats: dict, materials_json: dict, path: Path, lightmaps: dict | None = None) -> str:
    """GLB はプロシージャル材質を書き出せないため、色だけの材質に一時的に差し替えて書き出す（名前は材質キー）。
    lightmaps があれば、そのオブジェクトだけ材質を複製して Occlusion（UV 2）にライトマップを載せる"""
    simple = matlib.simple_for_gltf(mats, materials_json)
    swaps = []
    copies = []
    for o in objs:
        if o.type != "MESH":
            continue
        for i, slot in enumerate(o.data.materials):
            key = next((k for k, m in mats.items() if m == slot), None)
            if key:
                swaps.append((o, i, slot))
                target = simple[key]
                if lightmaps and o.name in lightmaps:
                    target = simple[key].copy()
                    lm.attach_for_export(o, target, lightmaps[o.name])
                    copies.append((key, target))
                o.data.materials[i] = target
    for key, m in simple.items():
        m.name = key + "_tmp"
    # 書き出し後の名前 = キー（Code App が同名の PBR 材質へ差し替える）
    for key, m in mats.items():
        m.name = key + "__proc"
    for key, m in simple.items():
        m.name = key
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    # 複製した材質は Blender 上で "floor.001" などになる。Code App は末尾の .NNN を外してキーとして扱う
    for key, m in copies:
        m.name = key
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True, export_apply=True,
                              export_cameras=False, export_lights=False, export_yup=True, export_extras=True,
                              export_image_format="JPEG")
    for o, i, slot in swaps:
        o.data.materials[i] = slot
    for _, m in copies:
        bpy.data.materials.remove(m)
    for m in simple.values():
        bpy.data.materials.remove(m)
    for key, m in mats.items():
        m.name = key
    return str(path)


def main() -> None:
    args = parse_args()
    raw = json.loads(Path(args.spec).read_text(encoding="utf-8"))
    job = raw if "spec" in raw else {"spec": raw}
    spec = job["spec"]
    renders = (args.renders or ",".join(job.get("renders") or ["exterior", "interior", "panorama"])).split(",")
    variants = job.get("variants") or []
    sun_study = args.sun_study or bool(job.get("sunStudy"))
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    print(f"[spec] {spec.get('name')} floors={len(spec['floors'])} footprint={spec['footprint']} finishes="
          f"{spec['materials'].get('wallFinish', 'siding')}/{spec['materials'].get('roofFinish', 'slate')}/{spec['materials'].get('floorFinish', 'oak')}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    cols = {k: bpy.data.collections.new(n) for k, n in (("building", "Building"), ("site", "Site"), ("lights", "RoomLights"))}
    for c in cols.values():
        scene.collection.children.link(c)

    mats = matlib.build_materials(spec["materials"])
    objs = build_scene(spec, mats, cols, 0.0 if args.no_bevel else 0.006)
    furniture_col = bpy.data.collections.new("Furniture")
    scene.collection.children.link(furniture_col)
    furniture_objs = furn.build_furniture(spec, furn.load_catalog(job), furniture_col, geo.floor_base, FL)
    objs += furniture_objs
    print(f"[furniture] {len(furniture_objs)} items")
    add_room_lights(spec, cols["lights"])
    sun = setup_world(args.hour, 172, args.hdri or job.get("hdri"), args.hdri_rotation)

    manifest: dict = {"spec": spec.get("name"), "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "files": {}}
    lightmaps = None
    lightmap_size = args.lightmap or int(job.get("lightmap") or 0)
    if lightmap_size:
        # 昼の光（太陽 + 空）だけで焼く。部屋の照明は Code App 側でリアルタイムに足す
        cols["lights"].hide_render = True
        configure_render(args.engine if args.engine == "cycles" else "cycles", 64, "1600x900")
        lightmaps = lm.bake(objs, size=lightmap_size)
        lm.encode(lightmaps, objs)
    manifest["files"]["glb"] = export_glb(objs, mats, spec["materials"], out / "model.glb", lightmaps)
    q = quantities(spec)
    (out / "quantities.json").write_text(json.dumps(q, ensure_ascii=False, indent=2), encoding="utf-8")
    manifest["files"]["quantities"] = str(out / "quantities.json")

    if not args.no_render:
        configure_render(args.engine, args.samples or int(job.get("samples") or 64), args.res or job.get("resolution") or "1600x900")
        ext_cam = exterior_camera(spec)
        rd = out / "renders"
        cols["lights"].hide_render = True
        if "exterior" in renders:
            manifest["files"]["exterior"] = render(ext_cam, rd / "exterior.png")
        cols["lights"].hide_render = False
        # 内観は秋（10 月下旬）の午後の低い日差しで撮る（夏の高い太陽は軒で遮られ、日だまりができない）
        place_sun(sun, 14.5, 300)
        if "interior" in renders:
            manifest["files"]["interior"] = render(interior_camera(spec), rd / "interior.png", exposure=0.2)
        if "panorama" in renders:
            manifest["files"]["panorama"] = render(panorama_camera(spec), rd / "panorama.png", "2048x1024", exposure=0.2)
        cols["lights"].hide_render = True
        place_sun(sun, args.hour, 172)
        if variants and (args.variants or job.get("variants")):
            manifest["files"]["variants"] = {}
            for v in variants:
                vm = {**spec["materials"], **v["materials"]}
                mats = matlib.replace_materials(mats, vm)
                vid = v.get("id", str(len(manifest["files"]["variants"])))
                manifest["files"]["variants"][vid] = render(ext_cam, rd / f"variant-{vid}.png")
            mats = matlib.replace_materials(mats, spec["materials"])
        if sun_study:
            manifest["files"]["sunStudy"] = {}
            W, D = spec["footprint"]["width"], spec["footprint"]["depth"]
            top = make_camera("SunStudyCam", b(W / 2 + 0.01, 38, D / 2 + 6), b(W / 2, 0, D / 2), 35)
            for hour in (9, 12, 15):
                place_sun(sun, hour, 355)
                manifest["files"]["sunStudy"][f"{hour:02d}"] = render(top, rd / f"sun-winter-{hour:02d}00.png")
            place_sun(sun, args.hour, 172)

    blend = out / "model.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    manifest["files"]["blend"] = str(blend)
    manifest["quantities"] = q
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[done] {out}")


if __name__ == "__main__":
    main()

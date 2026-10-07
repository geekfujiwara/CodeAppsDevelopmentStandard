"""
仕上げ材ごとの Blender マテリアル（Cycles / EEVEE 用プロシージャルノード）

UV はメートル単位（geometry.py のワールド投影）なので、寸法はすべて実寸（m）で指定する。
材質名は Code App と同じキー（exteriorWall / roof / floor ...）にする。
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy


def hex_rgba(h: str, k: float = 1.0) -> tuple[float, float, float, float]:
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (min(1.0, lin[0] * k), min(1.0, lin[1] * k), min(1.0, lin[2] * k), 1.0)


class N:
    """ノード組み立ての小さなヘルパー"""

    def __init__(self, name: str) -> None:
        self.mat = bpy.data.materials.new(name)
        self.mat.use_nodes = True
        self.nt = self.mat.node_tree
        self.bsdf = self.nt.nodes.get("Principled BSDF")
        self.x = -1400
        tc = self.node("ShaderNodeTexCoord")
        self.uv = tc.outputs["UV"]

    def node(self, kind: str, **props):
        n = self.nt.nodes.new(kind)
        n.location = (self.x, 0)
        self.x += 160
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def link(self, a, b) -> None:
        self.nt.links.new(a, b)

    def math(self, op: str, a, b=None, c=None, clamp: bool = False):
        n = self.node("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                self.link(v, n.inputs[i])
        return n.outputs[0]

    def sep(self, vec=None):
        n = self.node("ShaderNodeSeparateXYZ")
        self.link(vec or self.uv, n.inputs[0])
        return n.outputs["X"], n.outputs["Y"]

    def noise(self, scale: float, detail: float = 4, vec=None, stretch: tuple | None = None):
        n = self.node("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        v = vec or self.uv
        if stretch:
            m = self.node("ShaderNodeMapping")
            m.inputs["Scale"].default_value = (stretch[0], stretch[1], 1)
            self.link(v, m.inputs["Vector"])
            v = m.outputs["Vector"]
        self.link(v, n.inputs["Vector"])
        return n.outputs["Fac"]

    def brick(self, width: float, row: float, mortar: float, c1, c2, mortar_color, offset: float = 0.5, bias: float = 0.0, vec=None):
        n = self.node("ShaderNodeTexBrick", offset=offset, offset_frequency=2)
        n.inputs["Scale"].default_value = 1.0
        n.inputs["Brick Width"].default_value = width
        n.inputs["Row Height"].default_value = row
        n.inputs["Mortar Size"].default_value = mortar
        n.inputs["Mortar Smooth"].default_value = 0.1
        n.inputs["Bias"].default_value = bias
        n.inputs["Color1"].default_value = c1
        n.inputs["Color2"].default_value = c2
        n.inputs["Mortar"].default_value = mortar_color
        self.link(vec or self.uv, n.inputs["Vector"])
        return n.outputs["Color"], n.outputs["Fac"]

    def mix_color(self, a, b, fac, blend: str = "MIX"):
        n = self.node("ShaderNodeMix", data_type="RGBA", blend_type=blend)
        for sock, v in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            elif isinstance(v, tuple):
                sock.default_value = v
            else:
                self.link(v, sock)
        return n.outputs[2]

    def rotate_uv(self):
        m = self.node("ShaderNodeMapping")
        m.inputs["Rotation"].default_value = (0, 0, 1.5707963)
        self.link(self.uv, m.inputs["Vector"])
        return m.outputs["Vector"]

    def finish(self, color, rough, height=None, strength: float = 0.3, distance: float = 0.004, metallic: float = 0.0, coat: float = 0.0):
        b = self.bsdf
        for sock, v in ((b.inputs["Base Color"], color), (b.inputs["Roughness"], rough)):
            if isinstance(v, (int, float, tuple)):
                sock.default_value = v
            else:
                self.link(v, sock)
        b.inputs["Metallic"].default_value = metallic
        if coat:
            b.inputs["Coat Weight"].default_value = coat
            b.inputs["Coat Roughness"].default_value = 0.15
        if height is not None:
            bump = self.node("ShaderNodeBump")
            bump.inputs["Strength"].default_value = strength
            bump.inputs["Distance"].default_value = distance
            self.link(height, bump.inputs["Height"])
            self.link(bump.outputs["Normal"], b.inputs["Normal"])
        return self.mat


def _vary(n: N, base: str, scale: float, amount: float):
    """低周波ノイズで色むらを付ける"""
    nz = n.noise(scale, 3)
    return n.mix_color(hex_rgba(base, 1 - amount), hex_rgba(base, 1 + amount * 0.5), nz)


# ── 外壁 ─────────────────────────────────────────────

def wall_siding(name, base):
    n = N(name)
    _, y = n.sep()
    lap = n.math("SUBTRACT", 1.0, n.math("FRACT", n.math("DIVIDE", y, 0.2)))  # 羽目板の重なり
    col, groove = n.brick(3.64, 0.2, 0.006, hex_rgba(base), hex_rgba(base, 0.97), hex_rgba(base, 0.55))
    col = n.mix_color(col, _vary(n, base, 1.5, 0.08), 0.5)
    h = n.math("SUBTRACT", lap, groove)
    return n.finish(col, 0.75, h, strength=0.5)


def wall_plaster(name, base):
    n = N(name)
    h = n.noise(40, 10)
    col = _vary(n, base, 1.2, 0.1)
    return n.finish(col, 0.92, h, strength=0.25, distance=0.003)


def wall_brick(name, base):
    n = N(name)
    col, mortar = n.brick(0.225, 0.075, 0.01, hex_rgba(base, 0.82), hex_rgba(base, 1.08), (0.48, 0.46, 0.42, 1), bias=0.1)
    grit = n.noise(80, 6)
    col = n.mix_color(col, n.mix_color(col, (0.05, 0.03, 0.02, 1), 0.35), n.math("GREATER_THAN", n.noise(9, 2), 0.62))
    h = n.math("SUBTRACT", n.math("MULTIPLY", grit, 0.25), mortar)
    return n.finish(col, 0.85, h, strength=0.7)


def wall_wood(name, base):
    n = N(name)
    v = n.rotate_uv()
    col, groove = n.brick(4.0, 0.12, 0.004, hex_rgba(base, 0.85), hex_rgba(base, 1.15), hex_rgba(base, 0.3), offset=0.0, bias=0.0, vec=v)
    grain = n.noise(3, 8, vec=n.uv, stretch=(40, 1.5, 1))
    col = n.mix_color(col, n.mix_color(col, hex_rgba(base, 0.6), 0.6), grain, "MULTIPLY")
    h = n.math("SUBTRACT", n.math("MULTIPLY", grain, 0.3), groove)
    return n.finish(col, 0.8, h, strength=0.5)


def wall_metal(name, base):
    n = N(name)
    x, _ = n.sep()
    s = n.math("SINE", n.math("MULTIPLY", x, 31.4159))  # 0.2m 周期の角波
    rib = n.math("MULTIPLY_ADD", s, 2.5, 0.5)
    rib = n.math("MINIMUM", n.math("MAXIMUM", rib, 0.0), 1.0)
    col = _vary(n, base, 0.8, 0.06)
    return n.finish(col, 0.38, rib, strength=0.6, distance=0.01, metallic=0.55)


# ── 屋根 ─────────────────────────────────────────────

def roof_slate(name, base):
    n = N(name)
    _, y = n.sep()
    lap = n.math("SUBTRACT", 1.0, n.math("FRACT", n.math("DIVIDE", y, 0.18)))
    col, gap = n.brick(0.3, 0.18, 0.006, hex_rgba(base, 0.85), hex_rgba(base, 1.12), hex_rgba(base, 0.4), bias=0.0)
    h = n.math("SUBTRACT", lap, gap)
    return n.finish(col, 0.7, h, strength=0.6)


def roof_kawara(name, base):
    n = N(name)
    x, y = n.sep()
    wave = n.math("MULTIPLY_ADD", n.math("COSINE", n.math("MULTIPLY", x, 20.944)), 0.5, 0.5)  # 0.3m 周期
    lap = n.math("SUBTRACT", 1.0, n.math("FRACT", n.math("DIVIDE", y, 0.3)))
    h = n.math("ADD", n.math("MULTIPLY", wave, 0.7), n.math("MULTIPLY", lap, 0.3))
    col = n.mix_color(hex_rgba(base, 0.7), hex_rgba(base, 1.1), wave)
    return n.finish(col, 0.35, h, strength=0.8, distance=0.02, coat=0.3)


def roof_metal(name, base):
    n = N(name)
    x, _ = n.sep()
    seam = n.math("LESS_THAN", n.math("FRACT", n.math("DIVIDE", x, 0.45)), 0.055)
    col = _vary(n, base, 0.6, 0.05)
    return n.finish(col, 0.33, seam, strength=0.8, distance=0.02, metallic=0.6)


# ── 床・内装・外構 ──────────────────────────────────────

def floor_oak(name, base):
    n = N(name)
    col, seam = n.brick(0.9, 0.15, 0.003, hex_rgba(base, 0.82), hex_rgba(base, 1.12), hex_rgba(base, 0.35), offset=0.37, bias=0.0)
    grain = n.noise(2.5, 10, stretch=(1.2, 30, 1))
    col = n.mix_color(col, n.mix_color(col, hex_rgba(base, 0.65), 0.7), grain, "MULTIPLY")
    rough = n.math("MULTIPLY_ADD", grain, 0.15, 0.3)
    h = n.math("SUBTRACT", n.math("MULTIPLY", grain, 0.15), seam)
    return n.finish(col, rough, h, strength=0.4, coat=0.15)


def floor_tile(name, base):
    n = N(name)
    col, grout = n.brick(0.6, 0.6, 0.004, hex_rgba(base, 0.97), hex_rgba(base, 1.03), (0.33, 0.32, 0.3, 1), offset=0.0)
    vein = n.noise(1.5, 6)
    col = n.mix_color(col, hex_rgba(base, 0.92), n.math("MULTIPLY", vein, 0.3))
    return n.finish(col, 0.18, n.math("MULTIPLY", grout, -1.0), strength=0.5)


def interior(name, base):
    n = N(name)
    return n.finish(_vary(n, base, 2, 0.03), 0.9, n.noise(120, 4), strength=0.08)


def grass(name, base):
    n = N(name)
    patch = n.noise(0.4, 4)
    col = n.mix_color(hex_rgba(base, 0.5), (0.3, 0.27, 0.1, 1), n.math("MULTIPLY", n.math("SUBTRACT", patch, 0.5), 1.2, clamp=True))
    col = n.mix_color(col, hex_rgba(base, 1.25), n.noise(25, 6), "MULTIPLY")
    return n.finish(col, 0.95, n.noise(60, 8), strength=0.9, distance=0.02)


def concrete(name, base):
    n = N(name)
    col = n.mix_color(_vary(n, base, 0.8, 0.12), hex_rgba(base, 0.75), n.math("GREATER_THAN", n.noise(18, 6), 0.68))
    return n.finish(col, 0.88, n.noise(70, 6), strength=0.25)


def plain(name, color, rough, metallic=0.0):
    n = N(name)
    return n.finish(hex_rgba(color), rough, metallic=metallic)


def glass(name):
    """建築 CG の定石: カメラから見ると透明ガラス、影の計算では素通し（室内に日だまりができる）"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.92, 0.96, 0.98, 1)
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["IOR"].default_value = 1.5
    b.inputs["Roughness"].default_value = 0.0
    out = nt.nodes.get("Material Output")
    lp = nt.nodes.new("ShaderNodeLightPath")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Shadow Ray"], mix.inputs["Fac"])
    nt.links.new(b.outputs["BSDF"], mix.inputs[1])
    nt.links.new(tr.outputs["BSDF"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return m


def foliage(name, color):
    n = N(name)
    col = n.mix_color(hex_rgba(color, 0.7), hex_rgba(color, 1.2), n.noise(6, 4))
    mat = n.finish(col, 0.75, n.noise(30, 4), strength=0.6)
    n.bsdf.inputs["Subsurface Weight"].default_value = 0.15
    return mat


WALL = {"siding": wall_siding, "plaster": wall_plaster, "brick": wall_brick, "wood": wall_wood, "metal": wall_metal}
ROOF = {"slate": roof_slate, "kawara": roof_kawara, "metal": roof_metal}
FLOOR = {"oak": floor_oak, "tile": floor_tile}

# ── 実写 PBR 材質ライブラリ（src/data/material-library.json） ─────────────────────

_ROOT = Path(__file__).resolve().parents[1]
_LIB_PATH = _ROOT / "src" / "data" / "material-library.json"
_LIBRARY: dict | None = None


def library() -> dict:
    """スロット → エントリ。ファイルが無い・壊れている場合は空（手続きシェーダーに戻る）"""
    global _LIBRARY
    if _LIBRARY is None:
        try:
            _LIBRARY = {e["slot"]: e for e in json.loads(_LIB_PATH.read_text(encoding="utf-8"))["materials"]}
        except (OSError, ValueError, KeyError):
            _LIBRARY = {}
    return _LIBRARY


def library_material(name: str, slot: str, hex_color: str | None, metallic: float = 0.0):
    """Code App と同じ画像・同じ実寸・同じ色合わせ（色 / 平均色を乗算）で Principled BSDF を組む。
    画像が無ければ None を返し、呼び出し側が手続きシェーダーにフォールバックする"""
    e = library().get(slot)
    if not e:
        return None
    folder = _ROOT / "public" / e["path"]
    files = {k: folder / f"{k}.jpg" for k in ("color", "normal", "rough")}
    if not all(f.is_file() for f in files.values()):
        return None
    n = N(name)
    m = n.node("ShaderNodeMapping")
    s = 1.0 / float(e["tile"])
    m.inputs["Scale"].default_value = (s, s, 1)
    m.inputs["Rotation"].default_value = (0, 0, math.radians(-float(e.get("rotate", 0))))
    n.link(n.uv, m.inputs["Vector"])

    def tex(key: str, color_space: str):
        t = n.node("ShaderNodeTexImage")
        t.image = bpy.data.images.load(str(files[key]), check_existing=True)
        t.image.colorspace_settings.name = color_space
        t.interpolation = "Cubic"
        n.link(m.outputs["Vector"], t.inputs["Vector"])
        return t

    col = tex("color", "sRGB")
    rough = tex("rough", "Non-Color")
    nrm = tex("normal", "Non-Color")
    color_out = col.outputs["Color"]
    if hex_color and not e.get("keepColor"):
        target = hex_rgba(hex_color)
        # albedoScale: 選ばれた色を実在の反射率に合わせる係数（芝 0.55 など。src/lib/material-library.ts と同じ式）
        k = float(e.get("albedoScale", 1.0))
        tint = tuple(min(4.0, target[i] * k / max(float(e["avgLinear"][i]), 0.002)) for i in range(3))
        color_out = n.mix_color(color_out, (*tint, 1.0), 1.0, "MULTIPLY")
    nm = n.node("ShaderNodeNormalMap")
    # 草・砂利など凹凸の強い素材の法線は、斜めから見ると表面全体が太陽側に倒れて白っぽく光る。
    # 屋外の地面は強度を下げる（Code App 側は normalScale で同じ値を使う）
    nm.inputs["Strength"].default_value = float(e.get("normalStrength", 1.0))
    n.link(nrm.outputs["Color"], nm.inputs["Color"])
    n.link(nm.outputs["Normal"], n.bsdf.inputs["Normal"])
    n.link(color_out, n.bsdf.inputs["Base Color"])
    n.link(rough.outputs["Color"], n.bsdf.inputs["Roughness"])
    n.bsdf.inputs["Metallic"].default_value = metallic
    # 植物・地面は鏡面反射が弱い。既定（0.5）のままだと低い角度で空を映し、芝が白っぽく見える
    n.bsdf.inputs["Specular IOR Level"].default_value = float(e.get("specular", 0.5))
    n.mat["librarySlot"] = slot
    return n.mat


def _finish(name: str, slot: str, hex_color: str, procedural, metallic: float = 0.0):
    """実写材質があればそれを、無ければ手続きシェーダーを使う"""
    return library_material(name, slot, hex_color, metallic) or procedural(name, hex_color)


def build_materials(m: dict) -> dict:
    """材質キー → Material。m は BuildingSpec.materials（色 + 仕上げ材）"""
    wf, rf, ff = m.get("wallFinish", "siding"), m.get("roofFinish", "slate"), m.get("floorFinish", "oak")
    metal = lambda finish: 0.55 if finish == "metal" else 0.0  # noqa: E731
    return {
        "exteriorWall": _finish("exteriorWall", f"wall:{wf}", m["exteriorWall"], WALL.get(wf, wall_siding), metal(wf)),
        "interiorWall": interior("interiorWall", m["interiorWall"]),
        "floor": _finish("floor", f"floor:{ff}", m["floor"], FLOOR.get(ff, floor_oak)),
        "ceiling": interior("ceiling", "#f7f6f2"),
        "roof": _finish("roof", f"roof:{rf}", m["roof"], ROOF.get(rf, roof_slate), metal(rf)),
        "flatRoof": plain("flatRoof", m["roof"], 0.9),
        "soffit": plain("soffit", "#f1efe9", 0.85),
        "fascia": plain("fascia", m["trim"], 0.45, 0.35),
        "sash": plain("sash", m["trim"], 0.35, 0.6),
        "windowBoard": plain("windowBoard", "#efe9df", 0.55),
        "casing": plain("casing", "#f3f1ec", 0.6),
        "baseboard": plain("baseboard", "#f0ede6", 0.6),
        "door": plain("door", "#e9e2d5", 0.5),
        "section": plain("section", "#e7e4dd", 0.9),
        "foundation": library_material("foundation", "concrete", "#a9a69f") or concrete("foundation", "#a9a69f"),
        "concrete": library_material("concrete", "concrete", "#c2bfb7") or concrete("concrete", "#c2bfb7"),
        "road": library_material("road", "road", None) or concrete("road", "#5d6063"),
        "glass": glass("glass"),
        "ground": _finish("ground", "grass", m["ground"], grass),
        "foliage": foliage("foliage", "#4f7a3a"),
        "foliageDark": foliage("foliageDark", "#3d6330"),
        "trunk": plain("trunk", "#6b4a2f", 0.9),
    }


def replace_materials(current: dict, m: dict) -> dict:
    """バリエーション切替: 新しい材質を作り、既存の利用箇所をすべて差し替える（名前はキーのまま）"""
    fresh = build_materials(m)
    for key, new in fresh.items():
        old = current.get(key)
        if old is not None:
            old.user_remap(new)
            bpy.data.materials.remove(old)
        new.name = key
    return fresh


def simple_for_gltf(mats: dict, m: dict) -> dict:
    """GLB 書き出し用の単純な材質（色・粗さ・金属度だけ。名前はキーと同じ）"""
    colors = {
        "exteriorWall": m["exteriorWall"], "interiorWall": m["interiorWall"], "floor": m["floor"], "roof": m["roof"],
        "flatRoof": m["roof"], "fascia": m["trim"], "sash": m["trim"], "ground": m["ground"],
        "ceiling": "#f7f6f2", "soffit": "#f1efe9", "windowBoard": "#efe9df", "casing": "#f3f1ec", "baseboard": "#f0ede6",
        "door": "#e9e2d5", "section": "#e7e4dd", "foundation": "#a9a69f", "concrete": "#c2bfb7", "road": "#5d6063",
        "glass": "#dbe8ee", "foliage": "#4f7a3a", "foliageDark": "#3d6330", "trunk": "#6b4a2f",
    }
    out = {}
    for key in mats:
        mat = bpy.data.materials.new(f"{key}__gltf")
        mat.use_nodes = True
        b = mat.node_tree.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = hex_rgba(colors.get(key, "#cccccc"))
        b.inputs["Roughness"].default_value = 0.6
        if key in ("sash", "fascia"):
            b.inputs["Metallic"].default_value = 0.5
        if key == "glass":
            b.inputs["Alpha"].default_value = 0.2
            if hasattr(mat, "surface_render_method"):
                mat.surface_render_method = "BLENDED"
        out[key] = mat
    return out

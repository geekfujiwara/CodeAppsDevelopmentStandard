"""室内の間接光をライトマップに焼き込み、GLB に載せる（Cycles）。

- 対象: 建物の床・壁・天井（Floor*F / Ceiling）。家具・外構は対象外（リアルタイムの光で十分）
- 焼くのは間接光だけ（pass_filter={'INDIRECT'}）。直射（太陽・影）と照明は Code App 側がリアルタイムで足す（二重に明るくしない）
- 2 つ目の UV（"Lightmap"）を lightmap_pack で作り、オブジェクトごとに 1 枚の画像へ焼く
- GLB には glTF の occlusionTexture（texCoord = 1）として載せる。Code App は読み込み時に lightMap へ移す
  （glTF にライトマップの標準が無いため。R チャンネルだけを使う = 明るさのみ、色の照り返しは持たない）
- 8bit に収めるため「値 / scale」で保存し、scale をオブジェクトの extras（lightmapScale）に書く
"""
from __future__ import annotations

import time

import bpy

from lightmap_math import masked_blur

LM_UV = "Lightmap"


def _gltf_output_group():
    """glTF エクスポーターが読む「glTF Material Output」ノードグループ（Occlusion 入力）"""
    g = bpy.data.node_groups.get("glTF Material Output")
    if g is None:
        g = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return g


def targets(objs: list) -> list:
    return [o for o in objs if o.type == "MESH" and (o.name.startswith("Floor") or o.name == "Ceiling")]


def bake(objs: list, size: int = 1024, samples: int = 32) -> dict:
    """objs のうち建物の室内部材に間接光を焼く。オブジェクト名 → 画像"""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    keep_samples = scene.cycles.samples
    scene.cycles.samples = samples
    scene.render.bake.margin = 4
    scene.render.bake.use_clear = True
    images: dict = {}
    for o in targets(objs):
        t0 = time.time()
        me = o.data
        uv = me.uv_layers.get(LM_UV) or me.uv_layers.new(name=LM_UV)
        render_uv = me.uv_layers[0]
        me.uv_layers.active = uv
        render_uv.active_render = True
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.lightmap_pack(PREF_CONTEXT="ALL_FACES", PREF_PACK_IN_ONE=True, PREF_NEW_UVLAYER=False, PREF_MARGIN_DIV=0.3)
        bpy.ops.object.mode_set(mode="OBJECT")
        img = bpy.data.images.new(f"LM_{o.name}", size, size, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        nodes = []
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.use_nodes:
                continue
            n = m.node_tree.nodes.new("ShaderNodeTexImage")
            n.image = img
            m.node_tree.nodes.active = n
            nodes.append((m, n))
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"INDIRECT"}, use_selected_to_active=False)
        for m, n in nodes:
            m.node_tree.nodes.remove(n)
        images[o.name] = img
        print(f"[lightmap] {o.name} {time.time() - t0:.1f}s")
    scene.cycles.samples = keep_samples
    return images


def encode(images: dict, objs: list, quality: int = 85) -> None:
    """浮動小数の画像を 8bit（値 / scale）にし、scale を extras に書く"""
    for o in targets(objs):
        img = images.get(o.name)
        if not img:
            continue
        import numpy as np
        px = np.empty(len(img.pixels), dtype=np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(-1, 4)
        lum = px[:, 0] * 0.2126 + px[:, 1] * 0.7152 + px[:, 2] * 0.0722
        # 焼き込みはノイズ除去されない。間接光は低周波なので、UV の島の中だけでぼかす（島の外 = 0 の画素で重みを割る）
        w, h = img.size
        lum = masked_blur(lum.reshape(h, w), radius=4).ravel()
        pos = lum[lum > 0]
        # 外れ値（窓際の直射の漏れ）で全体が暗くならないよう 99.5 パーセンタイルを上限にする
        scale = float(max(np.percentile(pos, 99.5) if pos.size else 1.0, 1e-3))
        g = np.clip(lum / scale, 0, 1)
        enc = np.stack([g, g, g, np.ones_like(g)], axis=1).astype(np.float32).ravel()
        out = bpy.data.images.new(f"LM8_{o.name}", img.size[0], img.size[1], float_buffer=False)
        out.colorspace_settings.name = "Non-Color"
        out.pixels.foreach_set(enc)
        out.file_format = "JPEG"
        out.pack()
        bpy.data.images.remove(img)
        images[o.name] = out
        o["lightmapScale"] = round(scale, 4)


def attach_for_export(o, mat, img):
    """書き出し用の材質（色だけ）に Occlusion = ライトマップ（UV "Lightmap"）を足す"""
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = LM_UV
    nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(tex.outputs["Color"], sep.inputs["Color"])
    grp = nt.nodes.new("ShaderNodeGroup")
    grp.node_tree = _gltf_output_group()
    nt.links.new(sep.outputs["Red"], grp.inputs["Occlusion"])

"""
BuildingSpec → 部材ポリゴン（bpy 非依存。通常の Python でもテストできる）

src/lib/building-geometry.ts と同じ寸法・同じ部材構成で組み立てる。座標は spec（three.js 準拠: x=間口, y=上, z=奥行）。
ポリゴンは「材質キー・頂点列・UV（m 単位のワールド投影）」で保持し、Blender 側で mesh に変換する。
材質キーは Code App のマテリアル名と一致させる（GLB を取り込んだときに同じ PBR 材質へ差し替えるため）。
"""
from __future__ import annotations

import math

from stairs import RAIL_H, opening_of, slabs_with_openings, stair_layout, subtract_rect

SLAB = 0.15
FL = 0.45  # 基礎の立ち上がり（地盤面 → 1F 床）。src/lib/building-spec.ts の FLOOR_LEVEL と同じ

V3 = tuple[float, float, float]


def _newell(pts: list[V3]) -> V3 | None:
    nx = ny = nz = 0.0
    n = len(pts)
    for i in range(n):
        a, c = pts[i], pts[(i + 1) % n]
        nx += (a[1] - c[1]) * (a[2] + c[2])
        ny += (a[2] - c[2]) * (a[0] + c[0])
        nz += (a[0] - c[0]) * (a[1] + c[1])
    ln = math.sqrt(nx * nx + ny * ny + nz * nz)
    if ln < 1e-9:
        return None
    return (nx / ln, ny / ln, nz / ln)


def default_uv(n: V3):
    ax, ay, az = abs(n[0]), abs(n[1]), abs(n[2])
    if ay >= 0.7:
        return lambda p: (p[0], p[2])
    if ax >= az:
        return lambda p: (p[2], p[1])
    return lambda p: (p[0], p[1])


def slope_uv(n: V3):
    s = math.hypot(n[0], n[2])
    if s < 0.05:
        return None
    hx, hz = n[0] / s, n[2] / s
    return lambda p: (p[0] * -hz + p[2] * hx, p[1] / s)


class Batch:
    def __init__(self) -> None:
        self.polys: list[tuple[str, list[V3], list[tuple[float, float]]]] = []

    def poly(self, key: str, pts: list[V3], hint: V3 | None = None, uvfn=None) -> None:
        n = _newell(pts)
        if n is None:
            return
        if hint is not None and n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0:
            pts = list(reversed(pts))
            n = (-n[0], -n[1], -n[2])
        f = uvfn or default_uv(n)
        self.polys.append((key, list(pts), [f(p) for p in pts]))

    def box(self, x0, y0, z0, x1, y1, z1, keys: dict) -> None:
        if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
            return
        faces = {
            "px": ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
            "nx": ([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], (-1, 0, 0)),
            "py": ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0)),
            "ny": ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
            "pz": ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
            "nz": ([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1)),
        }
        for k, (pts, hint) in faces.items():
            key = keys.get(k)
            if key:
                self.poly(key, pts, hint)

    def solid(self, x0, y0, z0, x1, y1, z1, key: str) -> None:
        self.box(min(x0, x1), min(y0, y1), min(z0, z1), max(x0, x1), max(y0, y1), max(z0, z1),
                 {k: key for k in ("px", "nx", "py", "ny", "pz", "nz")})

    def take(self):
        polys, self.polys = self.polys, []
        return polys


def floor_base(spec: dict, level: int) -> float:
    return sum(f["height"] for f in spec["floors"] if f["level"] < level)


def total_height(spec: dict) -> float:
    return sum(f["height"] for f in spec["floors"])


# ── 壁・開口部 ────────────────────────────────────────

class Axis:
    def __init__(self, w: dict) -> None:
        out = set(w.get("outside") or [])
        self.along = w["w"] >= w["d"]
        if self.along:
            self.a0, self.a1, self.d0, self.d1 = w["x"], w["x"] + w["w"], w["z"], w["z"] + w["d"]
            self.ext = 1 if "+z" in out else -1 if "-z" in out else 0
        else:
            self.a0, self.a1, self.d0, self.d1 = w["z"], w["z"] + w["d"], w["x"], w["x"] + w["w"]
            self.ext = 1 if "+x" in out else -1 if "-x" in out else 0


def box_ad(b: Batch, ax: Axis, a0, a1, y0, y1, d0, d1, key: str) -> None:
    if ax.along:
        b.solid(a0, y0, d0, a1, y1, d1, key)
    else:
        b.solid(d0, y0, a0, d1, y1, a1, key)


def _overlap(x0, z0, x1, z1, r: dict) -> bool:
    return x0 < r["x"] + r["w"] - 0.005 and r["x"] + 0.005 < x1 and z0 < r["z"] + r["d"] - 0.005 and r["z"] + 0.005 < z1


def _wall_keys(w: dict) -> dict:
    out = set(w.get("outside") or [])
    k = lambda s: "exteriorWall" if s in out else "interiorWall"  # noqa: E731
    return {"px": k("+x"), "nx": k("-x"), "pz": k("+z"), "nz": k("-z")}


def _baseboards(b: Batch, w: dict, base: float) -> None:
    out = set(w.get("outside") or [])
    h, t = 0.06, 0.012
    x1, z1 = w["x"] + w["w"], w["z"] + w["d"]
    if w["w"] >= w["d"]:
        if "+z" not in out:
            b.solid(w["x"], base, z1, x1, base + h, z1 + t, "baseboard")
        if "-z" not in out:
            b.solid(w["x"], base, w["z"] - t, x1, base + h, w["z"], "baseboard")
    else:
        if "+x" not in out:
            b.solid(x1, base, w["z"], x1 + t, base + h, z1, "baseboard")
        if "-x" not in out:
            b.solid(w["x"] - t, base, w["z"], w["x"], base + h, z1, "baseboard")


def _sash(b: Batch, ax: Axis, yb: float, yt: float) -> float:
    f, fd = 0.04, 0.035
    d_ext = ax.d1 if ax.ext > 0 else ax.d0
    dc = (ax.d0 + ax.d1) / 2 if ax.ext == 0 else d_ext - ax.ext * 0.05
    a0, a1 = ax.a0, ax.a1
    box_ad(b, ax, a0, a0 + f, yb, yt, dc - fd, dc + fd, "sash")
    box_ad(b, ax, a1 - f, a1, yb, yt, dc - fd, dc + fd, "sash")
    box_ad(b, ax, a0, a1, yt - f, yt, dc - fd, dc + fd, "sash")
    box_ad(b, ax, a0, a1, yb, yb + f, dc - fd, dc + fd, "sash")
    if a1 - a0 > 1.0:
        m = (a0 + a1) / 2
        box_ad(b, ax, m - 0.03, m + 0.03, yb, yt, dc - fd, dc + fd, "sash")
    box_ad(b, ax, a0 + f, a1 - f, yb + f, yt - f, dc - 0.004, dc + 0.004, "glass")
    return dc


def _casing(b: Batch, ax: Axis, side: int, yb: float, yt: float, key: str) -> None:
    d_f = ax.d1 if side > 0 else ax.d0
    d0, d1 = sorted((d_f, d_f + side * 0.012))
    cw = 0.05
    box_ad(b, ax, ax.a0 - cw, ax.a0, yb, yt + cw, d0, d1, key)
    box_ad(b, ax, ax.a1, ax.a1 + cw, yb, yt + cw, d0, d1, key)
    box_ad(b, ax, ax.a0 - cw, ax.a1 + cw, yt, yt + cw, d0, d1, key)


def _door_leaf(b: Batch, ax: Axis, base: float, yt: float, walls: list, host: dict, prefer: int) -> None:
    L = ax.a1 - ax.a0 - 0.02
    sides = [1, -1] if prefer == 0 else [prefer, -prefer]
    for s in sides:
        d_f = ax.d1 if s > 0 else ax.d0
        dd0, dd1 = sorted((d_f + s * 0.015, d_f + s * 0.05))
        for la0, la1 in ((ax.a1, ax.a1 + L), (ax.a0 - L, ax.a0)):
            x0, z0, x1, z1 = (la0, dd0, la1, dd1) if ax.along else (dd0, la0, dd1, la1)
            if any(w is not host and _overlap(x0, z0, x1, z1, w) for w in walls):
                continue
            box_ad(b, ax, la0, la1, base + 0.005, yt - 0.01, dd0, dd1, "door")
            hx = la1 - 0.08 if la0 == ax.a1 else la0 + 0.08
            hd = dd1 if s > 0 else dd0
            h0, h1 = sorted((hd, hd + s * 0.05))
            box_ad(b, ax, hx - 0.06, hx + 0.06, base + 0.93, base + 0.96, h0, h1, "sash")
            return


def _porch(b: Batch, ax: Axis) -> None:
    d_ext = ax.d1 if ax.ext > 0 else ax.d0
    s = ax.ext
    p0, p1 = sorted((d_ext, d_ext + s * 1.2))
    s0, s1 = sorted((d_ext + s * 1.2, d_ext + s * 1.5))
    box_ad(b, ax, ax.a0 - 0.45, ax.a1 + 0.45, -FL, -0.15, p0, p1, "concrete")
    box_ad(b, ax, ax.a0 - 0.45, ax.a1 + 0.45, -FL, -0.3, s0, s1, "concrete")


def add_wall(b: Batch, w: dict, base: float, height: float, spec: dict, walls: list, level: int) -> None:
    # 上に階があるときは天端を上の階の床スラブの下面で止め、外壁はスラブの小口を外側の面だけの帯で覆う（building-geometry.ts と同じ）
    has_upper = any(f["level"] > level for f in spec["floors"])
    top = base + height - (SLAB if has_upper else 0)
    sill, head = spec["openings"]["sill"], spec["openings"]["head"]
    keys = {**_wall_keys(w), "py": "section", "ny": None}
    x1, z1 = w["x"] + w["w"], w["z"] + w["d"]
    kind = w["kind"]
    if has_upper and w.get("outside"):
        face = {"+x": "px", "-x": "nx", "+z": "pz", "-z": "nz"}
        b.box(w["x"], top, w["z"], x1, top + SLAB, z1, {face[s]: "exteriorWall" for s in w["outside"]})
    if kind == "wall":
        b.box(w["x"], base, w["z"], x1, top, z1, keys)
        _baseboards(b, w, base)
        return
    ax = Axis(w)
    yt = base + head
    yb = base + sill if kind == "window" else base
    b.box(w["x"], yt, w["z"], x1, top, z1, {**keys, "ny": "interiorWall"})
    room = 0 if ax.ext == 0 else -ax.ext
    if kind == "window":
        b.box(w["x"], base, w["z"], x1, yb, z1, {**keys, "py": "windowBoard"})
        _baseboards(b, w, base)
    if kind in ("window", "glassdoor"):
        dc = _sash(b, ax, yb, yt)
        if ax.ext != 0:
            d_ext = ax.d1 if ax.ext > 0 else ax.d0
            d_int = ax.d0 if ax.ext > 0 else ax.d1
            if kind == "window":
                e0, e1 = sorted((d_ext, d_ext + ax.ext * 0.06))
                box_ad(b, ax, ax.a0 - 0.03, ax.a1 + 0.03, yb - 0.025, yb, e0, e1, "sash")
                i0, i1 = sorted((dc, d_int + room * 0.03))
                box_ad(b, ax, ax.a0 - 0.02, ax.a1 + 0.02, yb, yb + 0.02, i0, i1, "windowBoard")
            _casing(b, ax, room, yb if kind == "window" else base, yt, "casing")
        return
    for s in (1, -1):
        _casing(b, ax, s, base, yt, "sash" if s == ax.ext else "casing")
    _door_leaf(b, ax, base, yt, walls, w, ax.ext)
    if level == 0 and ax.ext != 0:
        _porch(b, ax)


def add_foundation(b: Batch, walls: list) -> None:
    for w in walls:
        out = set(w.get("outside") or [])
        if not out:
            continue
        e = 0.015
        x0 = w["x"] - (e if "-x" in out else 0)
        x1 = w["x"] + w["w"] + (e if "+x" in out else 0)
        z0 = w["z"] - (e if "-z" in out else 0)
        z1 = w["z"] + w["d"] + (e if "+z" in out else 0)
        k = lambda s: "foundation" if s in out else None  # noqa: E731
        b.box(x0, -FL, z0, x1, 0, z1, {"px": k("+x"), "nx": k("-x"), "pz": k("+z"), "nz": k("-z")})
        if w["kind"] == "glassdoor":
            ax = Axis(w)
            if ax.ext == 0:
                continue
            d_ext = ax.d1 if ax.ext > 0 else ax.d0
            m = (ax.a0 + ax.a1) / 2
            s0, s1 = sorted((d_ext + ax.ext * e, d_ext + ax.ext * 0.5))
            box_ad(b, ax, m - 0.35, m + 0.35, -FL, -0.22, s0, s1, "concrete")


def add_slab(b: Batch, r: dict, base: float) -> None:
    b.box(r["x"], base - SLAB, r["z"], r["x"] + r["w"], base, r["z"] + r["d"], {"py": "floor", "ny": "ceiling"})


def add_top_ceiling(b: Batch, spec: dict) -> None:
    top = spec["floors"][-1]
    y = floor_base(spec, top["level"]) + top["height"] - 0.005
    for s in top["slabs"]:
        b.poly("ceiling", [(s["x"], y, s["z"]), (s["x"] + s["w"], y, s["z"]), (s["x"] + s["w"], y, s["z"] + s["d"]), (s["x"], y, s["z"] + s["d"])], (0, -1, 0))


def lower_roof_rects(spec: dict) -> list:
    """下の階だけの部分（上の階の床に覆われない範囲）。building-geometry.ts の lowerRoofRects と同じ"""
    out = []
    floors = spec["floors"]
    for floor in floors:
        upper = next((f for f in floors if f["level"] == floor["level"] + 1), None)
        if upper is None:
            continue
        rects = list(floor["slabs"])
        for u in upper["slabs"]:
            rects = [p for r in rects for p in subtract_rect(r, u)]
        rects = [r for r in rects if r["w"] >= 0.04 and r["d"] >= 0.04]
        if rects:
            out.append((floor["level"], rects))
    return out


def add_lower_roofs(b: Batch, spec: dict) -> None:
    """陸屋根（上面 = 屋根、下面 = 天井。側面は作らない）。building-geometry.ts の addLowerRoofs と同じ"""
    for level, rects in lower_roof_rects(spec):
        top = floor_base(spec, level + 1)
        for r in rects:
            b.box(r["x"], top - SLAB, r["z"], r["x"] + r["w"], top, r["z"] + r["d"], {"py": "flatRoof", "ny": "ceiling"})

# ── 1 つの階（床・壁・階段・吹き抜け）。building-geometry.ts の addFloor と同じ順 ──

TREAD_T = 0.03
NOSING = 0.02
GUARD_H = 0.95
NOSE = {"+x": (NOSING, 0), "-x": (-NOSING, 0), "+z": (0, NOSING), "-z": (0, -NOSING)}


def add_floor(b: Batch, spec: dict, floor: dict) -> None:
    base = floor_base(spec, floor["level"])
    for s in slabs_with_openings(spec, floor):
        add_slab(b, s, base)
    for w in floor["walls"]:
        add_wall(b, w, base, floor["height"], spec, floor["walls"], floor["level"])
    for st in spec.get("stairs") or []:
        if st["fromLevel"] == floor["level"]:
            add_stair(b, spec, st)
        if st["fromLevel"] == floor["level"] - 1:
            add_stair_well(b, spec, st)


def add_stair(b: Batch, spec: dict, s: dict) -> None:
    lay = stair_layout(spec, s)
    base = floor_base(spec, s["fromLevel"])
    side = "interiorWall"
    for st in lay["steps"]:
        b.box(st["x0"], base, st["z0"], st["x1"], base + st["top"] - TREAD_T, st["z1"], {"px": side, "nx": side, "pz": side, "nz": side})
        nx, nz = NOSE[st["down"]]
        b.solid(st["x0"] + min(0, nx), base + st["top"] - TREAD_T, st["z0"] + min(0, nz),
                st["x1"] + max(0, nx), base + st["top"], st["z1"] + max(0, nz), "floor")
    rail = [(x, base + y, z) for x, y, z in lay["rail"]]
    for i in range(len(rail) - 1):
        _bar(b, rail[i], rail[i + 1], 0.04, "casing")
    for x, y, z in (rail[0], rail[-1]):
        b.solid(x - 0.02, y - RAIL_H, z - 0.02, x + 0.02, y, z + 0.02, "casing")


def add_stair_well(b: Batch, spec: dict, s: dict) -> None:
    base = floor_base(spec, s["fromLevel"] + 1)
    y0 = base - SLAB
    o = opening_of(s)
    x0, x1, z0, z1 = o["x"], o["x"] + o["w"], o["z"], o["z"] + o["d"]
    b.poly("interiorWall", [(x0, y0, z0), (x0, base, z0), (x0, base, z1), (x0, y0, z1)], (1, 0, 0))
    b.poly("interiorWall", [(x1, y0, z0), (x1, base, z0), (x1, base, z1), (x1, y0, z1)], (-1, 0, 0))
    b.poly("interiorWall", [(x0, y0, z0), (x1, y0, z0), (x1, base, z0), (x0, base, z0)], (0, 0, 1))
    b.poly("interiorWall", [(x0, y0, z1), (x1, y0, z1), (x1, base, z1), (x0, base, z1)], (0, 0, -1))
    k = "interiorWall"
    for g in stair_layout(spec, s)["guards"]:
        b.box(g["x"], base, g["z"], g["x"] + g["w"], base + GUARD_H, g["z"] + g["d"], {"px": k, "nx": k, "pz": k, "nz": k, "py": "casing"})


def _bar(b: Batch, p0: V3, p1: V3, size: float, key: str) -> None:
    d = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
    length = math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2)
    if length < 1e-6:
        return
    di = (d[0] / length, d[1] / length, d[2] / length)
    hl = math.hypot(di[0], di[2])
    e1 = (1.0, 0.0, 0.0) if hl < 1e-6 else (-di[2] / hl, 0.0, di[0] / hl)
    e2 = (di[1] * e1[2] - di[2] * e1[1], di[2] * e1[0] - di[0] * e1[2], di[0] * e1[1] - di[1] * e1[0])
    h = size / 2

    def corner(p, a, c):
        return tuple(p[i] + (e1[i] * a + e2[i] * c) * h for i in range(3))

    ring = ((1, 1), (-1, 1), (-1, -1), (1, -1))
    for i in range(4):
        a0, c0 = ring[i]
        a1, c1 = ring[(i + 1) % 4]
        out = tuple(e1[k] * (a0 + a1) + e2[k] * (c0 + c1) for k in range(3))
        b.poly(key, [corner(p0, a0, c0), corner(p0, a1, c1), corner(p1, a1, c1), corner(p1, a0, c0)], out)


# ── 屋根 ─────────────────────────────────────────────

def _roof_plane(b: Batch, pts: list[V3], thick: float = 0.15) -> None:
    n = _newell(pts)
    if n is None:
        return
    if n[1] < 0:
        n = (-n[0], -n[1], -n[2])
    b.poly("roof", pts, (0, 1, 0), slope_uv(n))
    bottom = [(p[0], p[1] - thick, p[2]) for p in pts]
    b.poly("soffit", bottom, (0, -1, 0))
    cx = sum(p[0] for p in pts) / len(pts)
    cz = sum(p[2] for p in pts) / len(pts)
    for i in range(len(pts)):
        a, c = pts[i], pts[(i + 1) % len(pts)]
        b.poly("fascia", [a, c, bottom[(i + 1) % len(pts)], bottom[i]], ((a[0] + c[0]) / 2 - cx, 0, (a[2] + c[2]) / 2 - cz))


def _two_sided(b: Batch, pts: list[V3], out: V3) -> None:
    b.poly("exteriorWall", pts, out)
    # 裏面は 1cm 内側にずらす（同一平面の表裏はレイトレーサーでちらつく）
    inner = [(p[0] - out[0] * 0.01, p[1], p[2] - out[2] * 0.01) for p in pts]
    b.poly("interiorWall", inner, (-out[0], -out[1], -out[2]))


def add_roof(b: Batch, spec: dict) -> None:
    H = total_height(spec)
    W, D = spec["footprint"]["width"], spec["footprint"]["depth"]
    rtype, o = spec["roof"]["type"], spec["roof"]["overhang"]
    t = math.tan(math.radians(spec["roof"]["pitch"]))
    along_x = W >= D
    U, V = (W, D) if along_x else (D, W)
    P = (lambda u, y, v: (u, y, v)) if along_x else (lambda u, y, v: (v, y, u))
    out = (lambda u, v: (u, 0, v)) if along_x else (lambda u, v: (v, 0, u))
    eave = H - o * t
    if rtype == "flat":
        b.box(-0.15, H, -0.15, W + 0.15, H + 0.2, D + 0.15, {"px": "exteriorWall", "nx": "exteriorWall", "pz": "exteriorWall", "nz": "exteriorWall", "py": "flatRoof", "ny": "soffit"})
        p = 0.15
        for x0, z0, x1, z1 in ((-p, -p, W + p, 0), (-p, D, W + p, D + p), (-p, 0, 0, D), (W, 0, W + p, D)):
            b.box(x0, H + 0.2, z0, x1, H + 0.75, z1, {"px": "exteriorWall", "nx": "exteriorWall", "pz": "exteriorWall", "nz": "exteriorWall", "py": "fascia"})
        for x, z in ((0.12, -0.1), (W - 0.12, -0.1), (0.12, D + 0.1), (W - 0.12, D + 0.1)):
            b.solid(x - 0.03, -FL, z - 0.03, x + 0.03, H + 0.2, z + 0.03, "fascia")
        return
    eaves = []
    if rtype == "gable":
        ridge = H + V / 2 * t
        _roof_plane(b, [P(-o, eave, -o), P(U + o, eave, -o), P(U + o, ridge, V / 2), P(-o, ridge, V / 2)])
        _roof_plane(b, [P(-o, ridge, V / 2), P(U + o, ridge, V / 2), P(U + o, eave, V + o), P(-o, eave, V + o)])
        _two_sided(b, [P(0, H, 0), P(0, H, V), P(0, ridge, V / 2)], out(-1, 0))
        _two_sided(b, [P(U, H, 0), P(U, ridge, V / 2), P(U, H, V)], out(1, 0))
        eaves = [(-o, U + o, -o, -1), (-o, U + o, V + o, 1)]
    elif rtype == "hip":
        ridge = H + V / 2 * t
        r0, r1 = min(V / 2, U / 2), max(U - V / 2, U / 2)
        _roof_plane(b, [P(-o, eave, -o), P(U + o, eave, -o), P(r1, ridge, V / 2), P(r0, ridge, V / 2)])
        _roof_plane(b, [P(r0, ridge, V / 2), P(r1, ridge, V / 2), P(U + o, eave, V + o), P(-o, eave, V + o)])
        _roof_plane(b, [P(-o, eave, -o), P(r0, ridge, V / 2), P(-o, eave, V + o)])
        _roof_plane(b, [P(U + o, eave, -o), P(U + o, eave, V + o), P(r1, ridge, V / 2)])
        eaves = [(-o, U + o, -o, -1), (-o, U + o, V + o, 1)]
    else:
        high = H + V * t
        _roof_plane(b, [P(-o, high + o * t, -o), P(U + o, high + o * t, -o), P(U + o, eave, V + o), P(-o, eave, V + o)])
        _two_sided(b, [P(0, H, 0), P(0, H, V), P(0, high, 0)], out(-1, 0))
        _two_sided(b, [P(U, H, 0), P(U, high, 0), P(U, H, V)], out(1, 0))
        _two_sided(b, [P(0, H, 0), P(0, high, 0), P(U, high, 0), P(U, H, 0)], out(0, -1))
        eaves = [(-o, U + o, V + o, 1)]
    gy0, gy1 = eave - 0.17, eave - 0.07
    spouts = []
    for u0, u1, v, d in eaves:
        v0, v1 = (v, v + 0.11) if d > 0 else (v - 0.11, v)
        a, c = P(u0, gy0, v0), P(u1, gy1, v1)
        b.solid(a[0], a[1], a[2], c[0], c[1], c[2], "fascia")
        vw = V + 0.05 if d > 0 else -0.05
        for u in (0.15, U - 0.15):
            p = P(u, 0, vw)
            spouts.append((p[0], p[2]))
            q0, q1 = P(u - 0.03, gy0 - 0.05, min(v, vw)), P(u + 0.03, gy0, max(v, vw))
            b.solid(q0[0], q0[1], q0[2], q1[0], q1[1], q1[2], "fascia")
    for x, z in spouts:
        b.solid(x - 0.03, -FL, z - 0.03, x + 0.03, gy0, z + 0.03, "fascia")


def find_entrance(spec: dict):
    for w in spec["floors"][0]["walls"] if spec["floors"] else []:
        if w["kind"] == "door" and w.get("outside"):
            return w, Axis(w), w["outside"][0]
    return None


# ── 外構（ワールド座標。y=0 が地盤面） ───────────────────────

def site_layout(spec: dict) -> dict:
    """外構の配置（建物前面から道路まで 6m）。src/lib/building-geometry.ts の siteLayout と同じ"""
    W, D = spec["footprint"]["width"], spec["footprint"]["depth"]
    curb_z0 = D + 5.85
    ax0 = min(1.3, W * 0.15) - 0.7
    ax1 = ax0 + 1.4
    ent = find_entrance(spec)
    if ent and ent[2] == "+z":
        ax0, ax1 = ent[1].a0 - 0.3, ent[1].a1 + 0.3
    px0 = max(ax1 + 0.8, W - 3.2)
    parking = {"x0": px0, "x1": px0 + 2.8, "z0": D + 0.3, "z1": curb_z0} if px0 + 2.8 <= W + 2 else None
    return {"roadZ0": D + 6, "roadZ1": D + 12, "curbZ0": curb_z0,
            "approach": {"x0": ax0, "x1": ax1, "z0": D + 1.5, "z1": curb_z0}, "parking": parking}


def add_landscape(b: Batch, spec: dict) -> dict:
    W, D = spec["footprint"]["width"], spec["footprint"]["depth"]
    site = site_layout(spec)
    b.poly("ground", [(-200, 0, -200), (200, 0, -200), (200, 0, 200), (-200, 0, 200)], (0, 1, 0))
    b.poly("road", [(-200, 0.004, site["roadZ0"]), (200, 0.004, site["roadZ0"]), (200, 0.004, site["roadZ1"]), (-200, 0.004, site["roadZ1"])], (0, 1, 0))
    b.solid(-200, 0, site["curbZ0"], 200, 0.12, site["roadZ0"], "concrete")
    for r in (site["approach"], site["parking"]):
        if r:
            b.poly("concrete", [(r["x0"], 0.006, r["z0"]), (r["x1"], 0.006, r["z0"]), (r["x1"], 0.006, r["z1"]), (r["x0"], 0.006, r["z1"])], (0, 1, 0))
    ax0, ax1 = site["approach"]["x0"], site["approach"]["x1"]
    px0 = site["parking"]["x0"] if site["parking"] else W + 10
    shrubs = [x for x in [0.6 + 1.1 * i for i in range(int((W - 1.0) / 1.1) + 1)] if not (ax0 - 0.4 < x < ax1 + 0.4) and x <= px0 - 0.3]
    trees = [(-3, -2), (W + 3, -1.5), (-3.5, D * 0.6), (W + 3.2, D * 0.7), (W * 0.7, -4), (-6, D + 2.5), (W + 6, D + 2)]
    return {"shrubs": [(x, D + 0.55) for x in shrubs], "trees": trees}


def build_all(spec: dict) -> dict:
    """グループ名 → ポリゴン列。building 系は spec の y（床基準）で、Blender 側で FL を加える"""
    groups: dict = {}
    b = Batch()
    for f in spec["floors"]:
        add_floor(b, spec, f)
        groups[f"Floor{f['level'] + 1}F"] = b.take()
    add_foundation(b, spec["floors"][0]["walls"] if spec["floors"] else [])
    groups["Foundation"] = b.take()
    add_top_ceiling(b, spec)
    groups["Ceiling"] = b.take()
    add_lower_roofs(b, spec)
    add_roof(b, spec)
    groups["Roof"] = b.take()
    return groups


if __name__ == "__main__":
    import json
    import sys

    data = json.loads(open(sys.argv[1], encoding="utf-8").read())
    spec = data.get("spec", data)
    g = build_all(spec)
    lb = Batch()
    extra = add_landscape(lb, spec)
    print({k: len(v) for k, v in g.items()}, "landscape", len(lb.polys), "shrubs", len(extra["shrubs"]))

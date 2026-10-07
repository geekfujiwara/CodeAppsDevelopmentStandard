"""階段の段・開口・手すり。src/lib/stairs.ts の stairLayout / slabsWithOpenings と同じ式。

spec には配置（外形・上り方向・形状）だけがあり、段の寸法はここで導く。式を変えたら TS と両方を直す
（tests/stairs.test.mjs が両者の出力を突き合わせる）。自動配置は Code App（TS）側だけが行う。
"""

from __future__ import annotations

import math

STAIR_WIDTH = 0.85
MAX_RISER = 0.21
GUARD_T = 0.1
RAIL_H = 0.8
RAIL_IN = 0.05
WINDERS = 3

OPP = {"+x": "-x", "-x": "+x", "+z": "-z", "-z": "+z"}
VEC = {"+x": (1, 0), "-x": (-1, 0), "+z": (0, 1), "-z": (0, -1)}
LEFT = {"-z": "-x", "+z": "+x", "+x": "-z", "-x": "+z"}


def r3(v: float) -> float:
    # JS の Math.round と同じ丸め（Python の round は偶数丸め）
    return math.floor(v * 1000 + 0.5) / 1000


def side_of(up: str, turn: str) -> str:
    return LEFT[up] if turn == "left" else OPP[LEFT[up]]


def riser_count(rise: float) -> int:
    return max(2, math.ceil(rise / MAX_RISER - 1e-6))


def _frame(s: dict, v_side: str):
    u, v = VEC[s["up"]], VEC[v_side]
    ox = s["x"] + s["w"] if (u[0] < 0 or v[0] < 0) else s["x"]
    oz = s["z"] + s["d"] if (u[1] < 0 or v[1] < 0) else s["z"]
    return (ox, oz), u, v


def _rect(f, a0, a1, b0, b1) -> dict:
    (ox, oz), u, v = f
    p = [(ox + u[0] * a + v[0] * b, oz + u[1] * a + v[1] * b) for a, b in ((a0, b0), (a1, b1))]
    return {"x0": r3(min(p[0][0], p[1][0])), "x1": r3(max(p[0][0], p[1][0])),
            "z0": r3(min(p[0][1], p[1][1])), "z1": r3(max(p[0][1], p[1][1]))}


def _pt(f, a, b, y):
    (ox, oz), u, v = f
    return [r3(ox + u[0] * a + v[0] * b), r3(y), r3(oz + u[1] * a + v[1] * b)]


def _to_rect(b: dict) -> dict:
    return {"x": b["x0"], "z": b["z0"], "w": r3(b["x1"] - b["x0"]), "d": r3(b["z1"] - b["z0"])}


def opening_of(s: dict) -> dict:
    """上の階の床に開ける範囲（stairs.ts の openingOf と同じ。省略時は外形）"""
    return s.get("opening") or {"x": s["x"], "z": s["z"], "w": s["w"], "d": s["d"]}


def _guards(s: dict, exit_side: str) -> list[dict]:
    o = opening_of(s)
    x0, x1, z0, z1, t = o["x"], o["x"] + o["w"], o["z"], o["z"] + o["d"], GUARD_T
    allg = {
        "-z": {"x": r3(x0 - t), "z": r3(z0 - t), "w": r3(o["w"] + 2 * t), "d": t},
        "+z": {"x": r3(x0 - t), "z": z1, "w": r3(o["w"] + 2 * t), "d": t},
        "-x": {"x": r3(x0 - t), "z": z0, "w": t, "d": o["d"]},
        "+x": {"x": x1, "z": z0, "w": t, "d": o["d"]},
    }
    return [g for k, g in allg.items() if k != exit_side]


def stair_layout(spec: dict, s: dict) -> dict:
    lower = next((f for f in spec["floors"] if f["level"] == s["fromLevel"]), None)
    rise = lower["height"] if lower else spec["wallHeightDefault"]
    n = round(s["risers"]) if s.get("risers") and s["risers"] >= 2 else riser_count(rise)
    riser = rise / n
    along_x = s["up"] in ("+x", "-x")
    length = s["w"] if along_x else s["d"]
    span = s["d"] if along_x else s["w"]
    steps: list[dict] = []
    turn_side = side_of(s["up"], s.get("turn") or "right") if s["shape"] == "L" else side_of(s["up"], "right")
    f = _frame(s, turn_side)
    if s["shape"] == "straight":
        t = length / (n - 1)
        for i in range(n - 1):
            steps.append({**_rect(f, i * t, (i + 1) * t, 0, span), "top": r3((i + 1) * riser), "down": OPP[s["up"]]})
        rail = [_pt(f, 0, RAIL_IN, riser + RAIL_H), _pt(f, length, RAIL_IN, rise + RAIL_H)]
        approach = _to_rect(_rect(f, -0.9, 0, 0, span))
        exit_ = _to_rect(_rect(f, length, length + 0.75, 0, span))
        guards = _guards(s, s["up"])
        min_tread = t
    elif s["shape"] == "winder":
        entry = s.get("entry")
        if entry not in VEC or entry in (s["up"], OPP[s["up"]]):
            entry = turn_side
        f = _frame(s, entry)
        sq = min(span, length * 0.5)
        k = min(n - 2, WINDERS + 1 if (length - sq) / (n - 1 - WINDERS) < 0.15 else WINDERS)
        last = max(span / k, min(0.35, span * 0.45))
        each = (span - last) / max(1, k - 1)

        def edge(i):
            return 0 if i >= k else span - i * each
        for i in range(k):
            steps.append({**_rect(f, 0, sq, 0 if i == k - 1 else edge(i + 1), edge(i)), "top": r3((i + 1) * riser), "down": entry})
        m = n - 1 - k
        t = (length - sq) / m
        for j in range(m):
            steps.append({**_rect(f, sq + j * t, sq + (j + 1) * t, 0, span), "top": r3((k + 1 + j) * riser), "down": OPP[s["up"]]})
        rail = [_pt(f, 0, RAIL_IN, k * riser + RAIL_H), _pt(f, length, RAIL_IN, rise + RAIL_H)]
        approach = _to_rect(_rect(f, 0, sq, span, span + 0.9))
        exit_ = _to_rect(_rect(f, length, length + 0.75, 0, span))
        guards = _guards(s, s["up"])
        min_tread = t
    else:
        wd = min(STAIR_WIDTH, length / 2, span / 2)
        run1, run2 = length - wd, span - wd
        treads = n - 2
        n1 = max(1, min(treads - 1, math.floor(treads * run1 / (run1 + run2) + 0.5)))
        n2 = treads - n1
        t1, t2 = run1 / n1, run2 / n2
        for i in range(n1):
            steps.append({**_rect(f, i * t1, (i + 1) * t1, 0, wd), "top": r3((i + 1) * riser), "down": OPP[s["up"]]})
        steps.append({**_rect(f, run1, length, 0, wd), "top": r3((n1 + 1) * riser), "down": OPP[s["up"]]})
        for i in range(n2):
            steps.append({**_rect(f, run1, length, wd + i * t2, wd + (i + 1) * t2), "top": r3((n1 + 2 + i) * riser), "down": OPP[turn_side]})
        yl = (n1 + 1) * riser + RAIL_H
        rail = [_pt(f, 0, RAIL_IN, riser + RAIL_H), _pt(f, run1, RAIL_IN, yl), _pt(f, length - RAIL_IN, RAIL_IN, yl),
                _pt(f, length - RAIL_IN, wd, yl), _pt(f, length - RAIL_IN, span, rise + RAIL_H)]
        approach = _to_rect(_rect(f, -0.9, 0, 0, wd))
        exit_ = _to_rect(_rect(f, run1, length, span, span + 0.75))
        guards = _guards(s, turn_side) + [_to_rect(_rect(f, -GUARD_T, run1, span, span + GUARD_T))]
        min_tread = min(t1, t2)
    return {"stair": s, "rise": rise, "riser": riser, "steps": steps, "approach": approach, "exit": exit_,
            "guards": guards, "minTread": r3(min_tread), "rail": rail}


def subtract_rect(r: dict, h: dict) -> list[dict]:
    ax0, ax1, az0, az1 = r["x"], r["x"] + r["w"], r["z"], r["z"] + r["d"]
    bx0, bx1 = max(ax0, h["x"]), min(ax1, h["x"] + h["w"])
    bz0, bz1 = max(az0, h["z"]), min(az1, h["z"] + h["d"])
    if bx1 - bx0 < 1e-6 or bz1 - bz0 < 1e-6:
        return [r]
    out = []
    for x0, z0, x1, z1 in ((ax0, az0, ax1, bz0), (ax0, bz1, ax1, az1), (ax0, bz0, bx0, bz1), (bx1, bz0, ax1, bz1)):
        if x1 - x0 > 1e-6 and z1 - z0 > 1e-6:
            out.append({"x": r3(x0), "z": r3(z0), "w": r3(x1 - x0), "d": r3(z1 - z0)})
    return out


def slabs_with_openings(spec: dict, floor: dict) -> list[dict]:
    rects = list(floor["slabs"])
    for h in spec.get("stairs") or []:
        if h["fromLevel"] == floor["level"] - 1:
            rects = [p for r in rects for p in subtract_rect(r, opening_of(h))]
    return rects

import type { FloorSpec, WallRect } from "./building-spec"
import type { FixtureHint } from "./floorplan-analyzer"
import { catalogItem, newFurnitureId, roomBox, type FurnitureItem } from "./furniture.ts"

/**
 * 間取り図の設備の記号（細線の箱）を、部屋と並びから種類を決めて、図面の位置に固定の設備として置く。
 * - エアコンの表記（窓の前の薄い箱）・家具の記号（テーブル・ソファ）は置かない
 * - トイレ / 浴室の中 → トイレ / 浴槽
 * - 壁に沿った長い箱（奥行 0.45〜0.85m・長さ 1.4m 以上）→ キッチン。2.2m 以上は端の破線側を冷蔵庫に分ける
 * - 壁に沿った正方形に近い箱 → キッチンの端に並べば冷蔵庫、水回りに近い方が洗面台、残りが洗濯機
 * - 記号の輪郭が壁として拾われていれば、箱の中の内壁を外す
 */
export type PlacedFixtures = { items: FurnitureItem[]; walls: WallRect[] }

type Side = "n" | "s" | "w" | "e"
const SIDE_RY: Record<Side, number> = { n: 0, s: 180, w: 90, e: -90 }
type Box = { x0: number; z0: number; x1: number; z1: number }
const r2 = (v: number) => Math.round(v * 100) / 100

export function placePlanFixtures(floor: FloorSpec, hints: FixtureHint[]): PlacedFixtures {
  if (!hints.length) return { items: [], walls: floor.walls }
  const solid = floor.walls.filter(w => w.kind === "wall")
  const windows = floor.walls.filter(w => (w.kind === "window" || w.kind === "glassdoor") && w.outside?.length)
  const ext = floor.slabs.reduce((e, r) => ({ x0: Math.min(e.x0, r.x), z0: Math.min(e.z0, r.z), x1: Math.max(e.x1, r.x + r.w), z1: Math.max(e.z1, r.z + r.d) }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity })
  const boxOf = (h: FixtureHint): Box => ({ x0: h.x, z0: h.z, x1: h.x + h.w, z1: h.z + h.d })

  /** 箱の辺から 0.2m 以内にある、辺に沿った壁（開口も含む）。最も近い辺を背とする */
  const backOf = (b: Box, list: WallRect[], minGap = -0.08): { side: Side; gap: number; wall: WallRect } | null => {
    let best: { side: Side; gap: number; wall: WallRect } | null = null
    for (const w of list) {
      const wx0 = w.x, wx1 = w.x + w.w, wz0 = w.z, wz1 = w.z + w.d
      const ovX = Math.min(wx1, b.x1) - Math.max(wx0, b.x0)
      const ovZ = Math.min(wz1, b.z1) - Math.max(wz0, b.z0)
      const cand: [Side, number, number][] = [
        ["n", b.z0 - wz1, ovX / (b.x1 - b.x0)],
        ["s", wz0 - b.z1, ovX / (b.x1 - b.x0)],
        ["w", b.x0 - wx1, ovZ / (b.z1 - b.z0)],
        ["e", wx0 - b.x1, ovZ / (b.z1 - b.z0)],
      ]
      for (const [side, gap, ov] of cand) {
        if (gap < minGap || gap > 0.2 || ov < 0.3) continue
        if (!best || gap < best.gap) best = { side, gap, wall: w }
      }
    }
    return best
  }

  const roomAt = (x: number, z: number) => {
    for (const r of floor.rooms) {
      const rb = roomBox(floor, ext, r.x, r.z)
      if (x >= rb.x0 && x <= rb.x1 && z >= rb.z0 && z <= rb.z1) return { label: r, box: rb }
    }
    return null
  }
  const wetCenters = floor.rooms.filter(r => /トイレ|浴室|水回り|洗面|脱衣/.test(r.name))

  type Cand = { hint: FixtureHint; box: Box; back: Side; room: ReturnType<typeof roomAt>; long: number; short: number; alongX: boolean }
  const cands: Cand[] = []
  for (const h of hints) {
    const b = boxOf(h)
    const long = Math.max(h.w, h.d)
    const short = Math.min(h.w, h.d)
    const cx = h.x + h.w / 2
    const cz = h.z + h.d / 2
    // エアコンの表記: 窓の前（窓から 0.25m 以内）の薄い箱
    // （表記の箱は窓の帯に重なって描かれることがあるので、重なりも 0.2m まで許す）
    // （洗濯機置き場・洗面台は短辺 0.5m 以上。窓のある外壁に付いていても表記ではない）
    if ((short <= 0.4 || (short <= 0.6 && long / short >= 1.6)) && backOf(b, windows, -0.2)) continue
    const back = backOf(b, [...solid, ...windows])
    cands.push({ hint: h, box: b, back: back?.side ?? "n", room: roomAt(cx, cz), long, short, alongX: h.w >= h.d })
  }

  const items: FurnitureItem[] = []
  const used: Box[] = []
  const add = (type: string, b: Box, back: Side, along?: number) => {
    const c = catalogItem(type)
    if (!c) return
    const horizontal = back === "n" || back === "s"
    const a = along ?? (horizontal ? (b.x0 + b.x1) / 2 : (b.z0 + b.z1) / 2)
    // 背を箱の背側の辺に付け、奥行の半分だけ前へ
    const n = back === "n" ? b.z0 + c.d / 2 : back === "s" ? b.z1 - c.d / 2 : back === "w" ? b.x0 + c.d / 2 : b.x1 - c.d / 2
    const [x, z] = horizontal ? [a, n] : [n, a]
    items.push({ id: newFurnitureId(), type, level: floor.level, x: r2(x), z: r2(z), ry: SIDE_RY[back], fixed: true })
    used.push(b)
  }

  // 1. トイレ・浴室の中の記号
  for (const c of cands) {
    const name = c.room?.label.name ?? ""
    if (/トイレ/.test(name)) add("toilet", c.box, c.back)
    else if (/浴室/.test(name)) {
      const rb = c.room!.box
      const room = Math.max(rb.x1 - rb.x0, rb.z1 - rb.z0)
      add(room >= 1.65 ? "bathtub" : "bathtubCompact", c.box, c.back)
    }
  }
  const rest = cands.filter(c => !used.includes(c.box) && !/トイレ|浴室/.test(c.room?.label.name ?? ""))

  // 2. キッチン（壁に沿った長い箱。背が長辺側）
  const kitchens: { box: Box; back: Side }[] = []
  for (const c of rest) {
    if (c.long < 1.4 || c.short < 0.45 || c.short > 0.85) continue
    const backOnLong = c.alongX ? c.back === "n" || c.back === "s" : c.back === "w" || c.back === "e"
    if (!backOnLong) continue
    let k = c.box
    if (c.long >= 2.2) {
      // 冷蔵庫の置き場は破線で描かれる: 短辺の線の乗りが少ない端を冷蔵庫にする
      const [ln, ls, lw, le] = c.hint.lines
      const fridgeAtStart = c.alongX ? lw < le : ln < ls
      const fl = 0.72
      if (c.alongX) {
        const f: Box = fridgeAtStart ? { ...c.box, x1: c.box.x0 + fl } : { ...c.box, x0: c.box.x1 - fl }
        k = fridgeAtStart ? { ...c.box, x0: c.box.x0 + fl } : { ...c.box, x1: c.box.x1 - fl }
        add("fridge", f, c.back)
      } else {
        const f: Box = fridgeAtStart ? { ...c.box, z1: c.box.z0 + fl } : { ...c.box, z0: c.box.z1 - fl }
        k = fridgeAtStart ? { ...c.box, z0: c.box.z0 + fl } : { ...c.box, z1: c.box.z1 - fl }
        add("fridge", f, c.back)
      }
    }
    const len = c.alongX ? k.x1 - k.x0 : k.z1 - k.z0
    add(len < 2.3 ? "kitchenCompact" : "kitchen", k, c.back)
    used.push(c.box)
    kitchens.push({ box: k, back: c.back })
  }

  // 3. 壁に沿った正方形に近い箱: キッチンの端なら冷蔵庫、水回りに近い方から洗面台 → 洗濯機
  const squares = rest.filter(c => !used.includes(c.box) && c.long <= 1.0 && c.short >= 0.5)
  const nearKitchen = (c: Cand) =>
    kitchens.some(k => {
      if (k.back !== c.back) return false
      const horizontal = k.back === "n" || k.back === "s"
      const gap = horizontal ? Math.max(c.box.x0 - k.box.x1, k.box.x0 - c.box.x1) : Math.max(c.box.z0 - k.box.z1, k.box.z0 - c.box.z1)
      return gap <= 0.4
    })
  const wetDist = (c: Cand) => Math.min(Infinity, ...wetCenters.map(r => Math.hypot(r.x - (c.box.x0 + c.box.x1) / 2, r.z - (c.box.z0 + c.box.z1) / 2)))
  const others: Cand[] = []
  // 冷蔵庫の置き場は破線で描かれる（線の乗りが少ない）。キッチンを分けて冷蔵庫を置いた後は、隣の箱を冷蔵庫にしない
  let fridges = items.filter(i => i.type === "fridge").length
  for (const c of squares) {
    const dashed = c.hint.lines.reduce((a, v) => a + v, 0) / 4 < 0.85
    if (!fridges && dashed && nearKitchen(c)) {
      add("fridge", c.box, c.back)
      fridges++
    } else others.push(c)
  }
  // 洗面所の中の破線の正方形は洗濯機置き場（防水パン）。残りは水回りに近い方から洗面台 → 洗濯機
  const washerPan = others.filter(c => c.hint.lines.reduce((a, v) => a + v, 0) / 4 < 0.85 && /洗面|脱衣|水回り/.test(c.room?.label.name ?? ""))
  for (const c of washerPan) add("washer", c.box, c.back)
  const rest2 = others.filter(c => !washerPan.includes(c)).sort((a, b) => wetDist(a) - wetDist(b))
  const haveBasin = () => items.some(i => i.type === "washbasin")
  rest2.forEach((c, i) => add(i === 0 && !haveBasin() && (wetCenters.length || rest2.length > 1) ? "washbasin" : "washer", c.box, c.back))

  // 設備の箱の中に壁として拾われた輪郭（外壁以外）を外す
  const inside = (w: WallRect, b: Box) => w.x >= b.x0 - 0.05 && w.z >= b.z0 - 0.05 && w.x + w.w <= b.x1 + 0.05 && w.z + w.d <= b.z1 + 0.05
  const walls = floor.walls.filter(w => !(w.kind === "wall" && !w.outside?.length && used.some(b => inside(w, b))))
  return { items, walls }
}

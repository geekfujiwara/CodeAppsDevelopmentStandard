import { test } from "node:test"
import assert from "node:assert/strict"
import { cropRect, findFloorBlocks, pickFloors, upscaleFactor } from "../src/lib/floorplan-sheet.ts"

/** 白地に、矩形の外壁（太さ t）と塗りで描いた図面を置く */
function sheet(w, h, plans) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255)
  const px = (x, y, rgb) => { const i = (y * w + x) * 4; data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2] }
  for (const p of plans) {
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      const edge = x - p.x < 4 || p.x + p.w - 1 - x < 4 || y - p.y < 4 || p.y + p.h - 1 - y < 4
      px(x, y, edge ? [60, 60, 60] : [240, 225, 200])
    }
    // 図面の下の表記（「1F」など。小さな塊）
    for (let y = p.y + p.h + 6; y < p.y + p.h + 14; y++) for (let x = p.x + p.w - 20; x < p.x + p.w - 6; x++) if ((x + y) % 3) px(x, y, [80, 80, 80])
  }
  return { width: w, height: h, data }
}

test("1F・2F を横に並べた 1 枚の間取り図を、左から 1F・2F に分ける（表記の小さな塊は階にしない）", () => {
  const img = sheet(1000, 600, [{ x: 100, y: 150, w: 380, h: 300 }, { x: 520, y: 160, w: 360, h: 290 }])
  const b = findFloorBlocks(img)
  assert.equal(b.length, 2)
  assert.ok(b[0].x < b[1].x)
  assert.ok(Math.abs(b[0].w - 380) <= 2 && Math.abs(b[1].w - 360) <= 2, JSON.stringify(b))
  // 切り出す範囲は少し余白を足し、画像の外にははみ出さない
  const c = cropRect(b[0], img)
  assert.ok(c.x < b[0].x && c.x >= 0 && c.x + c.w <= img.width)
})

test("縦 1 列に積んだ図面は下から 1F。最上部の塔屋（小さな図）は物件の階数を超えれば外す", () => {
  const img = sheet(600, 1000, [
    { x: 200, y: 20, w: 220, h: 150 }, // 塔屋と屋上テラス（階数に数えない。実際の図面でも最上階の半分ほどの大きさ）
    { x: 150, y: 200, w: 300, h: 200 }, // 3F
    { x: 150, y: 450, w: 300, h: 200 }, // 2F
    { x: 150, y: 700, w: 300, h: 220 }, // 1F
  ])
  const all = findFloorBlocks(img)
  assert.equal(all.length, 4)
  assert.ok(all[0].y > all[1].y && all[1].y > all[2].y, "下から")
  const floors = pickFloors(all, 3)
  assert.equal(floors.length, 3)
  assert.ok(floors.every(f => f.w >= 290), "塔屋を外す")
  assert.ok(floors[0].y > floors[2].y)
})

test("1 階分だけの図面は分けない", () => {
  const img = sheet(500, 600, [{ x: 50, y: 60, w: 380, h: 460 }])
  assert.equal(findFloorBlocks(img).length, 1)
})

test("小さく切り出された図面だけ、全階で同じ倍率で拡大する", () => {
  assert.equal(upscaleFactor([{ w: 400, h: 330 }, { w: 380, h: 320 }]), 1)
  const k = upscaleFactor([{ w: 160, h: 230 }, { w: 165, h: 225 }, { w: 158, h: 220 }])
  assert.ok(k > 2.5 && k <= 3, String(k))
})

test("「2F・ロフト」の行の下に 1F を描いた図面は、ロフトを外した後に並べ直して下から 1F にする", () => {
  const f2 = { x: 100, y: 50, w: 300, h: 300 }, loft = { x: 450, y: 150, w: 120, h: 150 }, f1 = { x: 100, y: 420, w: 300, h: 320 }
  const found = [f2, loft, f1]
  assert.deepEqual(pickFloors(found, 2), [f1, f2])
  // 階数が分からなければそのまま（ロフトも残す）
  assert.deepEqual(pickFloors(found), found)
})

test("階と階の間に置いた「1F」の表記が両側の外壁に近くても、2 階分に分ける（表記は階の範囲に含めない）", () => {
  const w = 400, h = 200
  const data = new Uint8ClampedArray(w * h * 4).fill(255)
  const fill = (x0, y0, x1, y1, v = 120) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = v } }
  fill(20, 30, 179, 180) // 1F
  fill(200, 40, 379, 180) // 2F
  fill(184, 150, 195, 157, 60) // 「1F」の表記（両側と 4px しか離れていない）
  const blocks = findFloorBlocks({ width: w, height: h, data })
  assert.equal(blocks.length, 2)
  assert.deepEqual(blocks.map(b => [b.x, b.x + b.w - 1]), [[20, 179], [200, 379]])
})

test("外壁に接する小さな部分（玄関ポーチの段など）は、その階の範囲に戻す", () => {
  const w = 400, h = 200
  const data = new Uint8ClampedArray(w * h * 4).fill(255)
  const fill = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 120 } }
  fill(20, 30, 170, 170) // 1F
  fill(172, 160, 181, 170) // 外壁から 1px 離れた段（小さな塊）
  fill(220, 30, 379, 170) // 2F
  const blocks = findFloorBlocks({ width: w, height: h, data })
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].x + blocks[0].w - 1, 181)
})

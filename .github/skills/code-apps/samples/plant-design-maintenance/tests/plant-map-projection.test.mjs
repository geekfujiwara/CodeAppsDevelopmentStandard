import assert from "node:assert/strict"
import test from "node:test"
import { JAPAN_VIEW, clampZoom, hasLocation, pinPositions, project } from "../src/lib/map-projection.ts"

const size = { width: 800, height: 480 }

/** デモ拠点と同じ緯度経度。Google マップ埋め込みの背景とピンがずれないことを確かめる */
const sites = [
  { id: "ksm", latitude: 35.9214, longitude: 140.6871 },
  { id: "ykk", latitude: 34.9385, longitude: 136.638 },
  { id: "kws", latitude: 35.5064, longitude: 139.7527 },
  { id: "ski", latitude: 34.5636, longitude: 135.4143 },
  { id: "tmk", latitude: 42.6252, longitude: 141.7139 },
]

test("Web メルカトル投影は経度で単調増加し、緯度が高いほど上に来る", () => {
  const zoom = 5
  const west = project(35, 130, zoom)
  const east = project(35, 141, zoom)
  const north = project(43, 135, zoom)
  const south = project(34, 135, zoom)
  assert.ok(west.x < east.x)
  assert.ok(north.y < south.y)
  // 赤道・本初子午線は世界地図の中心
  const origin = project(0, 0, zoom)
  assert.equal(origin.x, 256 * 2 ** zoom / 2)
  assert.ok(Math.abs(origin.y - (256 * 2 ** zoom) / 2) < 1e-9)
})

test("ズームを1段上げると中心からの距離がちょうど2倍になる", () => {
  const a = project(35.9214, 140.6871, 5)
  const b = project(35.9214, 140.6871, 6)
  assert.ok(Math.abs(b.x - a.x * 2) < 1e-9)
  assert.ok(Math.abs(b.y - a.y * 2) < 1e-9)
})

test("初期表示では 5 拠点すべてが地図の内側にピン留めされる", () => {
  const pins = pinPositions(sites, JAPAN_VIEW, size)
  assert.equal(pins.length, sites.length)
  for (const pin of pins) {
    assert.ok(pin.left >= 0 && pin.left <= size.width, `${pin.site.id} left=${pin.left}`)
    assert.ok(pin.top >= 0 && pin.top <= size.height, `${pin.site.id} top=${pin.top}`)
  }
  // 苫小牧が最も北かつ東寄り、堺が最も西
  const by = Object.fromEntries(pins.map((pin) => [pin.site.id, pin]))
  assert.ok(by.tmk.top < by.ksm.top)
  assert.ok(by.ski.left < by.kws.left)
})

test("拠点を選ぶとその拠点がキャンバス中央に来る", () => {
  const target = sites[4]
  const view = { latitude: target.latitude, longitude: target.longitude, zoom: 12 }
  const pins = pinPositions(sites, view, size)
  const selected = pins.find((pin) => pin.site.id === target.id)
  assert.ok(selected)
  assert.ok(Math.abs(selected.left - size.width / 2) < 1e-6)
  assert.ok(Math.abs(selected.top - size.height / 2) < 1e-6)
  // 拡大すると他拠点は範囲外になり描画されない
  assert.equal(pins.length, 1)
})

test("緯度経度未設定の拠点はピンにならず、ズームは範囲内に丸められる", () => {
  assert.equal(hasLocation({ latitude: 0, longitude: 0 }), false)
  assert.equal(hasLocation({ latitude: 35.9214, longitude: 140.6871 }), true)
  assert.equal(pinPositions([{ id: "none", latitude: 0, longitude: 0 }], JAPAN_VIEW, size).length, 0)
  assert.equal(clampZoom(1), 4)
  assert.equal(clampZoom(99), 16)
  assert.equal(clampZoom(9), 9)
})

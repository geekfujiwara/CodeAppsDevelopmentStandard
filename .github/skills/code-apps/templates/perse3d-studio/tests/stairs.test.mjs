import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { DEFAULT_MASSING, generateFromMassing, parseBuildingSpec } from "../src/lib/building-spec.ts"
import { canStep, findStairPlacement, MAX_RISER, MAX_STEP, slabsWithOpenings, stairLayout, walkSurface } from "../src/lib/stairs.ts"

const FL = 0.45
const sample = parseBuildingSpec(JSON.parse(readFileSync(new URL("../src/data/sample-spec.json", import.meta.url), "utf8")))
const massing = generateFromMassing(DEFAULT_MASSING)

/** 4 方向 × 直階段 / かね折れ（左右）の合成ケース */
function syntheticStairs() {
  const out = []
  for (const up of ["+x", "-x", "+z", "-z"]) {
    const ax = up.endsWith("x")
    out.push({ fromLevel: 0, x: 1, z: 1, w: ax ? 2.925 : 0.85, d: ax ? 0.85 : 2.925, up, shape: "straight" })
    for (const turn of ["left", "right"]) out.push({ fromLevel: 0, x: 1, z: 1, w: 1.82, d: 2.73, up, shape: "L", turn })
  }
  return out
}

/** 回り階段（狭小住宅・図面の記号から）: 4 方向 × 横から入る側 2 通り。段数は持たせる */
function winderStairs() {
  const out = []
  for (const up of ["+x", "-x", "+z", "-z"]) {
    const ax = up.endsWith("x")
    for (const entry of ax ? ["+z", "-z"] : ["+x", "-x"]) out.push({ fromLevel: 0, x: 1, z: 1, w: ax ? 1.96 : 0.8, d: ax ? 0.8 : 1.96, up, shape: "winder", risers: 13, entry })
    // 上の階の開口を上端側 1.0m だけにしたもの（図面の記号から作った階段）
    const o = up === "+z" ? { x: 1, z: 1.96, w: 0.8, d: 1.0 } : up === "-z" ? { x: 1, z: 1, w: 0.8, d: 1.0 } : up === "+x" ? { x: 1.96, z: 1, w: 1.0, d: 0.8 } : { x: 1, z: 1, w: 1.0, d: 0.8 }
    out.push({ fromLevel: 0, x: 1, z: 1, w: ax ? 1.96 : 0.8, d: ax ? 0.8 : 1.96, up, shape: "winder", risers: 13, entry: ax ? "+z" : "+x", opening: o })
  }
  return out
}

test("段の寸法: 蹴上げ 0.21m 以下・踏面 0.195m 以上・段の高さが 1 段ずつ上がり、最後の 1 段で上の階の床", () => {
  for (const s of [...syntheticStairs(), ...sample.stairs, ...massing.stairs]) {
    const lay = stairLayout(massing, s)
    assert.ok(lay.riser <= MAX_RISER + 1e-9, `riser ${lay.riser}`)
    assert.ok(lay.minTread >= 0.195, `${s.shape} ${s.up} tread ${lay.minTread}`)
    lay.steps.forEach((st, i) => {
      assert.ok(Math.abs(st.top - (i + 1) * lay.riser) < 0.002, `段 ${i} の高さ`)
      assert.ok(st.x0 >= s.x - 1e-6 && st.x1 <= s.x + s.w + 1e-6 && st.z0 >= s.z - 1e-6 && st.z1 <= s.z + s.d + 1e-6, "段は外形の内側")
    })
    assert.ok(Math.abs(lay.steps.at(-1).top + lay.riser - lay.rise) < 0.002, "最後の段 + 蹴上げ = 階高")
  }
})

test("上の階の床は階段の外形だけ抜ける（面積が一致）", () => {
  for (const spec of [sample, massing]) {
    for (const s of spec.stairs) {
      const upper = spec.floors.find(f => f.level === s.fromLevel + 1)
      const before = upper.slabs.reduce((a, r) => a + r.w * r.d, 0)
      const after = slabsWithOpenings(spec, upper).reduce((a, r) => a + r.w * r.d, 0)
      assert.ok(Math.abs(before - after - s.w * s.d) < 0.01, `${before} - ${after} vs ${s.w * s.d}`)
    }
  }
})

test("透視図から生成した間取り: 階段は壁・ドア前と重ならず、両方の階の全部屋へ歩いて行ける", () => {
  for (const depth of [6.37, 7.28, 9.1]) {
    for (const width of [7.28, 9.1, 10.92]) {
      const spec = generateFromMassing({ ...DEFAULT_MASSING, width, depth })
      assert.equal(spec.stairs.length, 1, `${width}x${depth}`)
      const s = spec.stairs[0]
      for (const f of spec.floors.slice(0, 2)) {
        for (const w of f.walls) {
          const hit = w.x < s.x + s.w - 0.005 && s.x < w.x + w.w - 0.005 && w.z < s.z + s.d - 0.005 && s.z < w.z + w.d - 0.005
          assert.ok(!hit, `${width}x${depth} ${f.level}F 壁 ${JSON.stringify(w)}`)
        }
      }
      // 自動配置の判定器で、その位置が「全部屋へ行ける」条件を満たすこと（候補に同じ位置が出る）
      const c = findStairPlacement({ ...spec, stairs: [] }, 0)
      assert.ok(c, `${width}x${depth}: 自動配置でも置ける`)
    }
  }
})

test("内見: 上り口から上り方向へ歩くと 2 階に着き、途中の段差は蹴上げ以下", () => {
  for (const spec of [massing, sample]) {
    const layouts = spec.stairs.map(s => stairLayout(spec, s))
    for (const lay of layouts) {
      // 段の中心を順にたどる（かね折れは踊り場で曲がる）
      const path = [
        [(lay.approach.x + lay.approach.w / 2), (lay.approach.z + lay.approach.d / 2)],
        ...lay.steps.map(st => [(st.x0 + st.x1) / 2, (st.z0 + st.z1) / 2]),
        [lay.exit.x + lay.exit.w / 2, lay.exit.z + lay.exit.d / 2],
      ]
      let level = lay.stair.fromLevel
      let cur = walkSurface(spec, layouts, path[0][0], path[0][1], level, FL)
      for (let i = 1; i < path.length; i++) {
        const [x0, z0] = path[i - 1]
        const [x1, z1] = path[i]
        for (let k = 1; k <= 10; k++) {
          const x = x0 + ((x1 - x0) * k) / 10
          const z = z0 + ((z1 - z0) * k) / 10
          const next = walkSurface(spec, layouts, x, z, level, FL)
          assert.ok(canStep(cur, next), `${spec.name} ${i}/${k}: ${cur?.y} → ${next?.y}`)
          assert.ok(Math.abs(next.y - cur.y) <= lay.riser + 1e-6)
          cur = next
          level = next.level
        }
      }
      assert.equal(level, lay.stair.fromLevel + 1, "上がり口で 2 階")
      const upperBase = spec.floors.filter(f => f.level <= lay.stair.fromLevel).reduce((a, f) => a + f.height, 0)
      assert.ok(Math.abs(cur.y - (upperBase + FL)) < 1e-6, "2 階の床の高さ")
    }
  }
})

test("内見: 1 階の床から階段の途中へ横から乗れない／2 階から吹き抜けへ踏み出せない", () => {
  const spec = massing
  const layouts = spec.stairs.map(s => stairLayout(spec, s))
  const lay = layouts[0]
  const mid = lay.steps[Math.floor(lay.steps.length / 2)]
  const s = lay.stair
  // 段の横（外形の外側 0.1m）から中ほどの段へ
  const zMid = (mid.z0 + mid.z1) / 2
  const beside = walkSurface(spec, layouts, s.x + s.w + 0.1, zMid, 0, FL)
  const onMid = walkSurface(spec, layouts, (mid.x0 + mid.x1) / 2, zMid, 0, FL)
  assert.ok(onMid.stair && onMid.y - beside.y > MAX_STEP)
  assert.equal(canStep(beside, onMid), false)
  // 2 階: 開口の外側から、段の無い場所（開口の中の、下の段の上空）へ
  const upFloor = walkSurface(spec, layouts, s.x + s.w + 0.3, s.z + s.d - 0.2, 1, FL)
  const lowStep = walkSurface(spec, layouts, (lay.steps[0].x0 + lay.steps[0].x1) / 2, (lay.steps[0].z0 + lay.steps[0].z1) / 2, 1, FL)
  assert.ok(lowStep.stair && upFloor.y - lowStep.y > MAX_STEP, "2 階の床と 1 段目の差は段差の上限を超える")
  assert.equal(canStep(upFloor, lowStep), false)
  // かね折れの内側の角（段の無い吹き抜け）は、2 階から見て足場なし
  const L = sample.stairs.find(st => st.shape === "L")
  const lLay = stairLayout(sample, L)
  const lLayouts = sample.stairs.map(st => stairLayout(sample, st))
  const cx = L.x + L.w / 2
  const cz = L.z + L.d / 2
  const void_ = lLay.steps.some(st => cx >= st.x0 && cx <= st.x1 && cz >= st.z0 && cz <= st.z1) ? null : walkSurface(sample, lLayouts, cx, cz, 1, FL)
  assert.equal(void_, null)
})

test("Three.js と Blender の段・手すり・手すり壁の寸法が一致する", { skip: !hasPython() }, () => {
  const cases = [
    ...syntheticStairs().map(s => ({ spec: massing, s })),
    ...winderStairs().map(s => ({ spec: massing, s })),
    ...sample.stairs.map(s => ({ spec: sample, s })),
    ...massing.stairs.map(s => ({ spec: massing, s })),
  ]
  const input = JSON.stringify(cases.map(({ spec, s }) => ({ spec: { floors: spec.floors.map(f => ({ level: f.level, height: f.height, slabs: f.slabs })), wallHeightDefault: spec.wallHeightDefault, stairs: [s] }, s })))
  const py = JSON.parse(
    execFileSync("python", ["-c", `
import json, sys
sys.path.insert(0, "blender")
from stairs import stair_layout, slabs_with_openings
out = []
for c in json.load(sys.stdin):
    lay = stair_layout(c["spec"], c["s"])
    lay.pop("stair")
    lay["slabs"] = [slabs_with_openings(c["spec"], f) for f in c["spec"]["floors"]]
    out.append(lay)
print(json.dumps(out))
`], { cwd: new URL("..", import.meta.url), encoding: "utf8", input }),
  )
  cases.forEach(({ spec, s }, i) => {
    const { stair: _s, ...ts } = stairLayout(spec, s)
    const withStair = { ...spec, stairs: [s] }
    ts.slabs = spec.floors.map(f => slabsWithOpenings(withStair, f))
    assertClose(ts, py[i], `${s.shape} ${s.up} ${s.turn ?? ""}`)
  })
})

function assertClose(a, b, path) {
  if (typeof a === "number") return assert.ok(Math.abs(a - b) < 1e-9, `${path}: ${a} != ${b}`)
  if (Array.isArray(a)) {
    assert.equal(a.length, b.length, `${path} length`)
    return a.forEach((v, i) => assertClose(v, b[i], `${path}[${i}]`))
  }
  if (a && typeof a === "object") {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), path)
    for (const k of Object.keys(a)) assertClose(a[k], b[k], `${path}.${k}`)
    return
  }
  assert.equal(a, b, path)
}

function hasPython() {
  try {
    execFileSync("python", ["--version"])
    return true
  } catch {
    return false
  }
}

test("回り階段: 横から 1 段目に乗れ、回り段を上ってから直進部へ進める。正面（上り口の先）からは 2 段以上の段差", () => {
  for (const s of winderStairs()) {
    const spec = { ...massing, stairs: [s] }
    const lay = stairLayout(spec, s)
    const layouts = [lay]
    assert.equal(lay.steps.length, 12)
    assert.ok(lay.riser <= 0.23 + 1e-9)
    // 上り口（横）の中心から、回り段 → 直進部の中心をたどる
    const ap = lay.approach
    const k = lay.steps.findIndex(st => st.down === lay.stair.up.replace(/^[+-]/, m => (m === "+" ? "-" : "+")))
    const path = [[ap.x + ap.w / 2, ap.z + ap.d / 2], ...lay.steps.map(st => [(st.x0 + st.x1) / 2, (st.z0 + st.z1) / 2])]
    let cur = walkSurface(spec, layouts, path[0][0], path[0][1], 0, 0.45)
    let level = 0
    for (let i = 1; i < path.length; i++) {
      const next = walkSurface(spec, layouts, path[i][0], path[i][1], level, 0.45)
      assert.ok(canStep(cur, next), `${s.up}/${s.entry} ${i}`)
      cur = next
      level = next.level
    }
    assert.ok(k > 0, "直進部がある")
  }
})

import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"

test("ライトマップ: ノイズを UV の島の中だけでならし、島の外は 0・縁は暗くならない", () => {
  const out = JSON.parse(
    execFileSync("python", ["-c", `
import json, sys
import numpy as np
sys.path.insert(0, "blender")
from lightmap_math import masked_blur
rng = np.random.RandomState(0)
a = np.zeros((64, 64), np.float32)
a[8:40, 8:40] = 0.5 + rng.rand(32, 32) * 0.5
b = masked_blur(a, 4)
print(json.dumps({
  "outside": float(np.abs(b[48:, 48:]).max()),
  "stdBefore": float(a[8:40, 8:40].std()), "stdAfter": float(b[8:40, 8:40].std()),
  "edgeRatio": float(b[8, 8:40].mean() / b[24, 8:40].mean()),
  "meanDiff": float(abs(a[8:40, 8:40].mean() - b[8:40, 8:40].mean())),
}))
`], { cwd: new URL("..", import.meta.url), encoding: "utf8" }),
  )
  assert.equal(out.outside, 0)
  assert.ok(out.stdAfter < out.stdBefore * 0.4, JSON.stringify(out))
  assert.ok(out.edgeRatio > 0.9, `縁が暗くならない: ${out.edgeRatio}`)
  assert.ok(out.meanDiff < 0.02, "平均の明るさは変わらない")
})

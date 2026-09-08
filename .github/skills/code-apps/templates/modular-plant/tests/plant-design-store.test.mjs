import test from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_PLANT_DESIGN } from "../src/data/plant-design-sample.ts"
import { saveDesignRevision } from "../src/data/plant-design-store.ts"

test("shared revisions are append-only and reject stale or wrong-base proposals", async () => {
  const rows = []
  const storage = { latest: async () => rows.at(-1) ?? null, append: async (row) => { if (rows.some((existing) => existing.revision === row.revision)) throw new Error("duplicate"); rows.push(row) } }
  const first = await saveDesignRevision(storage, "design1", DEFAULT_PLANT_DESIGN, null)
  assert.equal(first.revision, 1)
  const proposal = { id: "proposal1", designId: "design1", baseRevision: 1, baseHash: first.hash, json: JSON.stringify(DEFAULT_PLANT_DESIGN), reason: "test", rejected: false }
  await assert.rejects(saveDesignRevision(storage, "design1", DEFAULT_PLANT_DESIGN, first, { ...proposal, baseHash: "bad" }), /基準改訂/)
  const second = await saveDesignRevision(storage, "design1", DEFAULT_PLANT_DESIGN, first, proposal)
  assert.equal(second.proposalId, "proposal1")
  assert.equal(second.revision, 2)
  assert.equal(rows[0].json, first.json)
  await assert.rejects(saveDesignRevision(storage, "design1", DEFAULT_PLANT_DESIGN, first), /他の改訂/)
  const results = await Promise.allSettled([saveDesignRevision(storage, "design1", DEFAULT_PLANT_DESIGN, second), saveDesignRevision(storage, "design1", DEFAULT_PLANT_DESIGN, second)])
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
})
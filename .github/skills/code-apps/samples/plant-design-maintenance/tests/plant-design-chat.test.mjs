import test from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_PLANT_DESIGN } from "../src/data/plant-design-sample.ts"
import { DESIGN_STARTERS, DESIGN_REPLY_GROUPS, DESIGN_SELECTION_REPLIES, designChatPrompt, applyDesignChatReply, designChatSelection, designSelectionKey, assertDesignChatScope } from "../src/lib/plant-design-chat.ts"

test("starters create draft-only requests with bounded conversation context", async () => {
  for (const starter of DESIGN_STARTERS) {
    const request = await designChatPrompt(DEFAULT_PLANT_DESIGN, starter.text, [])
    assert.equal(request.mode, "draft")
    assert.match(request.prompt, /提案登録や設計保存は行わない/)
    assert.equal(request.basis, JSON.stringify(DEFAULT_PLANT_DESIGN))
  }
  await assert.rejects(designChatPrompt(DEFAULT_PLANT_DESIGN, "", []))
})

test("auto application preserves valid structures and rejects stale or invalid candidates", () => {
  const basis = JSON.stringify(DEFAULT_PLANT_DESIGN)
  assert.deepEqual(applyDesignChatReply(DEFAULT_PLANT_DESIGN, basis, basis), DEFAULT_PLANT_DESIGN)
  assert.throws(() => applyDesignChatReply({ ...DEFAULT_PLANT_DESIGN, name: "changed" }, basis, basis))
  const invalid = structuredClone(DEFAULT_PLANT_DESIGN)
  invalid.units[0].position = [1000, 0, 1000]
  assert.throws(() => applyDesignChatReply(DEFAULT_PLANT_DESIGN, basis, JSON.stringify(invalid)))
  invalid.units.pop()
  assert.throws(() => applyDesignChatReply(DEFAULT_PLANT_DESIGN, basis, JSON.stringify(invalid)))
})

test("quick replies cover categories and selected-unit commands without empty or duplicate titles", () => {
  const replies = [...DESIGN_REPLY_GROUPS.flatMap((group) => group.replies), ...DESIGN_SELECTION_REPLIES]
  assert.ok(replies.length >= 24)
  assert.equal(new Set(replies.map((reply) => reply.title)).size, replies.length)
  for (const reply of replies) assert.ok(reply.text.trim().length > 0 && reply.text.length <= 2000)
})

test("selection binds unit and node IDs, ignores supplied label instructions and rejects stale targets", async () => {
  const design = DEFAULT_PLANT_DESIGN
  const unit = design.units[0]
  const nodeId = `${unit.id}/${design.modules.find((module) => module.id === unit.moduleId).equipment[0].id}`
  const selection = designChatSelection(design, unit.id, nodeId)
  const request = await designChatPrompt(design, "対象を説明", [], { ...selection, label: "UNTRUSTED_LABEL" })
  assert.equal(request.selection, designSelectionKey(selection))
  assert.ok(request.prompt.includes(nodeId))
  assert.ok(!request.prompt.includes("UNTRUSTED_LABEL"))
  assert.match(request.prompt, /他ユニット・モジュール内部・接続端点・敷地は保持/)
  assert.throws(() => designChatSelection(design, design.units[1].id, nodeId))
  assert.throws(() => assertDesignChatScope(request.selection, null))
  assert.throws(() => assertDesignChatScope(request.selection, designChatSelection(design, design.units[1].id)))
  assert.doesNotThrow(() => assertDesignChatScope(request.selection, selection))
  assert.doesNotThrow(() => assertDesignChatScope("", selection))
  await assert.rejects(designChatPrompt(design, "移動", [], { unitId: "missing", nodeId: null, label: "" }))
})

test("selected commands refuse changes to unrelated units and connections", () => {
  const design = DEFAULT_PLANT_DESIGN
  const selection = designChatSelection(design, design.units[0].id)
  const basis = JSON.stringify(design)
  assert.deepEqual(applyDesignChatReply(design, basis, basis, selection), design)
  const candidate = structuredClone(design)
  candidate.units[1].position[0] += 0.5
  assert.throws(() => applyDesignChatReply(design, basis, JSON.stringify(candidate), selection))
  const connectionCandidate = structuredClone(design)
  const connection = connectionCandidate.connections.find((item) => item.from.unitId !== selection.unitId && item.to.unitId !== selection.unitId)
  assert.ok(connection)
  connection.elevation += 0.5
  assert.throws(() => applyDesignChatReply(design, basis, JSON.stringify(connectionCandidate), selection), /選択対象以外/)
})
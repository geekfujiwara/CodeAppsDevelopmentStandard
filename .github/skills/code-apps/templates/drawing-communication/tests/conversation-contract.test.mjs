import test from "node:test"
import assert from "node:assert/strict"
import {
  MAX_RESULT_BYTES,
  acceptResult,
  assertNewTurn,
  isSameScope,
  nextTurnId,
  validateRequest,
} from "../src/conversation/conversation-contract.ts"
import { createDemoTransport } from "../src/conversation/demo-worker.ts"
import { createDrawing } from "../src/drawing/drawing-factory.ts"
import { hashDrawing } from "../src/drawing/drawing-schema.ts"

const drawing = createDrawing("horizontal-pump-assembly", { serial: 12, date: "2026-01-15" })
const baseHash = hashDrawing(drawing)

function request(overrides = {}) {
  return {
    conversationId: "conv-001",
    turnId: nextTurnId("conv-001", 1),
    version: 3,
    baseHash,
    operation: "review-drawing",
    prompt: "据付寸法を確認してください",
    selection: null,
    createdAt: "2026-01-15T01:00:00.000Z",
    ...overrides,
  }
}

function result(overrides = {}) {
  return {
    conversationId: "conv-001",
    turnId: nextTurnId("conv-001", 1),
    version: 3,
    baseHash,
    status: "completed",
    workerKind: "demo",
    summary: "指摘 1 件",
    candidateJson: JSON.stringify(drawing),
    error: null,
    completedAt: "2026-01-15T01:00:05.000Z",
    ...overrides,
  }
}

test("送信前検査は編集バージョン・基準ハッシュ・操作・依頼文を突き合わせる", () => {
  assert.deepEqual(validateRequest(request(), { version: 3, baseHash }), [])
  assert.deepEqual(validateRequest(request({ version: 2 }), { version: 3, baseHash }), ["version-changed"])
  assert.deepEqual(validateRequest(request({ baseHash: "0".repeat(16) }), { version: 3, baseHash }), ["base-changed"])
  assert.deepEqual(validateRequest(request({ prompt: "   " }), { version: 3, baseHash }), ["prompt-empty"])
  assert.deepEqual(validateRequest(request({ operation: "delete-everything" }), { version: 3, baseHash }), ["operation-not-allowed"])
  assert.deepEqual(validateRequest(request({ conversationId: "" }), { version: 3, baseHash }), ["scope-incomplete"])
})

test("同じ turnId の再送は拒否する", () => {
  const history = [{ turnId: "conv-001-t001" }]
  assert.throws(() => assertNewTurn(history, "conv-001-t001"), /同じターン ID/)
  assert.doesNotThrow(() => assertNewTurn(history, "conv-001-t002"))
})

test("相関が一致した終端結果だけを受け入れる", () => {
  const submitted = request()
  const current = { version: 3, baseHash }

  assert.equal(acceptResult(submitted, result(), current).accepted, true)
  assert.equal(acceptResult(null, result(), current).code, "unknown-turn")
  assert.equal(acceptResult(submitted, result({ conversationId: "conv-999" }), current).code, "conversation-mismatch")
  assert.equal(acceptResult(submitted, result({ turnId: "conv-001-t002" }), current).code, "turn-mismatch")
  assert.equal(acceptResult(submitted, result(), { version: 4, baseHash }).code, "version-changed")
  assert.equal(acceptResult(submitted, result(), { version: 3, baseHash: "1".repeat(16) }).code, "base-changed")
  assert.equal(acceptResult(submitted, result({ status: "running" }), current).code, "not-terminal")
  assert.equal(acceptResult(submitted, result({ summary: "", candidateJson: null }), current).code, "empty-result")
  assert.equal(acceptResult(submitted, result({ candidateJson: "x".repeat(MAX_RESULT_BYTES + 1) }), current).code, "too-large")
  assert.equal(acceptResult(submitted, result({ status: "failed", candidateJson: null, error: "worker error" }), current).accepted, true)
  assert.equal(isSameScope(submitted, result()), true)
})

test("DEMO ワーカーは pending → running → completed を経て候補 JSON を返す", async () => {
  let clock = 1_000
  const transport = createDemoTransport({ resolveDrawing: () => drawing, now: () => clock, pendingMs: 700, runningMs: 2200 })
  const submitted = request({ turnId: "conv-002-t001", conversationId: "conv-002" })

  const receipt = await transport.submit(submitted)
  assert.equal(receipt.status, "pending")
  assert.equal(receipt.workerKind, "demo")
  assert.equal(transport.kind, "demo")
  assert.match(transport.caution, /AI エージェントの応答ではありません/)

  clock += 800
  assert.equal((await transport.poll(submitted)).receipt.status, "running")
  assert.equal((await transport.poll(submitted)).result, null)

  clock += 2_000
  const polled = await transport.poll(submitted)
  assert.equal(polled.receipt.status, "completed")
  assert.ok(polled.result)
  assert.equal(polled.result.status, "completed")
  assert.match(polled.result.summary, /DEMO/)

  const decision = acceptResult(submitted, polled.result, { version: submitted.version, baseHash })
  assert.equal(decision.accepted, true)
  const candidate = JSON.parse(polled.result.candidateJson)
  assert.ok(candidate.annotations.some((annotation) => annotation.source === "ai"))
})

test("DEMO ワーカーは重複送信・基準変更・未知ターンを拒否する", async () => {
  const transport = createDemoTransport({ resolveDrawing: () => drawing, now: () => 5_000 })
  const submitted = request({ turnId: "conv-003-t001", conversationId: "conv-003" })
  await transport.submit(submitted)

  await assert.rejects(() => transport.submit(submitted), /同じターン ID/)
  await assert.rejects(
    () => transport.submit(request({ turnId: "conv-003-t002", conversationId: "conv-003", baseHash: "2".repeat(16) })),
    /基準ハッシュ不一致|図面の内容が変わりました/,
  )
  await assert.rejects(() => transport.poll({ ...submitted, turnId: "conv-003-t999" }), /対応する要求が見つかりません/)
})

test("寸法変更の提案は範囲内のパラメーターを返し、検証を通る", async () => {
  let clock = 0
  const narrow = { ...drawing, parameters: { ...drawing.parameters, shaftCenterHeight: 130, casingDiameter: 380 } }
  const transport = createDemoTransport({ resolveDrawing: () => narrow, now: () => clock })
  const submitted = request({
    turnId: "conv-004-t001",
    conversationId: "conv-004",
    operation: "propose-dimension-change",
    baseHash: hashDrawing(narrow),
  })
  await transport.submit(submitted)
  clock += 10_000
  const { result: done } = await transport.poll(submitted)
  const candidate = JSON.parse(done.candidateJson)
  assert.ok(candidate.parameters.shaftCenterHeight > narrow.parameters.shaftCenterHeight)
  assert.equal(candidate.parameters.shaftCenterHeight <= 600, true)
})

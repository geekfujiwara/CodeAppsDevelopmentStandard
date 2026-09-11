import test from "node:test"
import assert from "node:assert/strict"
import { createInitialWorkspace, overdueTasks, workspaceReducer, MAX_UNDO } from "../src/state/workspace.ts"
import { createAnnotation, nextAnnotationId } from "../src/drawing/drawing-factory.ts"
import { hashDrawing } from "../src/drawing/drawing-schema.ts"

function annotation(id = "note-001") {
  return createAnnotation({
    id,
    title: "通路幅を確認",
    body: "台車動線の確認",
    at: { x: 120, y: 90 },
    createdAt: "2026-01-15T00:00:00.000Z",
  })
}

function withAnnotation() {
  return workspaceReducer(createInitialWorkspace(), { type: "add-annotation", annotation: annotation() })
}

test("図面を変える操作は編集バージョンを進め、Undo で戻せる", () => {
  const initial = createInitialWorkspace()
  const changed = workspaceReducer(initial, { type: "update-parameter", key: "aisleWidth", value: 1200 })
  assert.equal(changed.version, initial.version + 1)
  assert.equal(changed.drawing.parameters.aisleWidth, 1200)
  assert.equal(changed.undo.length, 1)

  const undone = workspaceReducer(changed, { type: "undo" })
  assert.equal(undone.drawing.parameters.aisleWidth, initial.drawing.parameters.aisleWidth)
  assert.equal(undone.undo.length, 0)
  // Undo も「操作」なのでバージョンは進む（送信済みの結果を無効化するため）
  assert.equal(undone.version, changed.version + 1)

  assert.equal(workspaceReducer(initial, { type: "update-parameter", key: "unknownKey", value: 1 }), initial)
  assert.equal(workspaceReducer(initial, { type: "update-parameter", key: "aisleWidth", value: initial.drawing.parameters.aisleWidth }), initial)
})

test("Undo は上限で打ち切られる", () => {
  let state = createInitialWorkspace()
  for (let index = 1; index <= MAX_UNDO + 5; index += 1) {
    state = workspaceReducer(state, { type: "update-parameter", key: "aisleWidth", value: 600 + index })
  }
  assert.equal(state.undo.length, MAX_UNDO)
})

test("注釈からタスクを作り、担当と期限を引き継ぐ", () => {
  let state = withAnnotation()
  state = workspaceReducer(state, { type: "update-annotation", id: "note-001", patch: { assignee: "生産技術", dueDate: "2026-02-01" } })
  state = workspaceReducer(state, { type: "create-task", annotationId: "note-001", id: "task-1", createdAt: "2026-01-15T01:00:00.000Z" })
  assert.equal(state.tasks.length, 1)
  assert.equal(state.tasks[0].assignee, "生産技術")
  assert.equal(state.tasks[0].dueDate, "2026-02-01")
  assert.deepEqual(overdueTasks(state.tasks, "2026-03-01").length, 1)
  assert.deepEqual(overdueTasks(state.tasks, "2026-01-20").length, 0)

  // 同じ注釈から二重にタスクを作らない
  const twice = workspaceReducer(state, { type: "create-task", annotationId: "note-001", id: "task-2", createdAt: "2026-01-15T02:00:00.000Z" })
  assert.equal(twice.tasks.length, 1)

  // 注釈を消すと紐づくタスクも消える
  const removed = workspaceReducer(state, { type: "remove-annotation", id: "note-001" })
  assert.equal(removed.tasks.length, 0)
  assert.equal(removed.selectedAnnotationId, null)
})

test("注釈 ID は既存と衝突しない", () => {
  const state = withAnnotation()
  assert.equal(nextAnnotationId(state.drawing.annotations), "note-002")
  const duplicate = workspaceReducer(state, { type: "add-annotation", annotation: annotation("note-001") })
  assert.equal(duplicate, state)
})

test("同じターンは 2 回記録されない（重複ターンの拒否）", () => {
  const entry = {
    turnId: "conv-0001-t001",
    conversationId: "conv-0001",
    operation: "review-drawing",
    prompt: "確認してください",
    status: "pending",
    workerKind: "demo",
    version: 1,
    baseHash: "0".repeat(16),
    createdAt: "2026-01-15T03:00:00.000Z",
    updatedAt: "2026-01-15T03:00:00.000Z",
    summary: "",
    error: "",
    proposalId: null,
  }
  const first = workspaceReducer(createInitialWorkspace(), { type: "record-turn", entry })
  assert.equal(first.turns.length, 1)
  assert.equal(first.turnCounter, 1)
  const second = workspaceReducer(first, { type: "record-turn", entry: { ...entry, prompt: "別の依頼" } })
  assert.equal(second, first)
})

test("候補は採用で下書きに反映され、却下では変わらない", () => {
  const base = createInitialWorkspace()
  const candidate = { ...base.drawing, parameters: { ...base.drawing.parameters, aisleWidth: 1200 } }
  const proposal = {
    id: "prop-1",
    turnId: "conv-0001-t001",
    conversationId: "conv-0001",
    createdAt: "2026-01-15T03:00:05.000Z",
    summary: "通路幅の是正",
    candidateJson: JSON.stringify(candidate),
    baseHash: hashDrawing(base.drawing),
    baseVersion: base.version,
    status: "pending",
    workerKind: "demo",
  }

  const withProposal = workspaceReducer(base, { type: "add-proposal", proposal })
  const rejected = workspaceReducer(withProposal, { type: "reject-proposal", id: "prop-1" })
  assert.equal(rejected.proposals[0].status, "rejected")
  assert.equal(rejected.drawing.parameters.aisleWidth, base.drawing.parameters.aisleWidth)
  assert.equal(rejected.version, base.version)

  const adopted = workspaceReducer(withProposal, { type: "adopt-proposal", id: "prop-1", drawing: candidate })
  assert.equal(adopted.proposals[0].status, "adopted")
  assert.equal(adopted.drawing.parameters.aisleWidth, 1200)
  assert.equal(adopted.undo.length, 1)

  // 採用済みの候補は二度適用されない
  assert.equal(workspaceReducer(adopted, { type: "adopt-proposal", id: "prop-1", drawing: candidate }), adopted)

  const undone = workspaceReducer(adopted, { type: "undo" })
  assert.equal(undone.drawing.parameters.aisleWidth, base.drawing.parameters.aisleWidth)
})

test("改訂保存は内容が同じなら増えない", () => {
  const state = workspaceReducer(createInitialWorkspace(), { type: "save-revision", note: "初版", savedAt: "2026-01-15T04:00:00.000Z" })
  assert.equal(state.revisions.length, 1)
  assert.equal(state.drawing.revision, 2)
  assert.equal(state.revisions[0].hash.length, 16)

  const again = workspaceReducer(state, { type: "save-revision", note: "無変更", savedAt: "2026-01-15T04:30:00.000Z" })
  assert.equal(again, state)

  const edited = workspaceReducer(state, { type: "update-parameter", key: "aisleWidth", value: 1300 })
  const saved = workspaceReducer(edited, { type: "save-revision", note: "通路幅是正", savedAt: "2026-01-15T05:00:00.000Z" })
  assert.equal(saved.revisions.length, 2)
  assert.notEqual(saved.revisions[0].hash, saved.revisions[1].hash)
})

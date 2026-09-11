/**
 * 図面ワークベンチの状態遷移（純粋関数）。
 *
 * React に依存しないため、Node の標準テストからそのまま検証できる。
 * 図面を変更する操作はすべて編集バージョンを進め、Undo を 1 件積む。
 */
import type { Annotation, AnnotationComment, AnnotationStatus, Drawing, TemplateId } from "../drawing/drawing-schema.ts"
import type { TurnStatus, WorkerKind } from "../conversation/conversation-contract.ts"
import { hashDrawing, serializeDrawing } from "../drawing/drawing-schema.ts"
import { createDrawing } from "../drawing/drawing-factory.ts"

export const TASK_STATUSES = ["todo", "doing", "review", "done"] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "未着手",
  doing: "対応中",
  review: "確認待ち",
  done: "完了",
}

export type Task = {
  id: string
  annotationId: string
  title: string
  status: TaskStatus
  assignee: string
  dueDate: string
  createdAt: string
}

export type Revision = {
  revision: number
  /** 保存時点の図面ハッシュ（改訂番号を含む） */
  hash: string
  /** 改訂番号を除いた内容のハッシュ。無変更での二重保存を防ぐために使う。 */
  contentHash: string
  savedAt: string
  note: string
  json: string
}

export type ProposalStatus = "pending" | "adopted" | "rejected"

export type Proposal = {
  id: string
  turnId: string
  conversationId: string
  createdAt: string
  summary: string
  candidateJson: string
  baseHash: string
  baseVersion: number
  status: ProposalStatus
  workerKind: WorkerKind
}

export type TurnLogEntry = {
  turnId: string
  conversationId: string
  operation: string
  prompt: string
  status: TurnStatus
  workerKind: WorkerKind
  version: number
  baseHash: string
  createdAt: string
  updatedAt: string
  summary: string
  error: string
  proposalId: string | null
}

export type UndoEntry = { label: string; drawing: Drawing; version: number }

export type WorkspaceState = {
  drawing: Drawing
  /** 下書きの編集バージョン。非同期結果の相関確認に使う。 */
  version: number
  conversationId: string
  turnCounter: number
  selectedAnnotationId: string | null
  revisions: Revision[]
  proposals: Proposal[]
  tasks: Task[]
  turns: TurnLogEntry[]
  undo: UndoEntry[]
}

export const MAX_UNDO = 20

export type WorkspaceAction =
  | { type: "select-template"; templateId: TemplateId }
  | { type: "update-parameter"; key: string; value: number }
  | { type: "update-title-block"; key: keyof Drawing["titleBlock"]; value: string }
  | { type: "add-annotation"; annotation: Annotation }
  | { type: "update-annotation"; id: string; patch: Partial<Annotation> }
  | { type: "add-comment"; id: string; comment: AnnotationComment }
  | { type: "remove-annotation"; id: string }
  | { type: "select-annotation"; id: string | null }
  | { type: "create-task"; annotationId: string; id: string; createdAt: string }
  | { type: "update-task"; id: string; patch: Partial<Task> }
  | { type: "remove-task"; id: string }
  | { type: "save-revision"; note: string; savedAt: string }
  | { type: "record-turn"; entry: TurnLogEntry }
  | { type: "update-turn"; turnId: string; patch: Partial<TurnLogEntry> }
  | { type: "add-proposal"; proposal: Proposal }
  | { type: "adopt-proposal"; id: string; drawing: Drawing }
  | { type: "reject-proposal"; id: string }
  | { type: "undo" }
  | { type: "replace"; state: WorkspaceState }

export function createInitialWorkspace(templateId: TemplateId = "generic-equipment-layout", conversationId = crypto.randomUUID()): WorkspaceState {
  return {
    drawing: createDrawing(templateId, { serial: 1 }),
    version: 1,
    conversationId,
    turnCounter: 0,
    selectedAnnotationId: null,
    revisions: [],
    proposals: [],
    tasks: [],
    turns: [],
    undo: [],
  }
}

function withDrawing(state: WorkspaceState, drawing: Drawing, label: string): WorkspaceState {
  return {
    ...state,
    drawing,
    version: state.version + 1,
    undo: [{ label, drawing: state.drawing, version: state.version }, ...state.undo].slice(0, MAX_UNDO),
  }
}

function mapAnnotation(drawing: Drawing, id: string, update: (annotation: Annotation) => Annotation): Drawing {
  return { ...drawing, annotations: drawing.annotations.map((annotation) => (annotation.id === id ? update(annotation) : annotation)) }
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "select-template": {
      if (action.templateId === state.drawing.templateId) return state
      const next = createDrawing(action.templateId, {
        serial: 1,
        project: state.drawing.titleBlock.project,
        designer: state.drawing.titleBlock.designer,
        checker: state.drawing.titleBlock.checker,
        date: state.drawing.titleBlock.date,
      })
      return { ...withDrawing(state, next, "テンプレート変更"), selectedAnnotationId: null }
    }

    case "update-parameter": {
      if (!(action.key in state.drawing.parameters) || !Number.isFinite(action.value)) return state
      if (state.drawing.parameters[action.key] === action.value) return state
      return withDrawing(state, { ...state.drawing, parameters: { ...state.drawing.parameters, [action.key]: action.value } }, `寸法変更 ${action.key}`)
    }

    case "update-title-block": {
      if (state.drawing.titleBlock[action.key] === action.value) return state
      return withDrawing(state, { ...state.drawing, titleBlock: { ...state.drawing.titleBlock, [action.key]: action.value } }, "表題欄編集")
    }

    case "add-annotation": {
      if (state.drawing.annotations.some((annotation) => annotation.id === action.annotation.id)) return state
      const next = { ...state.drawing, annotations: [...state.drawing.annotations, action.annotation] }
      return { ...withDrawing(state, next, "注釈追加"), selectedAnnotationId: action.annotation.id }
    }

    case "update-annotation": {
      const target = state.drawing.annotations.find((annotation) => annotation.id === action.id)
      if (!target) return state
      const next = mapAnnotation(state.drawing, action.id, (annotation) => ({ ...annotation, ...action.patch, id: annotation.id }))
      const updated = withDrawing(state, next, "注釈更新")
      // 注釈に紐づくタスクの担当・期限は一方向に同期する（タスク側の編集は上書きしない）
      const tasks = updated.tasks.map((task) =>
        task.annotationId === action.id
          ? {
              ...task,
              assignee: action.patch.assignee ?? task.assignee,
              dueDate: action.patch.dueDate ?? task.dueDate,
              title: action.patch.title ?? task.title,
            }
          : task,
      )
      return { ...updated, tasks }
    }

    case "add-comment": {
      const target = state.drawing.annotations.find((annotation) => annotation.id === action.id)
      if (!target || target.comments.some((comment) => comment.id === action.comment.id)) return state
      return withDrawing(
        state,
        mapAnnotation(state.drawing, action.id, (annotation) => ({ ...annotation, comments: [...annotation.comments, action.comment] })),
        "コメント追加",
      )
    }

    case "remove-annotation": {
      if (!state.drawing.annotations.some((annotation) => annotation.id === action.id)) return state
      const next = { ...state.drawing, annotations: state.drawing.annotations.filter((annotation) => annotation.id !== action.id) }
      const updated = withDrawing(state, next, "注釈削除")
      return {
        ...updated,
        selectedAnnotationId: state.selectedAnnotationId === action.id ? null : state.selectedAnnotationId,
        tasks: updated.tasks.filter((task) => task.annotationId !== action.id),
      }
    }

    case "select-annotation":
      return { ...state, selectedAnnotationId: action.id }

    case "create-task": {
      const annotation = state.drawing.annotations.find((item) => item.id === action.annotationId)
      if (!annotation) return state
      if (state.tasks.some((task) => task.annotationId === action.annotationId)) return state
      const task: Task = {
        id: action.id,
        annotationId: annotation.id,
        title: annotation.title,
        status: "todo",
        assignee: annotation.assignee,
        dueDate: annotation.dueDate,
        createdAt: action.createdAt,
      }
      return { ...state, tasks: [...state.tasks, task] }
    }

    case "update-task":
      return { ...state, tasks: state.tasks.map((task) => (task.id === action.id ? { ...task, ...action.patch, id: task.id } : task)) }

    case "remove-task":
      return { ...state, tasks: state.tasks.filter((task) => task.id !== action.id) }

    case "save-revision": {
      const contentHash = hashDrawing({ ...state.drawing, revision: 0 })
      if (state.revisions[0]?.contentHash === contentHash) return state
      const revision: Revision = {
        revision: state.drawing.revision,
        hash: hashDrawing(state.drawing),
        contentHash,
        savedAt: action.savedAt,
        note: action.note,
        json: serializeDrawing(state.drawing),
      }
      const drawing = { ...state.drawing, revision: state.drawing.revision + 1 }
      return { ...state, drawing, revisions: [revision, ...state.revisions] }
    }

    case "record-turn": {
      if (state.turns.some((turn) => turn.turnId === action.entry.turnId)) return state
      return { ...state, turns: [action.entry, ...state.turns], turnCounter: state.turnCounter + 1 }
    }

    case "update-turn":
      return {
        ...state,
        turns: state.turns.map((turn) => (turn.turnId === action.turnId ? { ...turn, ...action.patch, turnId: turn.turnId } : turn)),
      }

    case "add-proposal": {
      if (state.proposals.some((proposal) => proposal.id === action.proposal.id)) return state
      return { ...state, proposals: [action.proposal, ...state.proposals] }
    }

    case "adopt-proposal": {
      const proposal = state.proposals.find((item) => item.id === action.id)
      if (!proposal || proposal.status !== "pending") return state
      const updated = withDrawing(state, action.drawing, `候補採用 ${proposal.id}`)
      return {
        ...updated,
        proposals: updated.proposals.map((item) => (item.id === action.id ? { ...item, status: "adopted" } : item)),
      }
    }

    case "reject-proposal":
      return {
        ...state,
        proposals: state.proposals.map((item) => (item.id === action.id && item.status === "pending" ? { ...item, status: "rejected" } : item)),
      }

    case "undo": {
      const [entry, ...rest] = state.undo
      if (!entry) return state
      return { ...state, drawing: entry.drawing, version: state.version + 1, undo: rest }
    }

    case "replace":
      return action.state
  }
}

export function annotationStatusLabel(status: AnnotationStatus): string {
  return { open: "未対応", "in-review": "確認中", resolved: "完了", rejected: "却下" }[status]
}

export function overdueTasks(tasks: readonly Task[], today: string): Task[] {
  return tasks.filter((task) => task.status !== "done" && task.dueDate !== "" && task.dueDate < today)
}

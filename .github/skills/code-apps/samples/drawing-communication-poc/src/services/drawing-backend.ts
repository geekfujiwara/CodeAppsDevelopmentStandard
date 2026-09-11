/**
 * バックエンド境界（アダプター）。
 *
 * 画面はこのモジュールが返すインターフェイスだけに依存する。
 * Dataverse へ接続するときは、`npx pa app add data-source` が生成する
 * `src/generated/services/MicrosoftDataverseService.ts` を **この 1 ファイルの中だけで** 包む。
 * 画面・状態遷移・テストは変更しない。
 *
 * 既定（未接続）では成功を装わず、明示的に失敗する。
 */
import { MicrosoftDataverseService } from "@/generated/services/MicrosoftDataverseService"
import { hashDrawing, type Drawing } from "@/drawing/drawing-schema"
import type { ConversationTransport, TransportPoll } from "@/conversation/conversation-transport"
import { createDemoTransport } from "@/conversation/demo-worker"
import type { TurnReceipt, TurnRequest, TurnResult, TurnScope, TurnStatus } from "@/conversation/conversation-contract"
import { FEATURE_DRAWING_CONVERSATION, FEATURE_DRAWING_STORAGE, PUBLISHER_PREFIX } from "@/config"

export type RepositoryKind = "local" | "dataverse"

export type AppendRevisionInput = {
  drawing: Drawing
  hash: string
  note: string
}

export type AppendRevisionOutput = {
  revision: number
  savedAt: string
  /** 共有保存されたか。ローカル下書きのみの場合は false。 */
  shared: boolean
}

export interface DrawingRepository {
  readonly kind: RepositoryKind
  readonly label: string
  readonly caution: string
  appendRevision(input: AppendRevisionInput): Promise<AppendRevisionOutput>
}

export class BackendNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BackendNotConfiguredError"
  }
}

const DATAVERSE_SETUP_HINT =
  "Dataverse 未接続です。npx pa app add data-source で生成したサービスを src/services/drawing-backend.ts で包み、.env の VITE_FEATURE_DRAWING_* を有効にしてください。"

const ORGANIZATION = import.meta.env.VITE_DATAVERSE_URL?.trim() ?? ""
const field = (name: string) => `${PUBLISHER_PREFIX}_${name}`
const tables = {
  drawings: () => `${PUBLISHER_PREFIX}_drawings`,
  revisions: () => `${PUBLISHER_PREFIX}_drawingrevisions`,
  requests: () => `${PUBLISHER_PREFIX}_drawingrequests`,
  results: () => `${PUBLISHER_PREFIX}_drawingresults`,
}

type DataverseRow = Record<string, unknown>

function assertDataverseConfigured() {
  if (!ORGANIZATION || !PUBLISHER_PREFIX) throw new BackendNotConfiguredError(DATAVERSE_SETUP_HINT)
}

function escapeOData(value: string): string {
  return value.replaceAll("'", "''")
}

function stringValue(row: DataverseRow, name: string): string {
  return typeof row[name] === "string" ? row[name] : ""
}

function numberValue(row: DataverseRow, name: string): number {
  return typeof row[name] === "number" ? row[name] : 0
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

async function listRows(entityName: string, select: string[], filter: string, top = 2): Promise<DataverseRow[]> {
  assertDataverseConfigured()
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    ORGANIZATION,
    entityName,
    undefined,
    "application/json",
    undefined,
    undefined,
    select.join(","),
    filter,
    undefined,
    undefined,
    undefined,
    top,
  )
  if (!result.success) throw new Error(`${entityName} の取得に失敗しました: ${errorMessage(result.error)}`)
  return ((result.data as { value?: DataverseRow[] } | undefined)?.value ?? [])
}

async function createRow(entityName: string, item: DataverseRow): Promise<void> {
  assertDataverseConfigured()
  const result = await MicrosoftDataverseService.CreateRecordWithOrganization(
    "return=representation",
    "application/json",
    ORGANIZATION,
    entityName,
    item,
  )
  if (!result.success) throw new Error(`${entityName} の作成に失敗しました: ${errorMessage(result.error)}`)
}

async function updateRow(entityName: string, id: string, etag: string, item: DataverseRow): Promise<void> {
  const result = await MicrosoftDataverseService.UpdateOnlyRecordWithOrganization(
    "return=representation",
    "application/json",
    etag,
    ORGANIZATION,
    entityName,
    id,
    item,
  )
  if (!result.success) throw new Error(`${entityName} の更新に失敗しました。再読込して競合を確認してください。`)
}

function createLocalRepository(): DrawingRepository {
  return {
    kind: "local",
    label: "ローカル下書き（この端末のみ）",
    caution: "改訂はブラウザの localStorage にだけ残ります。共有保存ではありません。",
    async appendRevision(input) {
      return { revision: input.drawing.revision, savedAt: new Date().toISOString(), shared: false }
    },
  }
}

function createDataverseRepository(): DrawingRepository {
  return {
    kind: "dataverse",
    label: "Dataverse 改訂テーブル",
    caution: "共有改訂として保存します。競合時は保存せず再読込を求めます。",
    async appendRevision(input) {
      const drawingRows = await listRows(
        tables.drawings(),
        [`${PUBLISHER_PREFIX}_drawingid`, field("currentrevision"), field("currenthash"), "@odata.etag"],
        `${field("name")} eq '${escapeOData(input.drawing.id)}'`,
      )
      if (drawingRows.length !== 1) throw new Error("共有先の図面を一意に特定できません。")

      const drawingRow = drawingRows[0]
      const drawingId = stringValue(drawingRow, `${PUBLISHER_PREFIX}_drawingid`)
      const currentRevision = numberValue(drawingRow, field("currentrevision"))
      const currentHash = stringValue(drawingRow, field("currenthash"))
      if (!drawingId) throw new Error("共有先の図面 ID を取得できません。")
      if (currentHash === input.hash) {
        return { revision: currentRevision, savedAt: new Date().toISOString(), shared: true }
      }

      const nextRevision = Math.max(input.drawing.revision, currentRevision + 1)
      const candidate: Drawing = { ...input.drawing, revision: nextRevision }
      const candidateHash = hashDrawing(candidate)
      const revisionKey = `${input.drawing.id}-r${String(nextRevision).padStart(3, "0")}`
      const existing = await listRows(
        tables.revisions(),
        [field("hash")],
        `${field("name")} eq '${escapeOData(revisionKey)}'`,
      )
      if (existing.length > 0 && stringValue(existing[0], field("hash")) !== candidateHash) {
        throw new Error(`Rev.${nextRevision} は別の内容で既に存在します。再読込してください。`)
      }

      if (existing.length === 0) {
        await createRow(tables.revisions(), {
          [`${PUBLISHER_PREFIX}_drawingrevisionid`]: crypto.randomUUID(),
          [field("name")]: revisionKey,
          [field("revision")]: nextRevision,
          [field("json")]: JSON.stringify(candidate),
          [field("hash")]: candidateHash,
          [field("note")]: input.note,
          [`${field("drawingid")}@odata.bind`]: `/${tables.drawings()}(${drawingId})`,
        })
      }

      const etag = stringValue(drawingRow, "@odata.etag") || "*"
      await updateRow(tables.drawings(), drawingId, etag, {
        [field("currentrevision")]: nextRevision,
        [field("currenthash")]: candidateHash,
      })
      return { revision: nextRevision, savedAt: new Date().toISOString(), shared: true }
    },
  }
}

export function createDrawingRepository(): DrawingRepository {
  return FEATURE_DRAWING_STORAGE ? createDataverseRepository() : createLocalRepository()
}

const OPERATION_VALUES: Record<TurnRequest["operation"], number> = {
  "review-drawing": 100000000,
  "propose-dimension-change": 100000001,
  "explain-drawing": 100000002,
}

const REQUEST_STATUSES: Record<number, TurnStatus> = {
  100000000: "pending",
  100000001: "running",
  100000002: "completed",
  100000003: "failed",
}

function receiptFromRow(row: DataverseRow, scope: TurnScope): TurnReceipt {
  return {
    ...scope,
    status: REQUEST_STATUSES[numberValue(row, field("status"))] ?? "pending",
    workerKind: "dataverse",
    acceptedAt: stringValue(row, "createdon") || new Date().toISOString(),
    updatedAt: stringValue(row, "modifiedon") || new Date().toISOString(),
  }
}

function resultFromRow(row: DataverseRow): TurnResult {
  const raw = stringValue(row, field("resultjson"))
  let payload: Partial<TurnResult> = {}
  if (raw) {
    try {
      payload = JSON.parse(raw) as Partial<TurnResult>
    } catch {
      throw new Error("ワーカー結果が有効な JSON ではありません。")
    }
  }
  const status = numberValue(row, field("status")) === 100000000 ? "completed" : "failed"
  return {
    conversationId: stringValue(row, field("conversationid")),
    turnId: stringValue(row, field("turnid")),
    version: numberValue(row, field("version")),
    baseHash: stringValue(row, field("basehash")),
    status,
    workerKind: "dataverse",
    summary: typeof payload.summary === "string" ? payload.summary : "",
    candidateJson: typeof payload.candidateJson === "string" ? payload.candidateJson : null,
    error: stringValue(row, field("error")) || (typeof payload.error === "string" ? payload.error : null),
    completedAt: stringValue(row, field("completedon")) || stringValue(row, "modifiedon") || new Date().toISOString(),
  }
}

function createDataverseTransport(resolveDrawing: () => Drawing): ConversationTransport {
  return {
    kind: "dataverse",
    label: "Drawing Review Agent（Dataverse 非同期）",
    caution: "AI の出力は未審査候補です。差分を確認してから採用してください。",
    async submit(request): Promise<TurnReceipt> {
      const baseline = resolveDrawing()
      if (hashDrawing(baseline) !== request.baseHash) throw new Error("送信前に図面が変更されました。再実行してください。")
      const inputJson = JSON.stringify({
        conversationId: request.conversationId,
        turnId: request.turnId,
        version: request.version,
        baseHash: request.baseHash,
        operation: request.operation,
        basis: JSON.stringify(baseline),
        selection: request.selection ?? "",
        prompt: request.prompt,
      })
      await createRow(tables.requests(), {
        [`${PUBLISHER_PREFIX}_drawingrequestid`]: crypto.randomUUID(),
        [field("name")]: request.turnId,
        [field("conversationid")]: request.conversationId,
        [field("turnid")]: request.turnId,
        [field("version")]: request.version,
        [field("basehash")]: request.baseHash,
        [field("operation")]: OPERATION_VALUES[request.operation],
        [field("inputjson")]: inputJson,
        [field("status")]: 100000000,
        [field("receipt")]: request.turnId,
      })
      const rows = await listRows(
        tables.requests(),
        [field("conversationid"), field("turnid"), field("version"), field("basehash"), field("status"), "createdon", "modifiedon"],
        `${field("turnid")} eq '${escapeOData(request.turnId)}'`,
      )
      if (rows.length !== 1) throw new Error("要求の受付を一意に確認できません。再送せず実行履歴を確認してください。")
      return receiptFromRow(rows[0], request)
    },
    async poll(scope): Promise<TransportPoll> {
      const filter = `${field("turnid")} eq '${escapeOData(scope.turnId)}'`
      const resultRows = await listRows(
        tables.results(),
        [field("conversationid"), field("turnid"), field("version"), field("basehash"), field("status"), field("resultjson"), field("error"), field("completedon"), "modifiedon"],
        filter,
      )
      if (resultRows.length > 1) throw new Error("同じターンの結果が重複しています。")
      if (resultRows.length === 1) {
        const statusValue = numberValue(resultRows[0], field("status"))
        if (statusValue !== 100000000 && statusValue !== 100000001) {
          const requestRows = await listRows(
            tables.requests(),
            [field("status"), "createdon", "modifiedon"],
            filter,
          )
          if (requestRows.length !== 1) throw new Error("実行中の要求を参照できません。")
          return { receipt: receiptFromRow(requestRows[0], scope), result: null }
        }
        const result = resultFromRow(resultRows[0])
        return {
          receipt: { ...scope, status: result.status, workerKind: "dataverse", acceptedAt: result.completedAt, updatedAt: result.completedAt },
          result,
        }
      }

      const requestRows = await listRows(
        tables.requests(),
        [field("status"), "createdon", "modifiedon"],
        filter,
      )
      if (requestRows.length !== 1) throw new Error("受付済み要求を参照できません。")
      return { receipt: receiptFromRow(requestRows[0], scope), result: null }
    },
    stopLocalWait: () => undefined,
  }
}

/**
 * 会話ワーカー。
 * 未接続時は DEMO ワーカー（ローカル寸法規則）を返す。AI エージェントの応答ではない。
 */
export function createConversationTransport(resolveDrawing: () => Drawing): ConversationTransport {
  if (!FEATURE_DRAWING_CONVERSATION) return createDemoTransport({ resolveDrawing })
  return createDataverseTransport(resolveDrawing)
}

import { MicrosoftDataverseService } from "./services"
import { createLogger } from "@/lib/debug-log"
import { DATAVERSE_URL, ENTITY, col } from "./config"
import type { Corpus, IrDoc, QaDoc } from "./types"

const log = createLogger("corpus")

type Row = Record<string, unknown>

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

const str = (row: Row, name: string) => (typeof row[name] === "string" ? (row[name] as string) : "")
const lines = (value: string) => value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean)
const list = (value: string) => value.split(/[,、\s]+/).map((v) => v.trim()).filter(Boolean)

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} が ${ms / 1000} 秒以内に応答しません`)), ms)
    promise.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      },
    )
  })
}

export async function listAll(entity: string, select: string[], orderby?: string, filter?: string): Promise<Row[]> {
  const result = await withTimeout(
    MicrosoftDataverseService.ListRecordsWithOrganization(
      DATAVERSE_URL,
      entity,
      undefined,
      "application/json",
      undefined,
      undefined,
      select.join(","),
      filter,
      orderby,
      undefined,
      undefined,
      500,
    ),
    20000,
    `${entity} の取得`,
  )
  if (!result.success) throw new Error(`${entity} の取得に失敗しました: ${errorText(result.error)}`)
  return (result.data as { value?: Row[] } | undefined)?.value ?? []
}

export function toQa(row: Row): QaDoc {
  return {
    id: str(row, col("name")),
    category: str(row, col("category")),
    question: str(row, col("question")),
    questionVariants: lines(str(row, col("variants"))),
    keywords: list(str(row, col("keywords"))),
    answer: str(row, col("answer")),
    answerPoints: lines(str(row, col("answerpoints"))),
    responder: str(row, col("responder")),
    sourceIds: list(str(row, col("sourceids"))),
    cautions: lines(str(row, col("cautions"))),
    status: str(row, col("status")),
    createdVia: str(row, col("createdvia")),
  }
}

/** 質疑応答の検索に使ってよい想定問答（承認済み。状態が空の既存データを含む） */
export const isApproved = (q: QaDoc) => !q.status || q.status === "承認済み"

export function toIr(row: Row): IrDoc {
  return {
    id: str(row, col("name")),
    docTitle: str(row, col("doctitle")),
    docType: str(row, col("doctype")),
    section: str(row, col("section")),
    page: typeof row[col("page")] === "number" ? (row[col("page")] as number) : 0,
    text: str(row, col("text")),
  }
}

export type CorpusSource = "dataverse" | "local-demo"

/** 想定問答と IR 抜粋を Dataverse から読み込む（ローカル開発時だけ同梱のデモデータに切り替える） */
export async function loadCorpus(): Promise<{ corpus: Corpus; source: CorpusSource; ms: number; qaRowIds: Map<string, string> }> {
  const t0 = performance.now()
  try {
    if (import.meta.env.VITE_DEV_LOCAL_CORPUS === "1") throw new Error("テスト用ビルドのため同梱データを使います")
    const [qaRows, irRows] = await Promise.all([
      listAll(ENTITY.qa, [`${ENTITY.qa.slice(0, -1)}id`, ...["name", "category", "question", "variants", "keywords", "answer", "answerpoints", "responder", "sourceids", "cautions", "status", "createdvia"].map(col)], col("name")),
      listAll(ENTITY.ir, ["name", "doctitle", "doctype", "section", "page", "text"].map(col), col("name")),
    ])
    if (!qaRows.length) throw new Error("想定問答が 0 件です")
    const qaRowIds = new Map(qaRows.map((row) => [str(row, col("name")), str(row, `${ENTITY.qa.slice(0, -1)}id`)]))
    const corpus = { qa: qaRows.map(toQa), ir: irRows.map(toIr), keyFigures: [] }
    const ms = Math.round(performance.now() - t0)
    log.info("想定問答と IR 抜粋を読み込みました", { qa: corpus.qa.length, ir: corpus.ir.length, ms })
    return { corpus, source: "dataverse", ms, qaRowIds }
  } catch (error) {
    // ローカル開発と、ホスト再現テスト用のビルド（VITE_DEV_LOCAL_CORPUS=1）だけ同梱データに切り替える
    if (!import.meta.env.DEV && import.meta.env.VITE_DEV_LOCAL_CORPUS !== "1") throw error
    log.warn("Dataverse に接続できないため、同梱のデモデータで動かします（ローカル開発のみ）", errorText(error))
    const [qa, ir, company] = await Promise.all([
      import("../../../data/demo/qa-master.json"),
      import("../../../data/demo/ir-documents.json"),
      import("../../../data/demo/company.json"),
    ])
    const corpus = { qa: qa.default as QaDoc[], ir: ir.default as IrDoc[], keyFigures: company.default.keyFigures }
    return { corpus, source: "local-demo", ms: Math.round(performance.now() - t0), qaRowIds: new Map() }
  }
}

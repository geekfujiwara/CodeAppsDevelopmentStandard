/**
 * 会話トランスポート境界。
 *
 * 画面はこのインターフェイスだけに依存する。Dataverse の要求 / 結果テーブルへ差し替えるときは、
 * `pa app add data-source` で生成されたサービスを包む実装をここへ注入する。
 * 画面コードは変更しない。
 */
import type { TurnReceipt, TurnRequest, TurnResult, TurnScope, WorkerKind } from "./conversation-contract.ts"

export type TransportPoll = {
  receipt: TurnReceipt
  /** 終端に達していなければ null。 */
  result: TurnResult | null
}

export interface ConversationTransport {
  readonly kind: WorkerKind
  /** UI に必ず表示する名称。実エージェントかどうかを利用者が判別できるようにする。 */
  readonly label: string
  /** UI に必ず表示する注意書き。 */
  readonly caution: string
  submit(request: TurnRequest): Promise<TurnReceipt>
  poll(scope: TurnScope): Promise<TransportPoll>
  /** ローカルの待機だけを止める。リモート実行の取り消しではない。 */
  stopLocalWait(scope: TurnScope): void
}

export class TransportNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TransportNotConfiguredError"
  }
}

/**
 * Dataverse の要求 / 結果ワーカーが未構成のときに使う実装。
 * 成功を装わず、必ず失敗する。
 */
export function createNotConfiguredTransport(reason: string): ConversationTransport {
  const fail = () => {
    throw new TransportNotConfiguredError(reason)
  }
  return {
    kind: "dataverse",
    label: "Dataverse ワーカー（未構成）",
    caution: reason,
    submit: async () => fail(),
    poll: async () => fail(),
    stopLocalWait: () => undefined,
  }
}

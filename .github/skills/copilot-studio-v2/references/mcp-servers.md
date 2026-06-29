# MCP サーバーを API で追加する（接続参照・operationId・公開後の確認）

cliagent エージェントに MCP サーバー（Dataverse MCP / Work IQ など）を **Dataverse Web API だけ**で
追加するための実機検証済みリファレンス。スクリプトは
[scripts/add_mcp_server.py](../scripts/add_mcp_server.py)。

> 実機での確証: 手動 UI で MCP サーバーを追加したエージェントと、API で追加したエージェントの
> Dataverse レコードを比較したところ **差分が無かった**。つまり下記の API 手順が
> 「Dataverse 側の完全な必要要件」である。

## MCP ツールの実体（botcomponent type=9）

`data` 列に以下のプレーンテキスト（CRLF 区切り）を格納する。

```
kind: McpTool
connectorId: /providers/Microsoft.PowerApps/apis/{connector}
authMode: Invoker
connectionReference: {接続参照の論理名}
operationId: {MCP operation}
```

- `name` ＝ `"{表示名} — {表示名}"`（UI 形式）
- `schemaname` ＝ `"{botschema}.tool.{Ascii表示名}-{Ascii表示名}_{乱数3}"`
- 親バインド ＝ `parentbotid@odata.bind` → `/bots({botid})`

## 既知コネクタと operationId

`operationId` はコネクタ Swagger の `x-ms-agentic-protocol: mcp-streamable-1.0` を持つ POST 操作。
`scripts/add_mcp_server.py` は Swagger から自動検出し、取得不可時は下表へフォールバックする。

| MCP サーバー | connector | operationId | 表示名（例） |
|---|---|---|---|
| Microsoft Dataverse MCP | `shared_commondataserviceforapps` | `InvokeMCP` | Microsoft Dataverse MCP サーバー |
| Work IQ OneDrive (Preview) | `shared_workiqonedrive` | `mcp_OneDriveRemoteServer` | Work IQ OneDrive (Preview) |

> 別 MCP コネクタを足す場合は `--operation` で明示するか、Swagger 自動検出に任せる。

## 接続参照（connectionReference）の論理名規約 ★最重要

```
{botschema}.cr.{connector}.{接続GUID}
```

- **コネクタ名は「フル」**（`shared_commondataserviceforapps` をそのまま）。
  20 文字などに切詰めると、公開時の検証がフル名で接続参照を探すため
  **「1 missing connection reference」で公開失敗**する。
- **接続 GUID** は接続名末尾の GUID。ハイフン有無は接続名に合わせる
  （UI 作成の接続はハイフン無し GUID のことがある。例: Work IQ）。
- 100 文字を超える場合のみコネクタ名末尾を切詰める（UI 互換フォールバック）。
- `connectionreferences.connectionid` には **接続のフル名**（`shared-...-{guid}`）を入れる。

## 接続の事前承認（API 不可）

接続（connection）自体は API で作成できない。対象コネクタの **Connected な接続が環境に
存在している必要がある**。無ければ make.powerautomate.com で一度作成・承認する。
`scripts/add_mcp_server.py` は環境内の Connected 接続を自動検出し、無ければ中断する。

## 公開後の「確認(Confirm)」は正常系の一部 ★

API で MCP ツール＋接続参照を作成し公開しても、初回は Copilot Studio UI 上で
**MCP サーバーの「確認(Confirm)」操作が一度必要**になる場合がある。

- これは Dataverse レコードを変更しない（Confirm 前後でレコード差分なし）。
  オーサリング/ランタイム **セッション側で接続を再バインドする**動作。
- **再公開だけではエラーが消えないことがある**。その場合は UI で
  「設定 > ツール（または MCP サーバー）> 対象サーバー > 確認(Confirm)」を実行する。
- したがって、自動デプロイの最後に「UI で一度 Confirm する」手順を**正常系として組み込む**。

### 手順（UI・最終確認）

1. Copilot Studio でエージェントを開く。
2. ツール / MCP サーバー一覧で対象サーバーを開く。
3. 接続が選択されていることを確認し、**確認(Confirm)** を押す。
4. 必要なら再公開する（`scripts/publish_agent.py` または UI の「公開」）。

> 自動化メモ: この UI 操作は Playwright MCP（`browser_navigate` / `browser_click`）で
> 自動化できる。対象は対象サーバー詳細パネルの「確認 / Confirm」ボタン。

## 「確認(Confirm)」が失敗する場合の対処（削除→再登録）★

**新しい Copilot Studio UI** では、MCP サーバーの「確認(Confirm)」を押しても
接続が完了しない（エラーが消えない）ケースがある。

### 原因

UI の Confirm 操作はセッション側の接続バインドを更新するが、
接続参照と McpTool レコードが古い状態のまま残っている場合に
バインドが完了しないことがある。

### 対処：MCP サーバーを削除→再登録する

`add_mcp_server.py` は**冪等設計**（実行のたびに既存 McpTool を削除して再作成）のため、
再実行するだけで「削除→再登録」と同等の効果が得られる。

```bash
# Dataverse MCP の場合
python add_mcp_server.py --connector shared_commondataserviceforapps \
    --display "Microsoft Dataverse MCP サーバー"

# Work IQ OneDrive の場合
python add_mcp_server.py --connector shared_workiqonedrive \
    --display "Work IQ OneDrive (Preview)"

# 再登録後は再公開が必要
python publish_agent.py
```

再登録後に Copilot Studio UI を開き直し、MCP サーバーが正常に表示されることを確認する。
その後、UI で改めて「確認(Confirm)」を押すと接続が完了する。

### PAC CLI による対応について（調査結果）

`pac copilot` コマンドには MCP サーバーを追加・管理する専用サブコマンドは**存在しない**。
調査した主なコマンド群:

| コマンド | 用途 | MCP 追加 |
|---|---|---|
| `pac copilot list` | エージェント一覧 | ✗ |
| `pac copilot create` | エージェント作成（YAML テンプレート） | ✗ |
| `pac copilot publish` | エージェント公開 | ✗ |
| `pac copilot clone` / `push` / `pull` | ワークスペース操作 | ✗ |
| `pac copilot status` | デプロイ状態確認 | ✗ |

**結論**: MCP サーバーの追加・再登録は引き続き **Dataverse Web API**（`add_mcp_server.py`）で
行う必要がある。PAC CLI での代替手段は現時点（2025 年）では提供されていない。

## 既知エラーと対処

| 症状 | 原因 | 対処 |
|---|---|---|
| 公開時 `1 missing connection reference` | 接続参照の論理名でコネクタ名を切詰めた | コネクタ名は**フル**で `{botschema}.cr.{connector}.{guid}` |
| 実行時に MCP が反応しない / 認可エラー | 公開後の Confirm 未実施、または接続未承認 | UI で **Confirm** ＋ 接続の承認を確認 |
| **UI の Confirm を押しても接続できない** | 接続参照バインドが古い状態で残っている | `add_mcp_server.py` を再実行（削除→再登録）→ 再公開 → UI で再 Confirm |
| `Connected な接続がありません` | 環境に該当コネクタの接続が無い | make.powerautomate.com で接続を作成/承認 |
| `operationId を検出できません` | Swagger 取得不可かつ既知表に無い | `--operation` で明示指定 |

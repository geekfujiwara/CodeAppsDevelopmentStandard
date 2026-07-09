# MCP サーバーを追加する（Copilot Studio UI・手動作業）

cliagent エージェントへの MCP サーバー（Dataverse MCP / Work IQ など）のツール追加は、
**Copilot Studio UI で手動**に行う。以前は Dataverse Web API（botcomponent type=9 の
McpTool + 接続参照）で自動追加する手順を提供していたが、接続参照の命名規約・公開後の
「確認(Confirm)」操作など UI 側の内部状態に依存する挙動が多く、API 経由の自動化は
事故りやすい。そのため本スキルでは MCP ツール追加をスクリプト化せず、以下の手動手順を
正常系とする。

## 前提

- 対象コネクタ（例: Microsoft Dataverse、Work IQ OneDrive）の **Connected な接続**が
  環境に存在していること。無ければ make.powerautomate.com で一度作成・承認する。
- エージェント（cliagent）が `scripts/create_agent.py` 等で作成済みであること。

## 手順（UI）

1. Copilot Studio でエージェントを開く。
2. **ツール**（または「MCP サーバー」）メニューから **追加** を選択する。
3. 追加する MCP サーバー（例: Microsoft Dataverse MCP サーバー、Work IQ OneDrive）を選択する。
4. 接続が未作成の場合は、画面の案内に従って接続を作成・サインインする。
5. 追加後、対象サーバーを開き、接続が選択されていることを確認して **確認(Confirm)** を押す。
   - これは Dataverse レコードを変更しない（Confirm 前後でレコード差分なし）。
     オーサリング/ランタイム **セッション側で接続を再バインドする**動作。
6. 再公開する（`scripts/publish_agent.py` または UI の「公開」）。

> 自動化メモ: 上記のブラウザ操作は VS Code 統合ブラウザツール（`open_browser_page` / `click_element` /
> `read_page`）で自動化できる（Playwright MCP・Playwright 単体ブラウザのインストール・起動は行わない
> → [ブラウザ自動化方針](../../standard/references/browser-automation.md)）。対象は「ツール > 追加」
> メニューと対象サーバー詳細パネルの「確認 / Confirm」ボタン。API での代替（botcomponent 直接作成）は行わない。

## 「確認(Confirm)」を押しても接続できない場合

新しい Copilot Studio UI では、MCP サーバーの「確認(Confirm)」を押しても接続が完了しない
（エラーが消えない）ケースがある。

- 対象の MCP サーバーを一度 UI から**削除**し、再度手順どおりに**追加し直す**。
- 再登録後は再公開が必要（`scripts/publish_agent.py` または UI の「公開」）。
- 再登録後に Copilot Studio UI を開き直し、MCP サーバーが正常に表示されることを確認する。
  その後、UI で改めて「確認(Confirm)」を押すと接続が完了する。

## PAC CLI による対応について（調査結果）

`pac copilot` コマンドには MCP サーバーを追加・管理する専用サブコマンドは**存在しない**。
調査した主なコマンド群:

| コマンド | 用途 | MCP 追加 |
|---|---|---|
| `pac copilot list` | エージェント一覧 | ✗ |
| `pac copilot create` | エージェント作成（YAML テンプレート） | ✗ |
| `pac copilot publish` | エージェント公開 | ✗ |
| `pac copilot clone` / `push` / `pull` | ワークスペース操作 | ✗ |
| `pac copilot status` | デプロイ状態確認 | ✗ |

**結論**: MCP サーバーの追加・再登録は **Copilot Studio UI での手動作業**として行う。
PAC CLI・Dataverse Web API のいずれにも自動化手段は提供しない。

## 既知エラーと対処

| 症状 | 原因 | 対処 |
|---|---|---|
| 公開時 `1 missing connection reference` | UI 追加後に接続参照が正しくバインドされていない | 対象 MCP サーバーを UI から削除→再追加→再公開 |
| 実行時に MCP が反応しない / 認可エラー | 追加後の Confirm 未実施、または接続未承認 | UI で **Confirm** ＋ 接続の承認を確認 |
| **UI の Confirm を押しても接続できない** | 接続参照バインドが古い状態で残っている | UI で対象 MCP サーバーを削除→再追加 → 再公開 → 再 Confirm |
| `Connected な接続がありません` | 環境に該当コネクタの接続が無い | make.powerautomate.com で接続を作成/承認 |

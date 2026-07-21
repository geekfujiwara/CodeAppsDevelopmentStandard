# Flow agent MCP SERVER — セットアップ詳細 & トラブルシュート（VS Code 版）

## 概要

FlowAgent MCP SERVER は `server/mcp.mjs`（自己完結型 ESM バンドル）で動作する
Node.js 18+ の MCP サーバー。VS Code の GitHub Copilot Chat（エージェントモード）から
Power Automate クラウドフローを自然言語で構築・編集・デバッグできる。

> ★ このプラグイン本体は元々 Claude Code / GitHub Copilot CLI 向けの `/plugin marketplace add`
> で配布されているが、**VS Code の GitHub Copilot Chat はそのコマンドも Claude 形式の
> `.mcp.json`（`mcpServers` キー）も解釈できない**。VS Code は独自に `.vscode/mcp.json`
> （`servers` キー + `type: "stdio"`）を読む MCP クライアントを持つため、本スキルは
> `microsoft/power-platform-skills` リポジトリの `plugins/power-automate` を git
> スパースチェックアウトで直接取得し、VS Code 形式で登録する。

このリポジトリの [`scripts/setup_flow_mcp.py`](../scripts/setup_flow_mcp.py) が
認証（`auth_helper`）・プラグイン取得（git）・`.vscode/mcp.json` 生成を一括で処理する。

## 前提条件

| 要件 | 確認コマンド |
|---|---|
| Node.js 18+ | `node --version` |
| git（プラグイン本体の取得に使用） | `git --version` |
| Python 3 + azure-identity + python-dotenv | `pip install -r .github/skills/standard/scripts/requirements.txt` |
| Azure CLI（MCP サーバーの認証） | `az --version` |
| VS Code + GitHub Copilot Chat（エージェントモード） | 拡張機能の有効化を確認 |

## セットアップ手順

### Step 1: .env を設定する

```env
DATAVERSE_URL=https://{org}.crm.dynamics.com/
SOLUTION_NAME={YourSolutionName}
# オプション: テナント ID（AZURE_TENANT_ID として MCP サーバーに渡される）
TENANT_ID={your-tenant-id}
# オプション: プラグインパスを固定する場合（省略時は git 自動取得）
FLOW_MCP_PLUGIN_ROOT=/path/to/plugin
```

### Step 2: セットアップスクリプトを実行する

```bash
python .github/skills/power-automate/scripts/setup_flow_mcp.py
```

スクリプトは次の処理を自動で行う:

1. Node.js 18+ を確認する
2. `az account list` で対象テナントの既存キャッシュを確認する
   - 既にキャッシュ済みなら `az account set` だけで切り替え（対話不要）
   - 無い場合のみ `az login --tenant {id}` の案内を表示（★ いきなりログインを迫らない）
3. `auth_helper` で Dataverse / Flow API トークンを取得・キャッシュする（Python スクリプト用）
   - `.env` に `PAC_AUTH_PROFILE` があれば PAC CLI 認証を優先
   - なければ DeviceCode 認証（テナントごとに初回のみブラウザ操作）
4. `microsoft/power-platform-skills` を `~/.power-platform-skills` に git スパースチェックアウト
   （既存なら `git pull` で最新化。マシン全体で共有）
5. `.vscode/mcp.json` を生成/更新する（既存の他 MCP エントリは保持）

### Step 3: Azure CLI を認証する（MCP サーバー用・auth_helper とは別物）

```bash
# まず既存キャッシュを確認（新規ログイン不要な場合が多い）
az account list -o table --all

# 対象テナントが既にあれば切り替えるだけ
az account set --subscription {subscription-id}

# 無い場合のみ、その回だけインタラクティブログイン
az login --tenant {tenant-id}
```

> `az login`（Azure CLI 自身の `~/.azure` キャッシュ）は MCP サーバー（Node.js）が使う。
> `auth_helper`（`~/.power-platform-cli/` の MSAL キャッシュ）は Python スクリプトが使う。
> **両者は完全に別の資格情報ストア**で、一方の認証が他方に引き継がれることはない。
> ただし `az login` は既存アカウントを上書きしないため、複数テナントを行き来しても
> `az account list` → `az account set` で対話なしに切り替えられる。

### Step 4: VS Code に認識させる

1. コマンドパレット → `MCP: List Servers` で `FlowAgent` が表示されるか確認（表示されない場合はウィンドウをリロード）
2. `FlowAgent` を Start
3. GitHub Copilot Chat（エージェントモード）で自然言語で指示する

```
「承認フローを作って。Dataverse の申請テーブルにレコードが作成されたら承認者にメール送信」
「先ほどのフローが失敗した原因を調べて」
「フローのメール本文を変更して」
```

## setup_flow_mcp.py オプション

```
python .github/skills/power-automate/scripts/setup_flow_mcp.py [オプション]

オプション:
  --plugin-root PATH   FlowAgent プラグインのルートパス（.env の FLOW_MCP_PLUGIN_ROOT より優先。省略時は git 自動取得）
  --output PATH        出力する mcp.json のパス（既定: .vscode/mcp.json）
  --dry-run            ファイルを書き込まずに内容だけ表示する
  --skip-auth          auth_helper 認証をスキップする（テスト用）
```

## 生成される .vscode/mcp.json の形式

```json
{
  "servers": {
    "FlowAgent": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/plugin/server/mcp.mjs"],
      "env": {
        "DATAVERSE_URL": "https://{org}.crm.dynamics.com/",
        "SOLUTION_NAME": "{YourSolutionName}",
        "AZURE_TENANT_ID": "{your-tenant-id}"
      }
    }
  }
}
```

> ★ Claude Code の `.mcp.json`（`mcpServers` キー）と VS Code の `.vscode/mcp.json`
> （`servers` キー + `type: "stdio"`）はスキーマが異なるので混同しない。

## 利用可能なスキル

| スキル | 説明 |
|---|---|
| `setup` | 初回前提チェック（接続・認証・環境確認） |
| `browse-flows` | 環境・フローをインタラクティブに閲覧 |
| `create-flow` | ガイド付き対話形式でフロー作成 |
| `build-flow` | 説明文からフローを自律生成・デプロイ・有効化 |
| `debug-flow` | 失敗ランのインタラクティブデバッグ |
| `diagnose-flow` | 失敗ランの自律深掘り診断 |
| `manage-flows` | 公開・テスト・バッチ・一覧管理 |
| `manage-desktop-flows` | デスクトップフロー（RPA）の一覧・実行 |
| `route-environments` | 環境の解決・ルーティング |

## よくあるトラブル

### セットアップスクリプトが `DATAVERSE_URL が未設定` で終了する

`.env` に `DATAVERSE_URL=https://{org}.crm.dynamics.com/` を設定する。

### `Node.js が見つかりません` エラー

Node.js 18+ をインストールする。`node --version` で確認。

### `FlowAgent プラグインが見つかりません` エラー

1. `git` と Node.js 18+ がインストールされているか確認する（`git --version` / `node --version`）
2. 手動で取得する場合:
   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/microsoft/power-platform-skills.git ~/.power-platform-skills
   cd ~/.power-platform-skills && git sparse-checkout set plugins/power-automate
   ```
3. 取得先のパスを確認し、`--plugin-root` または `.env` の `FLOW_MCP_PLUGIN_ROOT` で指定する。

### `Azure CLI が対象テナントで未認証` 警告

★ いきなり `az login` を実行する前に、まず対象テナントが az CLI に既にキャッシュされていないか確認する
（`az login` は既存アカウントを上書きしないため、複数テナントを行き来していれば既に存在することが多い）。

```bash
# まず既存キャッシュを確認（対話不要）
az account list -o table --all

# 対象テナントが見つかれば切り替えるだけでよい
az account set --subscription {subscription-id}

# 見つからない場合のみ、その回だけインタラクティブログインが必要
az login --tenant {tenant-id}
```

### auth_helper の DeviceCode 認証がテナントを往復するたびに求められる

`auth_helper.py` は `~/.power-platform-cli/auth_record_{TENANT_ID}.json` のように
**テナントごとにキャッシュファイルを分離**しているため、同一マシンで一度認証したテナントに
戻れば再認証は不要（★ 2026-07 修正済み）。もし毎回求められる場合は該当ファイルを削除して再認証する。

### `az login` と `auth_helper` の認証を混同しない

`az login`（`~/.azure`）と `auth_helper.py`（`~/.power-platform-cli/`）は完全に別の資格情報ストア。
片方で認証済みでももう片方には反映されない。MCP サーバー（Node.js）は `az login` を、
Python デプロイスクリプトは `auth_helper` を、それぞれ独立して必要とする。

### テナントを切り替えたのに FlowAgent が別テナントのデータを返す（★ 重要）

★ FlowAgent MCP は Python の `auth_helper.py` を直接呼び出せない（別プロセス・別言語）。
代わりに `az account get-access-token` に委譲するが、**取得したトークンをリソース単位で
プロセス内メモリにキャッシュ**しているため、`az account set` でテナントを切り替えても
**既に起動中のサーバープロセスは古いテナントのトークンを使い続ける**。

```powershell
# 1. az CLI のアクティブテナントを確認
az account show --query tenantId -o tsv

# 2. 対象と違えば切り替える（対話不要・既存キャッシュがあれば）
az account set --subscription <対象テナントの SubscriptionId>

# 3. ★ 必須: FlowAgent MCP サーバーを再起動する
#    コマンドパレット → MCP: List Servers → FlowAgent → Restart
```

テナントを切り替えるたびに再起動が必要、という前提で運用する（マルチテナントが例外ではなく前提）。

### MCP で作成したフローがソリューション外に入る

`manage-flows` スキルで `solutionUniqueName` を指定するか、以下で追加する。
**第 1 引数にフロー ID を直接渡す**（`--workflow-id` のようなオプション形式ではない。
付けると引数の文字列がそのまま OData フィルタに埋め込まれて 400 エラーになる）:

```bash
python .github/skills/power-automate/scripts/add_flow_to_solution.py <flow-id>
```

### ソリューション追加後に `CannotStartUnpublishedSolutionFlow` で有効化できない（★ 重要）

**症状**: `add_flow_to_solution.py` でフローをソリューションに追加した直後に `publish_flow`
（有効化）を呼ぶと、Dataverse の `PublishAllXml` / `PublishXml` を実行済みでも
以下のエラーが解消しない。

```text
Flow API 409 Conflict: CannotStartUnpublishedSolutionFlow
  "An unpublished solution flow cannot be activated. Please authenticate
   the flow connections and save the flow to enable activation."
```

**原因**: エラー文言は「ソリューション未発行」を示唆するが、実際の根本原因は
**フローが使う接続（Connection）のトークン失効**であることが多い（特に
`shared_office365` 等、90 日操作がないと `AADSTS700082` でリフレッシュトークンが
失効する接続）。Dataverse 側の `PublishAllXml`／`PublishXml` は必要条件だが
十分条件ではなく、Flow API 側が保持する内部状態（接続の有効性を含む）が
古いままだと 409 を返し続ける。

**診断・解決手順**:

```text
1. get_flow_context でフローが使う connectionReferenceLogicalNames を確認
2. Dataverse の connectionreferences テーブルから各 connectionid を取得
3. test_connection で各接続が Connected か確認
   → Error/Unauthorized なら pick_or_create_connection（mode: create-only）で
     新しい接続を作り直す
4. Dataverse の connectionreferences レコードを PATCH し、connectionid を
   新しい接続名に差し替える
5. resolve_refs で最新の connectionRefs（connectionName 込み）を再取得
6. preview_update → update_flow で definition + connectionRefs を「変更なしで
   再送」し、Flow API 側に保存し直させる（これが実質的な "save the flow" 操作）
7. 改めて publish_flow を呼ぶ → 成功
```

接続が全て Connected でも 409 が続く場合は、手順 6 の再送（"force save"）だけでも
解消することがある（Flow API 側のキャッシュ済み状態のリフレッシュ）。

### `edit_flow` ツールが `ctx.getClient(...).editFlow is not a function` で失敗する

**症状**: 既存フローへの小さな差分編集（`op: set/remove` 等）で `edit_flow` を呼ぶと
ツール自体が内部 TypeError で失敗する（プラグイン側のバグ、`dryRun: true` でも再現）。

**回避策**: `edit_flow` の代わりに `update_flow`（`preview_update` → `update_flow` の
二段階）を使い、`get_flow` で取得した完全な definition を必要な差分だけ変更して
まるごと再送する。ピンポイント編集ができない分手間は増えるが、確実に動作する。

### PowerApps 手動トリガー（`kind: "PowerApp"`）を `run_flow` で直接テストすると 401 になる

**症状**: 有効化に成功したフローを `run_flow` でテスト実行すると以下のエラーになる。

```text
Flow API 401 Unauthorized: DirectApiAuthorizationRequired
  "The authentication scheme is required. Please add authentication scheme and try again."
```

**原因**: トリガーの `kind` が `"PowerApp"`（Power Apps から呼ばれることを前提にした
Manual トリガー）の場合、Power Apps を経由しない直接 API 呼び出しでは認証スキームが
一致せず拒否される。これはバグではなく仕様。

**対処**: Power Automate ポータルの「テスト」機能、または連携する Power Apps /
Code Apps から実行してテストする。API 経由の自動テストが必須の場合は、トリガーの
`kind` を外す（プレーンな Manual/Request トリガーにする）設計に変更する必要があるが、
その場合 Power Apps 側のスキーマ連携（動的な入力フォーム生成）は失われる点に注意する。


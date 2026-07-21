# Flow agent MCP SERVER — セットアップ詳細 & トラブルシュート

## 概要

FlowAgent MCP SERVER は `server/mcp.mjs`（自己完結型 ESM バンドル）で動作する
Node.js 18+ の MCP サーバー。Claude Code / GitHub Copilot CLI から
Power Automate クラウドフローを自然言語で構築・編集・デバッグできる。

このリポジトリの [`scripts/setup_flow_mcp.py`](../scripts/setup_flow_mcp.py) が
認証（`auth_helper`）と `.mcp.json` 生成を一括で処理する。

## 前提条件

| 要件 | 確認コマンド |
|---|---|
| Node.js 18+ | `node --version` |
| Python 3 + azure-identity + python-dotenv | `pip install -r .github/skills/standard/scripts/requirements.txt` |
| Azure CLI（MCP サーバーの認証） | `az --version` |
| Claude Code または GitHub Copilot CLI | 各クライアントの起動確認 |

## セットアップ手順

### Step 1: .env を設定する

```env
DATAVERSE_URL=https://{org}.crm.dynamics.com/
SOLUTION_NAME={YourSolutionName}
# オプション: テナント ID（AZURE_TENANT_ID として MCP サーバーに渡される）
TENANT_ID={your-tenant-id}
# オプション: プラグインパスを固定する場合
FLOW_MCP_PLUGIN_ROOT=/path/to/plugin
```

### Step 2: プラグインをインストールする

Claude Code または Copilot CLI セッション内で以下を実行する。

```
/plugin marketplace add microsoft/power-platform-skills
/plugin install power-automate@power-platform-skills
```

### Step 3: セットアップスクリプトを実行する

```bash
python .github/skills/power-automate/scripts/setup_flow_mcp.py
```

スクリプトは次の処理を自動で行う:

1. Node.js 18+ を確認する
2. `az account show` で Azure CLI 認証状態を確認する（未認証なら警告）
3. `auth_helper` で Dataverse / Flow API トークンを取得・キャッシュする
   - `.env` に `PAC_AUTH_PROFILE` があれば PAC CLI 認証を優先
   - なければ DeviceCode 認証（初回のみブラウザ操作）
4. プラグインルートを自動探索する（失敗時は案内を表示）
5. `.mcp.json` を生成/更新する（既存の他 MCP エントリは保持）

### Step 4: Azure CLI を認証する（MCP サーバー用）

```bash
az login
# テナントを明示する場合
az login --tenant {tenant-id}
# ブラウザが使えない場合
az login --use-device-code
```

> `az login` は MCP サーバー（Node.js）が使う。
> `auth_helper` は Python スクリプトが使う。どちらも必要。

### Step 5: フロー開発を開始する

Claude Code / Copilot CLI を起動して自然言語で指示する。

```
「承認フローを作って。Dataverse の申請テーブルにレコードが作成されたら承認者にメール送信」
「先ほどのフローが失敗した原因を調べて」
「フローのメール本文を変更して」
```

## setup_flow_mcp.py オプション

```
python .github/skills/power-automate/scripts/setup_flow_mcp.py [オプション]

オプション:
  --plugin-root PATH   FlowAgent プラグインのルートパス（.env の FLOW_MCP_PLUGIN_ROOT より優先）
  --output PATH        出力する .mcp.json のパス（既定: .mcp.json）
  --dry-run            ファイルを書き込まずに内容だけ表示する
  --skip-auth          auth_helper 認証をスキップする（テスト用）
```

## 生成される .mcp.json の形式

```json
{
  "mcpServers": {
    "FlowAgent": {
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

### `FlowAgent プラグインが見つかりません` 警告

1. Claude Code / Copilot CLI セッションでプラグインをインストールする:
   ```
   /plugin marketplace add microsoft/power-platform-skills
   /plugin install power-automate@power-platform-skills
   ```
2. インストール先のパスを確認し、`--plugin-root` または `.env` の `FLOW_MCP_PLUGIN_ROOT` で指定する。

### `Azure CLI が未認証` 警告

```bash
az login
```

テナントが複数ある場合は `--tenant {tenant-id}` を追加する。

### auth_helper の DeviceCode 認証が毎回求められる

初回認証が完了していれば、2 回目以降は MSAL 永続キャッシュから自動リフレッシュされる。
毎回求められる場合は `~/.power-platform-cli/auth_record.json` を削除して再認証する。

### MCP で作成したフローがソリューション外に入る

`manage-flows` スキルで `solutionUniqueName` を指定するか、以下で追加する:

```bash
python .github/skills/power-automate/scripts/add_flow_to_solution.py --workflow-id <id>
```


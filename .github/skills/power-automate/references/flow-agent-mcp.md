# Flow agent MCP SERVER — セットアップ詳細 & トラブルシュート

## 概要

[microsoft/power-platform-skills — power-automate](https://github.com/microsoft/power-platform-skills/tree/main/plugins/power-automate) プラグインは、[FlowAgent](https://github.com/matow_microsoft/flow-agent) MCP SERVER の Claude Code / GitHub Copilot CLI 向けパッケージング。`server/mcp.mjs` に 50+ ツールが含まれる自己完結型 ESM バンドルが同梱されており、Node.js 18+ のみで動作する（`npm install` や外部ホスト不要）。

## 前提条件

| 要件 | 確認コマンド |
|---|---|
| Node.js 18+ | `node --version` |
| Azure CLI | `az --version` |
| Azure CLI 認証済み | `az account show` |
| Claude Code または GitHub Copilot CLI | 各クライアントの起動確認 |

## プラグインのインストール

```
/plugin marketplace add microsoft/power-platform-skills
/plugin install power-automate@power-platform-skills
```

インストール後、プロジェクトルートに `.mcp.json` が作成される。内容は以下の形式:

```json
{
  "mcpServers": {
    "power-automate": {
      "command": "node",
      "args": ["<PLUGIN_ROOT>/server/mcp.mjs"],
      "env": {}
    }
  }
}
```

> `.mcp.json` はプロジェクト固有設定のため `.gitignore` に追加推奨。

## ローカル開発（モノレポから直接起動）

FlowAgent モノレポをクローンしてビルドした場合は以下で起動できる:

```bash
git clone https://github.com/matow_microsoft/flow-agent
cd flow-agent
npm install && npm run build
# .mcp.json の args を以下に変更
# "args": ["<repo>/dist/mcp.js"]
```

## 利用可能なスキル一覧

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

## MCP ツール（主要）

FlowAgent は 50+ ツールを提供。代表的なもの:

| カテゴリ | ツール例 |
|---|---|
| フロー | list_flows, get_flow, create_flow, edit_flow, copy_flow, publish_flow, delete_flow |
| 実行 | get_run_history, get_run_details, cancel_run, resubmit_run, diagnose_run |
| 接続 | list_connections, create_connection, fix_connection, auto_discover_connections |
| 作成支援 | get_templates, batch_deploy, preflight_validate, expression_help |

## 認証フロー

```
az login → MSAL でトークン取得 → Flow API / PowerApps API / Graph API / Dataverse API へ自動ルーティング
```

Azure CLI のサービスプリンシパル認証（`az login --service-principal`）にも対応。

## よくあるトラブル

### MCP サーバーが起動しない

- Node.js バージョンを確認: `node --version` → 18+ が必要
- `.mcp.json` の `args` のパスが正しいか確認
- プラグインを再インストール: `/plugin install power-automate@power-platform-skills`

### az login が通らない

- テナントを明示: `az login --tenant <tenant-id>`
- 対話ブラウザが開けない環境: `az login --use-device-code`

### フローが対象環境に作成されない

- `route-environments` スキルで環境を明示的に指定する
- `DATAVERSE_URL` を MCP に渡すか、`setup` スキルで環境を選択する

### MCP で作成したフローがソリューション外に入る

- `manage-flows` スキルで `solutionUniqueName` を指定するか
- 作成後に `add_flow_to_solution.py` スクリプトでソリューションへ追加する:
  ```bash
  python .github/skills/power-automate/scripts/add_flow_to_solution.py --workflow-id <id>
  ```

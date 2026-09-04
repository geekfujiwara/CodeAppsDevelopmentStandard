---
name: mcp-server
description: "Copilot Studio から利用する自前 MCP Server を Azure Functions 上に構築する。JSON-RPC 2.0 の最小実装、受信 Entra ID JWT 検証 / 送信 Managed Identity のキーレス認証、Private Endpoint 下でのデータ投入、Entra アプリ登録のスコープ公開と事前承認、デプロイの実測検証までを非対話スクリプトで完結させる。"
category: architecture
triggers:
  - "MCP Server"
  - "MCP サーバー 自作"
  - "カスタム MCP"
  - "Copilot Studio に MCP を追加"
  - "Azure Functions で MCP"
  - "tools/list"
  - "tools/call"
  - "JSON-RPC エージェント"
  - "基幹データをエージェントに繋ぐ"
  - "AADSTS650057"
  - "func publish 失敗"
  - "Entra スコープ公開"
---

# MCP Server 開発スキル

Copilot Studio のエージェントから **社内の業務データ（DB・ファイル共有・業務 API）** を参照させるための
**自前 MCP Server** を Azure Functions 上に構築する。

> **役割分離**: VNet / Private Endpoint / Managed Identity といった **Azure 基盤の構成**は
> [azure スキル](../azure/SKILL.md) に委譲する。本スキルは **MCP プロトコル層・Entra 認可・データ投入・
> Copilot Studio 登録** を担当する。

## 設計原則

| 原則 | 内容 |
|---|---|
| **データ層は非公開、コンピュート層は公開** | SQL / Storage は Private Endpoint のみ。Function App の HTTP エンドポイントは公開する（Copilot Studio は SaaS からアウトバウンド接続するため、非公開にすると到達できない） |
| **キーレス** | 受信 = Entra ID Bearer JWT 検証、送信 = Managed Identity。関数キー・接続文字列・共有キーを使わない |
| **プロトコルは最小実装** | `initialize` / `tools/list` / `tools/call` の 3 メソッドのみ。SSE・セッション管理は実装しない |
| **成否はルート実測で判定** | デプロイの終了コードや ARM のメタデータを信用せず、HTTP プローブで実際のルートを確認する |
| **非対話で完走** | Azure 操作も `auth_helper` 経由（`az login` を手順に含めない）。→ [認証リファレンス](../standard/references/auth-patterns.md) |

## サブリファレンス

| リファレンス | 内容 |
|---|---|
| [MCP プロトコル最小実装](references/protocol.md) | JSON-RPC 2.0 の 3 メソッドとツール定義の書き方 |
| [認証モデル](references/auth-model.md) | 受信 JWT 検証 / 送信 Managed Identity の実装 |
| [Private 環境でのデータ投入](references/private-data-seeding.md) | Private Endpoint 下でシードするための管理エンドポイントパターン |
| [.env サンプル](references/.env.example) | 本スキルのパラメータ |
| [異常系・トラブルシュート](references/troubleshooting.md) | 実際に踏んだ失敗と恒久対策 |

---

## ワークフロー（正常系）

### Step 1: ツール定義を先に確定する

MCP は「エージェントがツール名と入力スキーマだけを見て呼ぶ」ため、**実装より先にツール定義を決める**。

1. 接続するデータソース（Azure SQL / Azure Files / 業務 API）を列挙する。
2. データソースごとに **1 つの MCP Server** を立てる（責務分割・障害分離のため）。
3. ツールは **「一覧」「検索」「取得」の 3 系統** を基本形にする。エージェントは一覧で語彙を得てから検索するため、
   `list_*` が無いと的外れな検索語で空振りする。
4. 各ツールの `name` / `description` / `inputSchema` を確定する。→ [protocol.md](references/protocol.md)

```
例: 部品DB MCP   -> list_categories / search_parts / get_part_inquiries / search_inquiries
例: 文書共有 MCP -> list_categories / list_documents / get_document / search_documents
```

### Step 2: Entra アプリ登録でスコープを公開し、クライアントを事前承認する

MCP Server を **保護対象 API** として登録する。ここを飛ばすと、後でトークン取得が `AADSTS650057` で失敗する。

```powershell
python .github/skills/mcp-server/scripts/configure_entra_api.py
```

このスクリプトは以下を行う。

1. `identifierUris` に `api://{app-id}` を設定する。
2. OAuth2 権限スコープ（既定 `MCP.Access`）を公開する。
3. パブリッククライアント（Azure CLI / Azure PowerShell）を **事前承認**し、同意画面なしでトークンを取得できるようにする。

> **重要**: スコープ公開と事前承認を **1 回の PATCH にまとめてはいけない**。
> 新規スコープ ID が未登録扱いになり `InvalidValue ... delegatedPermissionIds` で失敗する。
> スクリプトは 2 段階に分割して送信している。

### Step 3: Azure 基盤を構築する

[azure スキル](../azure/SKILL.md) の手順で以下を構築する。本スキル固有の要件のみ以下に示す。

| リソース | 本スキル固有の要件 |
|---|---|
| Function App | **Flex Consumption** + VNet 統合 + システム割り当て MI。HTTP は公開のまま |
| データストア | Private Endpoint のみ（`publicNetworkAccess=Disabled`・共有キー禁止） |
| RBAC | Function App の MI にデータ層への**データプレーン**ロールを付与 |
| ファイル共有 | 共有の作成は**マネジメントプレーン**で行う（データプレーンのロールでは共有を作成できない） |

### Step 4: MCP Server を実装する

Azure Functions（Node.js 20 / TypeScript / v4 プログラミングモデル）で実装する。

```
<server-name>/
├── local.settings.json        # ★ 必須（Step 5 参照）
├── host.json
├── package.json
├── src/
│   ├── functions/
│   │   ├── mcp.ts             # route: mcp        認可 + JSON-RPC ディスパッチ
│   │   └── adminSeed.ts       # route: seed-*     一時的なデータ投入用（Step 8 で削除）
│   ├── lib/
│   │   ├── auth.ts            # 受信 JWT 検証
│   │   └── <datasource>.ts    # 送信 Managed Identity アクセス
│   └── tools/
│       └── <domain>Tools.ts   # ツール定義 + ハンドラ
```

- ハンドラは `authLevel: 'anonymous'` にし、**認可はコード側の JWT 検証で行う**（関数キーを使わない）。
- 実装の詳細は [protocol.md](references/protocol.md) と [auth-model.md](references/auth-model.md) を参照。

### Step 5: デプロイする

```powershell
python .github/skills/mcp-server/scripts/deploy_mcp_function.py --project <path> --app <function-app-name>
```

このスクリプトは **デプロイ前チェック → ビルド → publish → ルート実測検証** を通しで行う。手作業で `func` を叩かない。

事前チェックの内容（いずれも実際に失敗した事象への恒久対策）:

| チェック | 理由 |
|---|---|
| `local.settings.json` の存在と `FUNCTIONS_WORKER_RUNTIME` | 無いと `Worker runtime cannot be 'None'` で publish が失敗する。このファイルは `.gitignore` 対象のため clone 直後は存在しない |
| `func` コマンドの実行可否 | npm グローバルインストールで zip が未展開のまま残ることがある。失敗時は自動で展開して復旧する |
| ビルド出力（`dist/`）の存在 | 空パッケージのままデプロイされ、ルートが 404 になるのを防ぐ |
| publish 後のルート実測 | `func publish` は成功しても終了コード 1 と "appears to be unhealthy" を返すことがある。**終了コードで判定しない** |

### Step 6: データを投入する

データ層が Private Endpoint 内にあるため、**ローカル PC からは接続できない**。
VNet 統合された Function App 内の一時的な管理エンドポイント経由で投入する。

```powershell
python .github/skills/mcp-server/scripts/seed_mcp_data.py
```

- 管理エンドポイントは **共有シークレット（`ADMIN_SEED_SECRET`）** で保護し、アプリ設定に置く。
- DB のスキーマ作成・MI へのロール付与は Entra 管理者権限が要るため、**実行者のアクセストークンを渡して**実行する。
- 詳細は [private-data-seeding.md](references/private-data-seeding.md)。

### Step 7: エンドツーエンドで検証する

```powershell
python .github/skills/mcp-server/scripts/verify_mcp_server.py
```

`api://{app-id}/.default` のトークンを取得し、`tools/list` でツール一覧、`tools/call` で**実データ**が返ることを確認する。
ツール一覧が返るだけでは不十分で、**必ず 1 つ以上のツールを実行して中身を見る**。

### Step 8: 管理エンドポイントを削除して Copilot Studio に登録する

1. 投入用の管理エンドポイントを削除して再デプロイする（攻撃面を残さない）。

   ```powershell
   python .github/skills/mcp-server/scripts/cleanup_admin_endpoints.py --project <path> --app <function-app-name> --confirm
   ```

2. アプリ設定から `ADMIN_SEED_SECRET` を削除する。
3. [copilot-studio-v2 スキル](../copilot-studio-v2/SKILL.md) の手順で、エージェントに MCP サーバーをツールとして追加する。
   複数の MCP Server を 1 エージェントに束ねる場合は、エージェントの指示文に
   **「どの質問でどのサーバーを使うか」** を明記しないと選択を誤る。

---

## 検証チェックリスト

- [ ] ツール定義に `list_*` 系があり、エージェントが語彙を獲得できる
- [ ] Entra アプリ登録でスコープを公開し、クライアントを事前承認した（Step 2）
- [ ] Function App の HTTP は公開、データ層は Private Endpoint のみ
- [ ] 関数キー・接続文字列・共有キーを一切使っていない
- [ ] `local.settings.json` が存在し `FUNCTIONS_WORKER_RUNTIME` が設定されている
- [ ] デプロイ成否を **終了コードではなくルートの HTTP 実測**で判定した
- [ ] `tools/call` で実データが返ることを確認した
- [ ] 管理エンドポイントを削除し、`ADMIN_SEED_SECRET` をアプリ設定から消した
- [ ] スクリプトが `auth_helper` 経由で非対話に完走する（`az login` を要求しない）

## 参考リンク

- [Azure リファレンスアーキテクチャ](../azure/SKILL.md)
- [共通認証（auth_helper / azure_helper）](../standard/references/auth-patterns.md)
- [Copilot Studio v2](../copilot-studio-v2/SKILL.md)
- [異常系・トラブルシュート](references/troubleshooting.md)

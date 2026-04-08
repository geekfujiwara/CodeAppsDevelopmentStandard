# Power Platform 包括開発標準

> **Power Platform** のコードファースト開発標準 — Code Apps・Dataverse・Copilot Studio を VS Code + GitHub Copilot で包括的に構築するための実践ガイド

[![VS Code で開く](https://img.shields.io/badge/VS%20Code%E3%81%A7%E9%96%8B%E3%81%8F-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://vscode.dev/github/geekfujiwara/CodeAppsDevelopmentStandard)
[![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-対応-blueviolet?style=for-the-badge&logo=github)](https://github.com/features/copilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)

> 📝 **本リポジトリは [ギークフジワラ](https://twitter.com/geekfujiwara) の実務経験・検証に基づき継続的に更新されています。** Power Apps Code Apps・Dataverse・Copilot Studio を組み合わせた開発の実践ノウハウと、過去の失敗から確立した再発防止策を反映しています。

---

## 🚀 30秒セットアップ

### 方法 1: リポジトリをクローン（推奨）

```bash
git clone https://github.com/geekfujiwara/CodeAppsDevelopmentStandard.git
cd CodeAppsDevelopmentStandard
code .
```

VS Code で開いた時点で、`.github/agents/` と `.github/skills/` が自動認識され、**PowerCodeAppsCopilot エージェント** が GitHub Copilot Chat のエージェント一覧に表示されます。

### 方法 2: 既存プロジェクトにプラグインとして追加

```powershell
# 既存プロジェクトのルートで実行（PowerShell）
$base = "https://raw.githubusercontent.com/geekfujiwara/CodeAppsDevelopmentStandard/main"
@(".github/agents", ".github/skills/power-platform-standard", "docs") | ForEach-Object { New-Item -ItemType Directory -Path $_ -Force }
@(
  @{Src="$base/.github/agents/PowerCodeAppsCopilot.agent.md"; Dst=".github/agents/PowerCodeAppsCopilot.agent.md"},
  @{Src="$base/.github/skills/power-platform-standard/SKILL.md"; Dst=".github/skills/power-platform-standard/SKILL.md"},
  @{Src="$base/docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md"; Dst="docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md"}
) | ForEach-Object { Invoke-WebRequest -Uri $_.Src -OutFile $_.Dst }
Write-Host "Power Platform 開発標準をインストールしました"
```

### 方法 3: bash / curl

```bash
base="https://raw.githubusercontent.com/geekfujiwara/CodeAppsDevelopmentStandard/main"
mkdir -p .github/agents .github/skills/power-platform-standard docs
curl -sL "$base/.github/agents/PowerCodeAppsCopilot.agent.md" -o .github/agents/PowerCodeAppsCopilot.agent.md
curl -sL "$base/.github/skills/power-platform-standard/SKILL.md" -o .github/skills/power-platform-standard/SKILL.md
curl -sL "$base/docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md" -o docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md
echo "Power Platform 開発標準をインストールしました"
```

---

## 🤖 GitHub Copilot での活用方法（推奨）

**推奨モデル: Claude Opus 4.6**

### カスタムエージェントモード

リポジトリをクローンまたはプラグインを追加すると、VS Code の GitHub Copilot Chat で **@PowerCodeAppsCopilot** エージェントが使えるようになります。

```
@PowerCodeAppsCopilot インシデント管理アプリを作成してください。
テーブル: Incident, IncidentCategory, Asset, Location
フィールド: タイトル, 説明, ステータス(新規/対応中/解決済), 優先度(緊急/高/中/低), 担当者(SystemUser Lookup)
```

エージェントは[開発標準](docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md)に従い、以下を自動で考慮します:
- 英語スキーマ名でテーブル設計（日本語は後工程でローカライズ）
- `createdby` システム列を報告者として活用（カスタム Lookup 不要）
- `systemuser` テーブルへの Lookup でユーザー参照
- 先にデプロイ → Dataverse 接続確立 → 開発の順序
- 生成オーケストレーション (Generative Orchestration) モードでエージェント構築

### スキルとして使う

チャットで `/power-platform-standard` と入力すると、開発標準に基づくガイダンスが得られます。

### URL を渡して使う（従来方式）

```
このリポジトリを参照して、IT資産管理アプリを作成してください。
https://github.com/geekfujiwara/CodeAppsDevelopmentStandard
```

> 💡 **ユーザーからの指示が曖昧な場合**: GitHub Copilot は不明点をユーザーに質問（Ask User Question）して確認しながら実装を進めます。要件を完全に明確にしてから実装することで、手戻りを防ぎ品質の高いアプリケーションを構築できます。

---

## 📋 目次

- [30秒セットアップ](#-30秒セットアップ)
- [GitHub Copilot での活用方法](#-github-copilot-での活用方法推奨)
- [設計原則（実務の失敗から学んだ教訓）](#-設計原則実務の失敗から学んだ教訓)
- [前提条件](#-前提条件)
- [Phase 0: 設計](#phase-0-設計)
- [Phase 1: Dataverse 構築](#phase-1-dataverse-構築)
- [Phase 2: Code Apps 開発](#phase-2-code-apps-開発)
- [Phase 3: Copilot Studio エージェント](#phase-3-copilot-studio-エージェント)
- [トラブルシューティング](#-トラブルシューティング)
- [詳細リファレンス](#-詳細リファレンス)
- [ライセンス](#-ライセンス)

---

## 🛡️ 設計原則（実務の失敗から学んだ教訓）

以下は実際の開発で発生した手戻りと失敗から確立された原則です。

| # | 原則 | やりがちなミス → 正しいアプローチ |
|---|---|---|
| 1 | **スキーマ名は英語のみ** | 日本語テーブル名 → `pac code add-data-source` が失敗する |
| 2 | **SystemUser を Lookup 先に** | カスタムユーザーテーブル → 不要で複雑化 |
| 3 | **作成者は createdby を利用** | カスタム ReportedBy Lookup → 作成→削除の手戻り発生 |
| 4 | **Choice 値は 100000000 始まり** | 0, 1, 2 で定義 → Dataverse で使用不可 |
| 5 | **先にデプロイ、後から開発** | ローカルで全部作り込み → Dataverse 接続で失敗 |
| 6 | **テーブル作成はリトライ付き** | リトライなしの連続作成 → 0x80040237 メタデータロック |
| 7 | **PUT + MetadataId でローカライズ** | PATCH/POST → 表示名が反映されない |
| 8 | **生成オーケストレーションモード** | トピックベース開発 → 全削除してgen-orch切替の手戻り |
| 9 | **ソリューション内で管理** | ソリューション外カスタマイズ → リリース管理不可 |

詳細は [Power Platform 包括開発標準](docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md) を参照。

---

## 🔧 前提条件

| 項目 | 詳細 |
|------|------|
| **Visual Studio Code** | [Power Platform Tools 拡張機能](https://marketplace.visualstudio.com/items?itemName=microsoft-IsvExpTools.powerplatform-vscode) をインストール |
| **Awesome Copilot プラグイン** | VS Code に **Code Apps** および **Dataverse** のプラグインをインストール（[詳細はこちら](https://www.geekfujiwara.com/tech/powerplatform/8082/)） |
| **GitHub Copilot** | VS Code に GitHub Copilot 拡張機能をインストール（推奨モデル: **Claude Opus 4.6**） |
| **Node.js** | LTS バージョン（v18.x または v20.x 推奨） |
| **Python 3.10+** | Dataverse 自動化スクリプト用（Copilot Studio エージェント作成等） |
| **Power Platform CLI (PAC CLI)** | 最新バージョン（`npm install -g @microsoft/power-apps-cli` または VS Code 拡張機能に同梱） |
| **Power Platform 環境** | Code Apps が有効化されていること（管理者設定が必要） |
| **ライセンス** | エンドユーザーに Power Apps Premium ライセンスが必要 |

> ⚡ **Awesome Copilot の Code Apps / Dataverse プラグイン**をインストールすることで、GitHub Copilot を通じて**会話形式で Dataverse テーブルの設計・作成・デプロイ**が可能になります。従来の Power Apps ポータル UI でのテーブル作成よりもこちらを優先してください。詳細な注意点は[こちらのブログ記事](https://www.geekfujiwara.com/tech/powerplatform/8082/)を参照してください。

---

## 開発フロー全体図

```
┌──────────────────────────────────────────────────────┐
│                  Phase 0: 設計                        │
│  ・ .env 設定（URL, テナント, ソリューション名）         │
│  ・ テーブル設計（英語スキーマ名 + Choice 値定義）       │
│  ・ systemuser/createdby 活用方針の決定                │
└──────────────────┬───────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────┐
│             Phase 1: Dataverse 構築                    │
│  1. ソリューション作成                                  │
│  2. テーブル作成（Phase順: マスタ → 主 → 従属）          │
│  3. Lookup リレーションシップ作成（リトライ付き）         │
│  4. 日本語ローカライズ（PUT + MetadataId）              │
│  5. デモデータ投入                                     │
│  6. テーブル検証                                       │
└──────────────────┬───────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────┐
│               Phase 2: Code Apps                      │
│  1. npx power-apps init                               │
│  2. npm run build && push（先にデプロイ！）             │
│  3. pac code add-data-source -a dataverse -t {table}  │
│  4. DataverseService + 型定義 + ページ実装             │
│  5. ビルド＆再デプロイ                                 │
└──────────────────┬───────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────┐
│            Phase 3: Copilot Studio                    │
│  1. Web API でエージェント作成                          │
│  2. カスタムトピック全削除                              │
│  3. 生成オーケストレーション有効化                       │
│  4. GPT Instructions 設定                              │
│  5. ★ ナレッジ追加（UI で手動）                        │
│  6. ★ MCP Server 追加（UI で手動）                     │
│  7. エージェント公開                                   │
└──────────────────────────────────────────────────────┘
```

---

## Phase 0: 設計

### .env ファイル設定

```bash
DATAVERSE_URL=https://{org}.crm.dynamics.com/
TENANT_ID={your-tenant-id}
MCP_CLIENT_ID={app-registration-client-id}
SOLUTION_NAME={solution-name}
PUBLISHER_PREFIX={prefix}
PAC_AUTH_PROFILE={profile-name}
```

### テーブル設計の鉄則

| ルール | 説明 |
|---|---|
| プレフィックス統一 | パブリッシャープレフィックスを全テーブル・列に統一 |
| 英語スキーマ名 | `geek_asset`（❌ `geek_設備`） |
| Lookup → systemuser | ユーザー参照は SystemUser テーブルへの Lookup |
| 作成者は createdby | 報告者・登録者のカスタム列は**作らない** |
| Choice 値は 100000000 始まり | `100000000=新規, 100000001=対応中` |

### テーブル作成順序

```
Phase 1: 参照先テーブル（マスタ系）
Phase 2: 主テーブル
Phase 3: 従属テーブル
Phase 4: Lookup リレーションシップ作成
```

---

## Phase 1: Dataverse 構築

### テーブル作成（GitHub Copilot 推奨）

Dataverse テーブルの作成は、**Awesome Copilot の Dataverse プラグイン**を使い、VS Code 上の GitHub Copilot で会話形式で行うことを **推奨** します。

```
# GitHub Copilot Agent モードで以下のように依頼
「以下の Dataverse テーブルを作成してください。
テーブル名: IT Asset（IT資産）
プレフィックス: cr_
フィールド:
- 資産名 (cr_name): テキスト, 必須
- シリアル番号 (cr_serialnumber): テキスト
- ステータス (cr_status): 選択肢 (100000000=稼働中, 100000001=修理中, 100000002=廃棄済み)
- 担当者 (cr_assignedto): Lookup → SystemUser」
```

> ⚠️ **注意点**（[検証結果の詳細はこちら](https://www.geekfujiwara.com/tech/powerplatform/8082/)）:
> - Awesome Copilot の Code Apps および Dataverse プラグインが VS Code にインストールされていることを確認
> - **スキーマ名は必ず英語**（日本語は `pac code add-data-source` で失敗する）
> - SystemUser 等の既存システムテーブルとの関係を理解した上で設計
> - AI が生成した設計は必ずレビューし、組織固有の要件に合っているか確認

### メタデータ競合エラー対策

テーブルやリレーションシップを連続作成すると、メタデータロック（`0x80040237`）が発生します。

```python
def retry_metadata(fn, description, max_attempts=5):
    """メタデータ操作をリトライする。ロック競合時は累進的に待機。"""
    for attempt in range(max_attempts):
        try:
            return fn()
        except Exception as e:
            err = str(e)
            if "already exists" in err.lower():
                return None  # スキップ
            if "0x80040237" in err or "another" in err.lower():
                time.sleep(10 * (attempt + 1))  # 10s → 20s → 30s
                continue
            raise
    return None
```

### 日本語ローカライズ

表示名の更新は **PUT メソッド + MetadataId** を使用（PATCH では反映されないケースがある）:

```python
# ❌ PATCH → 失敗するケースあり
# ✅ GET で MetadataId 取得 → PUT で更新
data = api_get(f"EntityDefinitions(LogicalName='{name}')?$select=MetadataId,...")
body = {
    "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
    "MetadataId": data["MetadataId"],
    "DisplayName": {"LocalizedLabels": [{"Label": "日本語名", "LanguageCode": 1041}]},
}
api_put(f"EntityDefinitions({data['MetadataId']})", body)  # MSCRM.MergeLabels: true ヘッダー必須
```

---

## Phase 2: Code Apps 開発

### クイックスタート

新規プロジェクトは **[CodeAppsStarter](https://github.com/geekfujiwara/CodeAppsStarter)** をベースにしてください。Tailwind CSS + shadcn/ui の標準デザインが組み込まれています。

```bash
# 1. プロジェクト初期化
npx power-apps init --display-name "アプリ名"
npm install

# 2. ★ 先にビルド＆デプロイ（Dataverse 接続確立のため）
npm run build
npx power-apps push --solution-id {SolutionName}

# 3. Dataverse コネクタ追加
pac code add-data-source -a dataverse -t {table_logical_name}

# 4. 開発 → ビルド → 再デプロイ
npm run dev       # ローカル開発
npm run build
npx power-apps push --solution-id {SolutionName}
```

> ⚠️ **手順 2 を先に行う**ことで、Power Platform 上にアプリが登録され、Dataverse への接続が有効になります。ローカル開発のみで進めると接続確立時に問題が発生します。

### 技術スタック

| レイヤー | 技術 |
|---|---|
| UI フレームワーク | React 18 + TypeScript |
| スタイリング | Tailwind CSS + shadcn/ui |
| データフェッチ | TanStack React Query |
| ルーティング | React Router |
| ビルドツール | Vite |

### DataverseService パターン

```typescript
// 基本 CRUD 操作
DataverseService.GetItems(table, query)     // OData クエリで一覧取得
DataverseService.GetItem(table, id, query)  // 単一レコード取得
DataverseService.PostItem(table, body)      // レコード作成
DataverseService.PatchItem(table, id, body) // レコード更新
DataverseService.DeleteItem(table, id)      // レコード削除

// Lookup フィールド（@odata.bind）
await DataverseService.PostItem("geek_incidents", {
  geek_name: "ネットワーク障害",
  "geek_assignedtoid@odata.bind": `/systemusers(${userId})`,
});

// $expand で関連データ取得（createdby = 報告者として利用）
const items = await DataverseService.GetItems("geek_incidents",
  "$select=geek_name&$expand=createdby($select=fullname)"
);
```

### PAC CLI コマンドリファレンス

```bash
# 認証
pac auth create --environment {environment-id}
pac env select --environment {environment-url}
pac auth list

# プロジェクト初期化
pac code init --displayName "App Name"

# コネクタ追加
pac connection list
pac code add-data-source -a {api-name} -c {connection-id}
pac code add-data-source -a dataverse -t {table-logical-name}

# デプロイ
npm run build
pac code push
```

### コネクタ一覧

| コネクタ | API 名 | 主な用途 |
|---------|--------|---------|
| Dataverse | `dataverse` | CRUD 操作（`-t` でテーブル指定） |
| SQL Server (Azure SQL) | `shared_sql` | CRUD 操作、ストアドプロシージャ |
| SharePoint | `shared_sharepointonline` | ドキュメントライブラリ |
| Office 365 Users | `shared_office365users` | ユーザープロフィール |
| Microsoft Teams | `shared_teams` | 通知 |
| OneDrive for Business | `shared_onedriveforbusiness` | ファイルストレージ |

### ベストプラクティス

- ✅ ローカル開発はポート 3000（Power Apps SDK の要件）
- ✅ `tsconfig.json` で `verbatimModuleSyntax: false`
- ✅ `vite.config.ts` で `base: "./"`
- ✅ PAC CLI 生成の TypeScript モデルとサービスを使用
- ✅ コネクタ操作にリトライ付きエラーハンドリング
- ✅ Tailwind CSS + shadcn/ui で一貫した UI

---

## Phase 3: Copilot Studio エージェント

### 開発方針

現状の Awesome Copilot の Copilot Studio スキルでは **エージェントの新規作成ができません**。以下の方針で開発します:

| ステップ | 方法 | 備考 |
|---|---|---|
| 1. エージェント作成 | **Dataverse Web API**（Python スクリプト） | スキルでは新規作成不可 |
| 2. カスタムトピック削除 | Web API で全削除 | トピックベース開発は非推奨 |
| 3. 生成オーケストレーション有効化 | `GenerativeActionsEnabled: true` | AI 認識モード |
| 4. Instructions 設定 | GPT コンポーネント（componenttype=15） | テーブルスキーマ・行動指針・条件分岐 |
| 5. ナレッジ追加 | **Copilot Studio UI で手動** | Dataverse テーブルを追加 |
| 6. ツール（MCP Server）追加 | **Copilot Studio UI で手動** | Dataverse コネクタを追加 |
| 7. エージェント公開 | `PvaPublish` アクション | |

### エージェント作成（Web API）

```python
# Bot レコード作成
bot_id = api_post("bots", {
    "name": "アシスタント名",
    "schemaname": f"{PREFIX}_assistantName",
    "language": 1041,            # Japanese
    "accesscontrolpolicy": 0,    # Any user
    "authenticationmode": 2,     # No auth
    "configuration": json.dumps({
        "$kind": "BotConfiguration",
        "publishOnImport": False,
    }),
}, solution=SOLUTION)
```

### 生成オーケストレーション設定

```python
config = {
    "$kind": "BotConfiguration",
    "settings": {"GenerativeActionsEnabled": True},
    "aISettings": {
        "$kind": "AISettings",
        "useModelKnowledge": True,
        "isSemanticSearchEnabled": True,
        "optInUseLatestModels": True,
    },
    "recognizer": {"$kind": "GenerativeAIRecognizer"},
}
api_patch(f"bots({bot_id})", {"configuration": json.dumps(config)})
```

### システムプロンプト設計テンプレート

```yaml
kind: GptComponentMetadata
instructions: |-
  あなたは「{エージェント名}」です。{役割の説明}。

  ## 利用可能なテーブル
  ### {prefix}_incident（インシデント）
  - {prefix}_name: タイトル
  - {prefix}_status: ステータス（100000000=新規, 100000001=対応中, ...）
  - Lookup: {prefix}_assignedtoid → systemuser

  ## 行動指針
  1. ユーザーの意図を正確に理解し、Dataverse 操作を実行
  2. レコード作成時は必須項目を確認してから実行
  3. 日本語で丁寧に応答
  4. ステータスの Choice 値は整数値で指定

  ## 条件分岐ルール
  ### データ照会 → ナレッジから検索
  ### 新規作成 → MCP Server でレコード作成
  ### 更新 → MCP Server で PATCH 操作

conversationStarters:
  - title: レコード検索
    text: "インシデント一覧を見せて"
  - title: 新規登録
    text: "新しいインシデントを起票したい"
```

### ナレッジ・ツールの手動追加

以下は **Copilot Studio の UI からユーザーが手動で追加** します:

1. **ナレッジ**: [Copilot Studio](https://copilotstudio.microsoft.com/) → エージェント → ナレッジ → Dataverse テーブルを追加
2. **ツール（MCP Server）**: ツール → コネクタ → Dataverse コネクタ → CRUD アクション有効化

---

## 🔍 トラブルシューティング

### 発生した問題と解決策一覧

| 問題 | 原因 | 解決策 |
|---|---|---|
| `pac code add-data-source` 失敗 | テーブル表示名が日本語 | スキーマ名を英語に統一 |
| `0x80040237` エラー | メタデータロック競合 | 累進的リトライ（10s→20s→30s） |
| ローカライズが反映されない | PATCH 使用 | PUT + MetadataId に変更 |
| デプロイ後に Dataverse 接続エラー | 初回デプロイ未実施 | 先にビルド＆プッシュ |
| エージェントが意図通り動かない | トピックベース設計 | 生成オーケストレーションに切替 |
| ReportedBy Lookup が不要だった | `createdby` で代替可能 | 列とリレーションシップを削除 |
| SDK 初期化エラー | 認証期限切れ | `pac auth create` で再認証 |
| ポート 3000 使用中 | 別プロセスが占有 | `taskkill /PID {pid} /F` |
| TypeScript ビルドエラー | `verbatimModuleSyntax` | `tsconfig.json` で `false` に設定 |

---

## 📚 詳細リファレンス

| ドキュメント | 内容 |
|-------------|------|
| **[docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md](./docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md)** | **包括開発標準（メイン）** — 設計原則・全 Phase 詳細・チェックリスト |
| [docs/DATAVERSE_GUIDE.md](./docs/DATAVERSE_GUIDE.md) | Dataverse 統合ガイド — CRUD・Lookup・Choice・システムフィールド |
| [docs/CONNECTOR_REFERENCE.md](./docs/CONNECTOR_REFERENCE.md) | コネクタ設定の詳細リファレンス |
| [docs/DESIGN_SYSTEM.md](./docs/DESIGN_SYSTEM.md) | デザインシステムガイド（Tailwind CSS + shadcn/ui） |
| [docs/ADVANCED_PATTERNS.md](./docs/ADVANCED_PATTERNS.md) | 高度な実装パターン |

### 公式ドキュメント

- [Power Apps Code Apps 公式ドキュメント](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/)
- [Copilot Studio 公式ドキュメント](https://learn.microsoft.com/ja-jp/microsoft-copilot-studio/)
- [Dataverse Web API リファレンス](https://learn.microsoft.com/ja-jp/power-apps/developer/data-platform/webapi/overview)
- [Power Platform CLI ドキュメント](https://learn.microsoft.com/ja-jp/power-platform/developer/cli/introduction)

### Awesome Copilot / Dataverse プラグイン

- [VS Code 拡張機能のスキルを用いて GitHub Copilot から Power Platform を開発する（注意点・検証結果）](https://www.geekfujiwara.com/tech/powerplatform/8082/)

### 関連リポジトリ

- **[CodeAppsStarter（標準デザインテンプレート）](https://github.com/geekfujiwara/CodeAppsStarter)** — 新規開発の起点。Tailwind CSS + shadcn/ui を採用した標準デザインテンプレート

---

## 📁 リポジトリ構造

```
.
├── .github/
│   ├── agents/
│   │   └── PowerCodeAppsCopilot.agent.md    # GitHub Copilot カスタムエージェント
│   └── skills/
│       └── power-platform-standard/
│           └── SKILL.md                      # 開発標準スキル（/power-platform-standard）
├── docs/
│   ├── POWER_PLATFORM_DEVELOPMENT_STANDARD.md  # 包括開発標準（メイン）
│   ├── DATAVERSE_GUIDE.md                      # Dataverse 統合ガイド
│   ├── CONNECTOR_REFERENCE.md                  # コネクタリファレンス
│   ├── DESIGN_SYSTEM.md                        # デザインシステム
│   └── ADVANCED_PATTERNS.md                    # 高度なパターン
├── src/                                        # Code Apps サンプルソースコード
├── assets/                                     # 静的アセット
├── package.json
├── power.config.json
├── vite.config.ts
└── README.md                                   # このファイル
```

---

## ⚠️ 制限事項

| 制限事項 | 詳細 |
|---------|------|
| Content Security Policy (CSP) | 未サポート |
| ストレージ SAS IP 制限 | 未サポート |
| Power Platform Git 統合 | 未サポート |
| Dataverse ソリューション | 未サポート |
| Azure Application Insights | ネイティブ統合なし |
| Copilot Studio エージェント新規作成 | Awesome Copilot スキルでは不可（Web API で対応） |
| ナレッジ・MCP Server 追加 | プログラムからの追加が困難（Copilot Studio UI で手動） |

---

## ⚖️ ライセンス

MIT License - 詳細は [LICENSE](./LICENSE) を参照してください。

**利用条件**:
- ✅ 商用利用、転用・改変、再配布、私用が可能
- ⚠️ サポートや保証は提供されません。利用は自己責任でお願いいたします。

---

## 💬 フィードバック

- **問題報告**: [GitHub Issues](https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/issues)
- **X (Twitter)**: [@geekfujiwara](https://twitter.com/geekfujiwara)

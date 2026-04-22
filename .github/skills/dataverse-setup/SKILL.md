---
name: dataverse-setup
description: "Dataverse テーブル設計・構築・デモデータ投入。ソリューション作成からテーブル・リレーション・ローカライズ・データ投入・検証まで Python スクリプトで一括構築する。"
category: data
triggers:
  - "Dataverse テーブル作成"
  - "テーブル設計"
  - "スキーマ設計"
  - "Lookup"
  - "Choice"
  - "リレーション"
  - "デモデータ"
  - "ソリューション"
  - "パブリッシャー"
  - "プレフィックス"
  - "setup_dataverse"
---

# Dataverse テーブル設計・構築スキル

Dataverse のソリューション・テーブル・リレーション・ローカライズ・デモデータを **Python スクリプト** で一括構築する。

> **このスキルの位置づけ**: アーキテクチャ設計（`architecture-design`）で Dataverse 利用が確定した後、テーブル設計→構築を担当する。Code Apps / Generative Pages / Power Automate / Copilot Studio のいずれを使う場合でも、データ層はこのスキルで構築する。

## 前提

### 共通認証: auth_helper.py

`power-platform-standard` スキルの `auth_helper.py` をプロジェクトルートにコピーして使用する。
2 層キャッシュ（AuthenticationRecord + MSAL OS 資格情報ストア）によりデバイスコード認証は初回のみ。

**コピー元:** `.github/skills/power-platform-standard/scripts/auth_helper.py`

#### auth_helper.py 公開 API

| 関数 | 戻り値 | 説明 |
|------|--------|------|
| `api_get(path)` | `dict` | GET。パス文字列のみ（`api_get("url", {"$filter": ...})` は **不可**。クエリパラメータは URL に直接埋め込む） |
| `api_post(path, body, solution=)` | `str \| None` | POST。作成レコードの ID を返す。`solution=SOLUTION_NAME` でソリューションヘッダー付与 |
| `api_patch(path, body)` | `None` | PATCH |
| `api_delete(path)` | `None` | DELETE |
| `api_request(path, body, method="PUT")` | `None` | PUT + `MSCRM.MergeLabels: true` ヘッダー自動付与。ローカライズ用 |
| `retry_metadata(fn, desc, max=5)` | `any \| None` | メタデータロック(0x80040237)・重複(already exists)検出リトライ。既存スキップ対応 |
| `get_token(scope=)` | `str` | アクセストークン。省略時は `{DATAVERSE_URL}/.default` |
| `flow_api_call(method, path, body)` | `dict` | Flow Management API 用。自動的に `service.flow.microsoft.com` スコープで認証 |

> **重要**: `api_get()` は `dict` を直接返す。`.json()` を呼ぶとエラー。

### .env 共通パラメータ

```env
DATAVERSE_URL=https://{org}.crm7.dynamics.com/
TENANT_ID={your-tenant-id}
SOLUTION_NAME={YourSolutionName}
PUBLISHER_PREFIX={prefix}
SOLUTION_DISPLAY_NAME={日本語表示名}   # ソリューション作成後に自動保存される
```

### 依存パッケージ

```
pip install azure-identity requests python-dotenv
```

## 作業フロー（必ずこの順序で進める）

### Step 0: パブリッシャー・プレフィックス確認（ユーザー承認必須）

**テーブル設計に入る前に、必ず既存パブリッシャーを環境から確認する。**

```python
from auth_helper import api_get

# 既存パブリッシャー一覧を取得
pubs = api_get("publishers?$filter=customizationprefix ne 'none'&$select=friendlyname,uniquename,customizationprefix&$orderby=friendlyname")
for p in pubs.get("value", []):
    print(f"  {p['customizationprefix']} — {p['friendlyname']} ({p['uniquename']})")
```

**ユーザーに提示する内容:**
- 既存パブリッシャー一覧（プレフィックス・名前）
- 推奨: 既存パブリッシャーを再利用するか、新規作成するか
- 新規の場合: プレフィックス命名案（2〜5文字の英小文字）

**ユーザーの承認を得てから `.env` の `PUBLISHER_PREFIX` を確定し、テーブル設計に進む。**

### Step 1: 名前衝突チェック（設計確定前に必ず実施）

```python
# ソリューション名の重複チェック
existing_sol = api_get(f"solutions?$filter=uniquename eq '{SOLUTION_NAME}'&$select=solutionid,friendlyname")

# テーブルスキーマ名の重複チェック
existing_tables = api_get(f"EntityDefinitions?$filter=startswith(SchemaName,'{PREFIX}_')&$select=SchemaName,DisplayName")
```

衝突がある場合はユーザーに報告し、名前を変更してから設計を確定する。

### Step 2: テーブル設計（ユーザー承認必須）

設計書を作成してユーザーに提示する。以下をすべて含める:

| 項目 | 内容 |
|------|------|
| テーブル一覧 | マスタ → 主 → 従属の順に記載 |
| 列定義 | 英語スキーマ名、型、必須、Choice 値（100000000 始まり） |
| 全 Lookup リレーション | 漏れなく明記（漏れると機能不全） |
| ローカライズ計画 | テーブル名・列名・Choice オプションの日本語名 |
| デモデータ計画 | 全テーブルに対して（従属テーブル含む） |

### Step 3: 構築スクリプト実行

同梱の [setup_dataverse.py](scripts/setup_dataverse.py) をプロジェクト用にカスタマイズして実行する。

## 絶対遵守ルール

### スキーマ設計

| ルール | 理由 |
|--------|------|
| **スキーマ名は英語のみ** | 日本語スキーマ名は `npx power-apps add-data-source` で失敗する |
| **ユーザー参照は SystemUser テーブル** | カスタムユーザーテーブルを作らない |
| **作成者・報告者は `createdby` システム列を利用** | カスタム ReportedBy Lookup は不要 |
| **Choice 値は `100000000` 始まり** | 0, 1, 2... はカスタム Choice では使用不可 |
| **マスタテーブルは要件から網羅的に洗い出す** | カテゴリ・場所・設備等、ユーザーが言及した分類はすべてマスタ化 |
| **全 Lookup リレーションシップを設計書に明記** | 漏れると Lookup が機能しない |
| **デモデータは全テーブル（従属テーブル含む）に計画** | コメント等の従属テーブルにもデモデータを用意 |
| **Instructions のテーブル名は単数形の論理名** | Power Apps MCP / Dataverse MCP は LogicalName でアクセス。複数形(EntitySetName)や表示名は不可 |

### 構築スクリプト

| ルール | 理由 |
|--------|------|
| **`retry_metadata()` を使う** | auth_helper.py 組み込みのリトライ。メタデータロック(0x80040237)・重複(already exists)を自動ハンドリング |
| **リレーション作成順: マスタ → 主 → 従属 → Lookup** | 依存テーブルが存在しないとリレーション作成失敗 |
| **既存テーブルでもカラム欠落を補完** | テーブルは既存でも、前回失敗したカラムが欠けている場合がある。個別にカラム存在チェックして不足分を追加 |
| **`api_post()` に `solution=SOLUTION_NAME` を渡す** | ソリューションヘッダー付与。テーブル・列・Lookup すべてに |
| **テーブル作成後に `PublishAllXml`** | テーブルのメタデータを公開しないとローカライズが失敗する場合がある |
| **`PublishAllXml` は 429 レート制限に備える** | 大量メタデータ操作後に 429 が頻発。時間を置いてスクリプト再実行で回復。べき等設計必須 |
| **ローカライズは `api_request()` で PUT** | `MSCRM.MergeLabels: true` ヘッダーが自動付与される |
| **ローカライズ後に再度 `PublishAllXml`** | ローカライズの反映に公開が必要 |
| **ソリューション含有は `AddSolutionComponent` で検証** | `MSCRM.SolutionName` ヘッダーだけに依存しない |
| **EntitySetName は API で取得** | 複数形の推測は誤る場合がある（例: `equipmentcategorys` vs `em_equipmentcategories`） |
| **ソリューション表示名を `.env` に自動保存** | `_save_env_value("SOLUTION_DISPLAY_NAME", name)` で永続化。他スクリプトから参照可能 |
| **メタデータロックで最大リトライ超過時は再実行** | `retry_metadata()` の max retries (5) を超えた列は、スクリプト再実行時に「既存。スキップ」で回復 |
| **429 レート制限は時間を置いて再実行** | `PublishAllXml`・`EntityDefinitions` PUT で 429 が頻発。べき等設計でスクリプト再実行で回復 |

### Lookup と NavProp

| ルール | 理由 |
|--------|------|
| **`@odata.bind` にはナビゲーションプロパティ名（NavProp名）を使う** | 列の論理名ではない。大文字/小文字が区別される |
| **NavProp 名は `ManyToOneRelationships` で動的取得** | `ReferencingEntityNavigationPropertyName` を確認する |
| **NavProp 名を推測しない** | `get_navprop(from_logical, to_logical)` ヘルパーで取得 |
| **Lookup は `NavProp@odata.bind` で設定** | `/{EntitySetName}({id})` の形式 |
| **Lookup リレーション作成はべき等チェック** | `RelationshipDefinitions` POST が 400 で失敗しても、再実行時に「既存。スキップ」で通過。既存チェックロジック必須 |

### ローカライズ

| ルール | 理由 |
|--------|------|
| **テーブル表示名は PUT + MetadataId** | PATCH では反映されないケースがある |
| **`api_request()` を使う** | `MSCRM.MergeLabels: true` ヘッダーが自動付与される |
| **列の PUT には `@odata.type` が必要** | AttributeType に応じた OData 型を指定（Lookup → `LookupAttributeMetadata` 等） |
| **Choice オプションは `UpdateOptionValue` アクション** | `api_post("UpdateOptionValue", {...})` で各オプションの日本語ラベルを更新 |

### テーブルアイコン

テーブルにカスタムアイコンを設定する場合は `icon-creation` スキル（`.github/skills/icon-creation/SKILL.md`）を参照。
SVG WebResource 作成 → `IconVectorName` の PUT 設定パターンが記載されている。

### デモデータ投入

| ルール | 理由 |
|--------|------|
| **NavProp 名を API から動的取得** | `get_navprop()` ヘルパーを使う |
| **EntitySetName を API から動的取得** | `get_entity_set_name()` ヘルパーを使う |
| **既存データのべき等チェック** | 主キー名で検索し、既存ならスキップ |
| **`api_post()` の戻り値は ID 文字列** | `r.headers["OData-EntityId"]` ではなく、直接 ID が返る |

## テーブル設計テンプレート

```markdown
## テーブル設計書

### テーブル一覧

| # | テーブル (論理名) | 種別 | 説明 |
|---|---|---|---|
| 1 | **{prefix}_mastera** | マスタ | ... |
| 2 | **{prefix}_mainentity** | 主テーブル | ... |
| 3 | **{prefix}_childentity** | 従属 | ... |

### 列定義: {prefix}_mainentity

| 列 (論理名) | 表示名 | 型 | 必須 | 備考 |
|---|---|---|---|---|
| {prefix}_name | Name / 名前 | String(200) | Yes | 主列 |
| {prefix}_status | Status / ステータス | Picklist | No | 100000000=New, 100000001=Active |
| {prefix}_masteraid | MasterA / マスタA | Lookup→mastera | No | |

### Lookup リレーション

| From (referencing) | → To (referenced) | lookup_attr | 表示名 |
|---|---|---|---|
| mainentity | mastera | {prefix}_masteraid | マスタA |
| mainentity | systemuser | {prefix}_assigneeid | 担当者 |
| childentity | mainentity | {prefix}_mainentityid | メイン |

### Choice 値

| フィールド | 値 |
|---|---|
| mainentity.status | 100000000=New, 100000001=Active, 100000002=Closed |

### ローカライズ

| 対象 | 日本語名 |
|---|---|
| mastera テーブル | マスタA / マスタA |
| mainentity テーブル | メインエンティティ / メインエンティティ一覧 |
| mainentity.name | 名前 |
| mainentity.status | ステータス |
| mainentity.status=100000000 | 新規 |
| mainentity.status=100000001 | アクティブ |

### デモデータ計画

| テーブル | 件数 | 概要 |
|---|---|---|
| MasterA | 5件 | ... |
| MainEntity | 10件 | 各ステータスを網羅 |
| ChildEntity | 8件 | 主要レコードにコメント |
```

## スクリプト構成

### テンプレート（プロジェクト用にカスタマイズ）

[setup_dataverse.py](scripts/setup_dataverse.py)

カスタマイズ箇所:
- `TABLES` — テーブル定義（論理名・列定義）
- `LOOKUPS` — リレーション定義
- `LOCALIZE_TABLES` / `LOCALIZE_COLUMNS` / `LOCALIZE_OPTIONS` — 日本語化定義
- `create_demo_data()` — デモデータ投入ロジック

実行ステップ:
1. **ソリューション確認/作成**（べき等。表示名を .env に自動保存）
2. **テーブル作成**（`retry_metadata` + 既存カラム補完）
3. **Lookup リレーション作成**
4. **カスタマイズ公開**（`PublishAllXml`）
5. **日本語ローカライズ**（`api_request` PUT + MergeLabels + `UpdateOptionValue`）
6. **再公開**
7. **デモデータ投入**（NavProp・EntitySetName 動的取得）
8. **ソリューション含有検証**（`AddSolutionComponent`）
9. **テーブル検証**（EntitySetName で実クエリ）

## 関連スキル

| スキル | 関係 |
|--------|------|
| `power-platform-standard` | 共通認証（auth_helper.py）・.env パラメータ・retry_metadata |
| `architecture-design` | アーキテクチャ判断後にこのスキルへ |
| `code-apps-dev` | テーブル構築後に Code Apps 開発 |
| `generative-page-dev` | テーブル構築後に Generative Page 開発 |
| `model-driven-app` | テーブル構築後にモデル駆動型アプリ作成 |
| `security-role` | テーブル構築後にセキュリティロール設定 |

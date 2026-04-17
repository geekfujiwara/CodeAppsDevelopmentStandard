---
name: security-role
description: "カスタムセキュリティロールを Dataverse Web API で作成・権限設定・ソリューション追加する。Use when: セキュリティロール, Security Role, 権限設定, ロール作成, AddPrivilegesRole, ReplacePrivilegesRole, PrivilegeDepth, アクセス制御, RBAC, ロール権限, テーブル権限"
---

# カスタムセキュリティロール構築スキル

Dataverse Web API（`roles` / `privileges` テーブル + `AddPrivilegesRole` アクション）でカスタムセキュリティロールを **ソリューション対応で** 作成・権限設定・公開する。

> **前提**: `setup_dataverse.py` で Dataverse テーブルが作成済みであること。
> テーブルが存在しないとテーブル固有の権限を設定できない。

## 大前提: 一つのソリューション内に開発

Dataverse テーブル・Code Apps・Power Automate フロー・Copilot Studio エージェント・モデル駆動型アプリ・**セキュリティロール** は **すべて同一のソリューション内** に含める。
`.env` の `SOLUTION_NAME` と `PUBLISHER_PREFIX` を全フェーズで統一して使用する。

> **認証**: Python スクリプトの認証は `power-platform-standard` スキルの `auth_helper.py` を使用。

## 前提: 設計フェーズ完了後にデプロイに入る（必須）

**ロールをデプロイする前に、ロール設計をユーザーに提示し承認を得ていること。**

設計提示時に含める内容:

| 項目                       | 内容                                                                   |
| -------------------------- | ---------------------------------------------------------------------- |
| ベースロール               | Basic User のコピーから開始（確定ルール。変更不可）                     |
| ロール名                   | 日本語表示名（ロール名に日本語 OK）                                    |
| ロール説明                 | ロールの目的を簡潔に記述                                               |
| テーブル権限               | テーブルごとのCRUD権限と深度（Basic/Local/Deep/Global）                 |
| マスタテーブルの AppendTo  | Lookup 先マスタには必ず AppendTo を付与（読み取り専用でも）            |
| その他の権限               | 特殊権限（prvExportToExcel, prvBulkDelete 等）が必要か                  |
| モデル駆動型アプリ関連付け | 作成済みの AppModule に関連付けるか                                     |
| ユーザー割り当て           | Copilot Studio エージェントに必要か、特定チームか                       |

```
セキュリティロール: 設計提示 → ユーザー承認 → デプロイスクリプト実行
```

## 絶対遵守ルール

### ロール作成の必須条件

```
name:              ロールの表示名（日本語 OK）
businessunitid:    ルートビジネスユニットの ID（必須。省略不可）
description:       ロールの説明
```

> **ルートビジネスユニットは必ず取得して指定する**。省略すると環境のルートBU以外に作成される可能性がある。

### ルートビジネスユニットの取得パターン

```python
bu = api_get("businessunits?$filter=parentbusinessunitid eq null&$select=businessunitid,name")
root_bu_id = bu["value"][0]["businessunitid"]
```

### ロール名は既存との重複に注意

```
✅ roles?$filter=name eq 'MyApp User' and _businessunitid_value eq {root_bu_id}
→ 既存があれば更新、なければ新規作成（べき等パターン）
```

### 権限名のパターン（テーブル関連）

```
prv{Verb}{TableSchemaName}

Verb: Create, Read, Write, Delete, Append, AppendTo, Assign, Share
TableSchemaName: テーブルのスキーマ名（prefix 含む。例: geek_Incident）

例:
  prvCreategeek_Incident    → geek_Incident テーブルの作成権限
  prvReadgeek_Incident      → geek_Incident テーブルの読み取り権限
  prvWritegeek_Incident     → geek_Incident テーブルの書き込み権限
  prvDeletegeek_Incident    → geek_Incident テーブルの削除権限
  prvAppendgeek_Incident    → geek_Incident テーブルへの追加権限
  prvAppendTogeek_Incident  → geek_Incident テーブルへの追加先権限
  prvAssigngeek_Incident    → geek_Incident テーブルの割り当て権限
  prvSharegeek_Incident     → geek_Incident テーブルの共有権限
```

> **重要**: 権限名の `{TableSchemaName}` 部分はテーブルの **SchemaName**（大文字始まり）を使う。LogicalName（全小文字）ではない。
> 例: `geek_Incident`（SchemaName）→ `prvReadgeek_Incident` ✅
>     `geek_incident`（LogicalName）→ `prvReadgeek_incident` ❌（権限が見つからない場合あり）

### PrivilegeDepth（権限の深度）

| 値     | 名前    | 意味                                               |
| ------ | ------- | -------------------------------------------------- |
| 0      | Basic   | ユーザー所有のレコードのみ                         |
| 1      | Local   | ユーザーのビジネスユニット内のレコード             |
| 2      | Deep    | ユーザーのBU + 子BU のレコード                     |
| 3      | Global  | 組織全体のレコード                                 |

### 権限設定は AddPrivilegesRole アクションで

```python
# Bound Action: POST roles({role_id})/Microsoft.Dynamics.CRM.AddPrivilegesRole
api_post(f"roles({role_id})/Microsoft.Dynamics.CRM.AddPrivilegesRole", {
    "Privileges": [
        {
            "PrivilegeId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
            "Depth": "Global"  # Basic | Local | Deep | Global
        },
        # ... 追加の権限
    ]
})
```

> **注意**: `AddPrivilegesRole` は既存の権限に **追加** する。全置換する場合は `ReplacePrivilegesRole` を使う。

### 確定ルール（必須）: Basic User ロールの権限をコピーして土台にする

```
★★★ カスタムセキュリティロールは必ず Basic User のコピーから開始する ★★★

ゼロから作成すると、プラットフォーム標準権限（メール送信・ダッシュボード表示・
検索・ユーザー設定・ビュー切替等の約 480 権限）が欠落し、
ユーザーがアプリを正常に使えなくなる。

✅ Basic User（旧 Common Data Service User）の全権限を取得
   → カスタムテーブル権限を上乗せ → ReplacePrivilegesRole で一括設定
❌ 空のロールにカスタムテーブル権限だけ追加
   → 標準機能（ダッシュボード・検索・ビュー切替等）が動かない

このルールは管理者・ユーザー・閲覧者のいずれのロールにも適用する。
```

#### 実装パターン

```python
# 1. Basic User ロールの権限を取得
result = api_get(f"RetrieveRolePrivilegesRole(RoleId={basic_user_role_id})")
base_privileges = result["RolePrivileges"]  # [{PrivilegeId, Depth}, ...]

# 2. ベースをコピーし、カスタムテーブル権限で上書き/追加
priv_dict = {p["PrivilegeId"]: p for p in base_privileges}
priv_dict[custom_priv_id] = {"PrivilegeId": custom_priv_id, "Depth": "Global"}

# 3. 最初のバッチは ReplacePrivilegesRole で全置換、
#    2 バッチ目以降は AddPrivilegesRole で追加
api_post(f"roles({role_id})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole",
         {"Privileges": first_batch})
api_post(f"roles({role_id})/Microsoft.Dynamics.CRM.AddPrivilegesRole",
         {"Privileges": remaining_batch})
```

> **Basic User の検索**: `name eq 'Basic User' or name eq 'Common Data Service User'` で両方の名前を検索（環境による揺れ対応）。
> **RetrieveRolePrivilegesRole**: Function でルートBU上の Basic User ロール権限を取得。環境の Basic User は約 480 権限を持つ。

### AddPrivilegesRole のバッチ分割（100 件制限）

```
大量の権限（テーブル数 × CRUD 8 操作）を一度に送信すると失敗する場合がある。
✅ 100 件ずつバッチ分割して AddPrivilegesRole を呼ぶ
❌ 全権限を 1 回で送信 → タイムアウトや API エラーのリスク
```

### ロール作成後のメタデータ反映待ち

```
ロール作成（POST roles）直後に AddPrivilegesRole を呼ぶと失敗する場合がある。
✅ ロール作成後に time.sleep(2) で反映を待つ
```

### 権限 ID の取得パターン

```python
# テーブルの CRUD 権限を一括取得
privs = api_get(
    f"privileges?$filter=startswith(name,'prvCreate{schema_name}') "
    f"or startswith(name,'prvRead{schema_name}') "
    f"or startswith(name,'prvWrite{schema_name}') "
    f"or startswith(name,'prvDelete{schema_name}') "
    f"or startswith(name,'prvAppend{schema_name}') "
    f"or startswith(name,'prvAppendTo{schema_name}') "
    f"or startswith(name,'prvAssign{schema_name}') "
    f"or startswith(name,'prvShare{schema_name}')"
    f"&$select=privilegeid,name"
)
```

> **`startswith` ではなく `eq` を使うとより正確**。ただし SchemaName の正確な大文字小文字が必要。
> テーブルのメタデータから SchemaName を取得して使う。

### 権限名の SchemaName → LogicalName フォールバック

```python
# SchemaName（geek_Incident）で検索して 0 件の場合、
# LogicalName（geek_incident）で再検索するフォールバックが推奨
for verb in TABLE_VERBS:
    filter_parts.append(f"name eq 'prv{verb}{schema_name}'")
# 0 件 → logical_name で再検索
for verb in TABLE_VERBS:
    filter_parts2.append(f"name eq 'prv{verb}{logical_name}'")
```

> **教訓**: 環境によって権限名に SchemaName（大文字始まり）が使われるか LogicalName（全小文字）が使われるかが異なる場合がある。
> フォールバック検索を入れることで両方に対応できる。

### 標準テーブル権限（よく必要になるもの）

| テーブル       | SchemaName          | 用途                     |
| -------------- | ------------------- | ------------------------ |
| systemuser     | SystemUser          | ユーザー参照             |
| team           | Team                | チーム参照               |
| annotation     | Annotation          | メモ・添付ファイル       |
| connection     | Connection          | つながり                 |
| activitypointer | ActivityPointer    | 活動                     |
| email          | Email               | メール                   |
| task           | Task                | タスク                   |
| note           | Annotation          | 注記                     |

### その他の特殊権限（テーブルに紐付かない）

```
prvExportToExcel     → Excel エクスポート
prvBulkDelete        → 一括削除
prvGoOffline         → オフラインモード
prvPrint             → 印刷
prvPublishDuplicateRule → 重複検出ルール公開
prvReadSharePointData   → SharePoint データ読み取り
```

### ソリューション含有の検証

```python
# Security Role (ComponentType=20)
api_post("AddSolutionComponent", {
    "ComponentId": role_id,
    "ComponentType": 20,
    "SolutionUniqueName": SOLUTION_NAME,
    "AddRequiredComponents": False,
    "DoNotIncludeSubcomponents": False,
})
```

### モデル駆動型アプリとの関連付け

```python
# appmoduleroles_association で関連付け
requests.post(
    f"{API}/appmodules({app_id})/appmoduleroles_association/$ref",
    headers=headers,
    json={"@odata.id": f"{API}/roles({role_id})"}
)
```

### ロール作成時に MSCRM.SolutionName ヘッダーを付ける

```python
# ロール作成時にソリューションに自動包含させる
headers["MSCRM.SolutionName"] = SOLUTION_NAME
```


## テンプレート・デプロイ

ロールテンプレートパターン・デプロイスクリプトの詳細は [デプロイリファレンス](deploy-reference.md) を参照。

トラブルシューティングは [トラブルシューティング](troubleshooting.md) を参照。

## .env パラメータ

```env
# === 必須（共通）===
DATAVERSE_URL=https://{org}.crm7.dynamics.com/
TENANT_ID={your-tenant-id}
SOLUTION_NAME=IncidentManagement
PUBLISHER_PREFIX=geek

# === セキュリティロール オプション ===
APP_MODULE_ID={app-module-id}    # 未設定時はアプリ関連付けをスキップ
```


## コンポーネントタイプ定数

| コンポーネント       | ComponentType |
| -------------------- | ------------- |
| Entity (テーブル)    | 1             |
| Security Role        | 20            |
| View (savedquery)    | 26            |
| Form (systemform)    | 60            |
| SiteMap              | 62            |
| AppModule            | 80            |

## 権限の Verb 一覧（テーブル操作）

| Verb     | 意味             | 説明                                               |
| -------- | ---------------- | -------------------------------------------------- |
| Create   | 作成             | 新規レコード作成                                   |
| Read     | 読み取り         | レコード閲覧                                       |
| Write    | 書き込み         | レコード更新                                       |
| Delete   | 削除             | レコード削除                                       |
| Append   | 追加             | レコードに関連レコードを追加（Lookup の元）        |
| AppendTo | 追加先           | 他レコードの Lookup 先になる                       |
| Assign   | 割り当て         | レコードの所有者変更                               |
| Share    | 共有             | レコードを他ユーザー/チームに共有                  |

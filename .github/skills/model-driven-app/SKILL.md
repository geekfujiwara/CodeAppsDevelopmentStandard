---
name: model-driven-app
description: "モデル駆動型アプリを Dataverse Web API で作成・公開する。Use when: モデル駆動型アプリ, Model-Driven App, AppModule, SiteMap, ナビゲーション, ビュー, フォーム, セキュリティロール, appmodules, PublishXml, ValidateApp, AddAppComponents"
---

# モデル駆動型アプリ構築スキル

Dataverse Web API（`appmodules` / `sitemaps` テーブル）でモデル駆動型アプリを **ソリューション対応で** 作成・構成・公開する。

> **前提**: `setup_dataverse.py` で Dataverse テーブルが作成済みであること。
> テーブルが存在しないとアプリに追加するコンポーネントがない。

## 大前提: 一つのソリューション内に開発

Dataverse テーブル・Code Apps・Power Automate フロー・Copilot Studio エージェント・**モデル駆動型アプリ** は **すべて同一のソリューション内** に含める。
`.env` の `SOLUTION_NAME` と `PUBLISHER_PREFIX` を全フェーズで統一して使用する。

> **認証**: Python スクリプトの認証は `power-platform-standard` スキルに記載の `scripts/auth_helper.py` を使用。

## 前提: 設計フェーズ完了後にデプロイに入る（必須）

**アプリをデプロイする前に、アプリ設計をユーザーに提示し承認を得ていること。**

設計提示時に含める内容:

| 項目               | 内容                                                         |
| ------------------ | ------------------------------------------------------------ |
| アプリ名           | 表示名とユニーク名（英語のみ）                               |
| アプリ説明         | アプリの目的の簡潔な説明                                     |
| 含めるテーブル一覧 | ソリューション内のどのテーブルをアプリに含めるか             |
| ナビゲーション構造 | SiteMap の Area/Group/SubArea 構成                           |
| ビュー・フォーム   | 各テーブルで表示するビューとフォーム（デフォルト: 全て含む） |
| セキュリティロール | アプリに関連付けるロール                                     |

```
モデル駆動型アプリ: 設計提示 → ユーザー承認 → デプロイスクリプト実行
```

## 絶対遵守ルール

### AppModule 作成の必須プロパティ

```
name:          アプリの表示名（日本語 OK）
uniquename:    一意名（英語のみ。自動的にソリューション prefix が付く）
clienttype:    4（Unified Interface）★ 必須
webresourceid: アイコン用 WebResource ID
               システムデフォルト: 953b9fac-1e5e-e611-80d6-00155ded156f
```

### clienttype=4 を必ず指定する（最重要）

```
❌ clienttype 未指定 → レガシー Web クライアント用アプリが作成される
   「このアプリはレガシ Web クライアント用に設計されたものです」警告が表示
✅ clienttype=4 → Unified Interface（新しい Look & Feel）
   モダンな UI で動作し、警告なし
```

### uniquename は英語のみ

```
✅ uniquename: "IncidentManagement"
❌ uniquename: "インシデント管理"
→ 英数字とアンダースコアのみ許容
→ 作成時にソリューション publisher prefix が自動付与（例: new_IncidentManagement）
```

### SiteMap が必須（ValidateApp で検証される）

```
❌ SiteMap なしで AppModule を作成 → ValidateApp で "App does not contain Site Map" エラー
✅ SiteMap を先に作成し、AddAppComponents でアプリに追加
```

### SiteMap XML の正式フォーマット（最重要）

```xml
<SiteMap IntroducedVersion="7.0.0.0">
  <Area Id="MainArea" ShowGroups="true" IntroducedVersion="7.0.0.0">
    <Titles><Title LCID="1041" Title="アプリ名" /></Titles>
    <Group Id="grp_transaction" IntroducedVersion="7.0.0.0" IsProfile="false">
      <Titles><Title LCID="1041" Title="業務データ" /></Titles>
      <SubArea Id="sub_entity1" Entity="prefix_entity1" AvailableOffline="true" />
      <SubArea Id="sub_entity2" Entity="prefix_entity2" AvailableOffline="true" />
    </Group>
    <Group Id="grp_master" IntroducedVersion="7.0.0.0" IsProfile="false">
      <Titles><Title LCID="1041" Title="マスタ" /></Titles>
      <SubArea Id="sub_master1" Entity="prefix_master1" AvailableOffline="true" />
    </Group>
  </Area>
</SiteMap>
```

- `Area`: ナビゲーションの最上位区分
- `Group`: Area 内のグループ（複数テーブルをまとめる）
- `SubArea`: 個別テーブルへのナビゲーション。`Entity` は **論理名**（例: `geek_incident`）
- 複数の Area / Group を定義可能（例: マスタデータとトランザクションデータを分離）

### ShowGroups="true" を必ず指定する（最重要）

```
❌ ShowGroups 未指定 or "false" → グループヘッダーが非表示
   → 最初のグループのテーブルしかナビゲーションに表示されない
✅ ShowGroups="true" → 全グループがヘッダー付きで表示される
```

> **教訓**: 複数 Group がある SiteMap で `ShowGroups="true"` を忘れると、
> 最初のグループのアイテムしか表示されず、他のグループが完全に消える。
> これはエラーにならず ValidateApp も通るため発見が困難。

### SiteMap XML 必須属性一覧

| 要素    | 必須属性                                               | 説明                                              |
| ------- | ------------------------------------------------------ | ------------------------------------------------- |
| SiteMap | `IntroducedVersion="7.0.0.0"`                          | バージョニング用。Unified Interface で必要        |
| Area    | `ShowGroups="true"`, `IntroducedVersion="7.0.0.0"`     | ShowGroups がないと複数グループが表示されない      |
| Group   | `IntroducedVersion="7.0.0.0"`, `IsProfile="false"`     | IsProfile=false でプロファイルグループと区別       |
| SubArea | `Entity`, `AvailableOffline="true"`                     | オフラインアクセス。モバイル対応に必要             |

### Title は属性ではなく Titles 子要素で指定する

```xml
❌ <Area Id="MainArea" Title="アプリ名">           ← Title 属性は非正式
✅ <Area Id="MainArea" ShowGroups="true" IntroducedVersion="7.0.0.0">
     <Titles><Title LCID="1041" Title="アプリ名" /></Titles>
```

> `LCID="1041"` は日本語。英語は `1033`。
> Title 属性でも動作する場合があるが、正式フォーマットは Titles 子要素。

### SiteMap レコードは `isappaware: true` で作成

```python
body = {
    "sitemapname": "MyApp_SiteMap",
    "sitemapnameunique": "MyApp_SiteMap",
    "sitemapxml": sitemap_xml,
    "isappaware": True,  # ← 必須。アプリ固有 SiteMap として認識される
}
```

### コンポーネント追加は AddAppComponents アクション

```python
# SiteMap の追加
api_post("AddAppComponents", {
    "AppId": app_id,
    "Components": [
        {"sitemapid": sitemap_id, "@odata.type": "Microsoft.Dynamics.CRM.sitemap"},
    ]
})

# ビュー（savedquery）の追加
api_post("AddAppComponents", {
    "AppId": app_id,
    "Components": [
        {"savedqueryid": view_id, "@odata.type": "Microsoft.Dynamics.CRM.savedquery"},
    ]
})

# フォーム（systemform）の追加
api_post("AddAppComponents", {
    "AppId": app_id,
    "Components": [
        {"formid": form_id, "@odata.type": "Microsoft.Dynamics.CRM.systemform"},
    ]
})
```

> **注意**: テーブルのビューとフォームを追加すると、テーブルも自動的にアプリに含まれる。
> ただし `AppComponents.Entities` は空のままになる場合がある（appmodulecomponent テーブルに Entity Type=1 のレコードが自動作成されない）。
> これはアプリの動作には影響しない。SiteMap の SubArea で Entity を指定していれば正常にナビゲーションに表示される。

### AddAppComponents のバッチ分割パターン

```
大量のコンポーネント（ビュー・フォーム × 複数テーブル）を一度に送信すると失敗する場合がある。
✅ 50 件ずつバッチ分割して送信
✅ バッチ失敗時は 1 件ずつフォールバック（既に追加済みのコンポーネントをスキップ）
```

### Entity コンポーネント (Type=1) は API で直接追加できない

```
❌ appmodulecomponent テーブルへの POST → "The 'Create' method does not support entities of type 'appmodulecomponent'"
❌ appmodules の collection-valued ナビゲーションプロパティへの deep insert → 非対応
✅ AddAppComponents で savedquery/systemform を追加すれば、SiteMap 経由でテーブルが表示される
```

> **教訓**: Market Insight App のように UI で作成したアプリは Entity (Type=1) コンポーネントが登録されるが、
> API で作成したアプリでは savedquery/systemform のみが登録される。これは正常動作であり修正不要。

### ビューとフォームの取得パターン

```python
# テーブルのシステムビュー（querytype=0 = Public View）
views = api_get("savedqueries", {
    "$filter": f"returnedtypecode eq '{entity_logical_name}' and querytype eq 0",
    "$select": "savedqueryid,name",
})

# テーブルのメインフォーム（type=2 = Main Form）
forms = api_get("systemforms", {
    "$filter": f"objecttypecode eq '{entity_logical_name}' and type eq 2",
    "$select": "formid,name",
})
```

### セキュリティロール関連付け

```python
# appmoduleroles_association ナビゲーションプロパティで関連付け
requests.post(
    f"{API}/appmodules({app_id})/appmoduleroles_association/$ref",
    headers=headers,
    json={"@odata.id": f"{API}/roles({role_id})"}
)
```

- **Basic User**（旧 Common Data Service User）ロールを最低限関連付ける
- 追加のカスタムロールがあれば同様に関連付け

### ValidateApp で事前検証

```python
result = api_get(f"ValidateApp(AppModuleId={app_id})")
# ValidationSuccess: true/false
# ValidationIssueList: エラー/警告の配列
```

- SiteMap がない → Error
- テーブルにフォーム/ビュー参照がない → Warning

### PublishXml でアプリ公開

```python
publish_xml = (
    f"<importexportxml>"
    f"<appmodules><appmodule>{app_id}</appmodule></appmodules>"
    f"</importexportxml>"
)
api_post("PublishXml", {"ParameterXml": publish_xml})
```

### 個別テーブルの PublishXml（ビュー・フォーム変更時）

```python
# ビュー・フォーム・アイコンなどテーブル単位の変更を公開する場合
publish_xml = (
    '<importexportxml>'
    f'<entities><entity>{entity_logical_name}</entity></entities>'
    '</importexportxml>'
)
api_post("PublishXml", {"ParameterXml": publish_xml})
```

> **PublishXml vs PublishAllXml**: テーブル単位の変更は `<entities>` で個別公開するのが高速。
> `PublishAllXml` は全コンポーネントを公開するため時間がかかる。

### アプリ URL フォーマット

```
✅ {DATAVERSE_URL}/main.aspx?appid={app_id}
❌ {DATAVERSE_URL}/apps/{app_id}      ← 動作しない
```

> デプロイスクリプトは完了時に `.env` へ `APP_MODULE_ID` を自動保存する。
> この値は `deploy_security_role.py` のアプリ関連付けステップで使用される。

### ソリューション含有の検証

```python
# AppModule (ComponentType=80)
api_post("AddSolutionComponent", {
    "ComponentId": app_id,
    "ComponentType": 80,
    "SolutionUniqueName": SOLUTION_NAME,
    "AddRequiredComponents": False,
    "DoNotIncludeSubcomponents": False,
})

# SiteMap (ComponentType=62)
api_post("AddSolutionComponent", {
    "ComponentId": sitemap_id,
    "ComponentType": 62,
    "SolutionUniqueName": SOLUTION_NAME,
    "AddRequiredComponents": False,
    "DoNotIncludeSubcomponents": False,
})
```

### べき等デプロイパターン

```python
# 既存アプリ検索
existing = api_get("appmodules", {
    "$filter": f"uniquename eq '{APP_UNIQUE_NAME}'",
    "$select": "appmoduleid,name"
})

if existing["value"]:
    app_id = existing["value"][0]["appmoduleid"]
    # 更新（PATCH）
    api_patch(f"appmodules({app_id})", {"name": new_name, "description": new_desc})
else:
    # 新規作成（POST）
    api_post("appmodules", body)
```


## .env パラメータ

```env
# === 必須（共通）===
DATAVERSE_URL=https://{org}.crm7.dynamics.com/
TENANT_ID={your-tenant-id}
SOLUTION_NAME=IncidentManagement
PUBLISHER_PREFIX=geek

# === モデル駆動型アプリ オプション ===
APP_DISPLAY_NAME=インシデント管理           # 未設定時は SOLUTION_NAME から生成
APP_UNIQUE_NAME=IncidentManagement          # 未設定時は SOLUTION_NAME を使用
APP_DESCRIPTION=インシデント管理アプリ      # 未設定時は自動生成
```


## デプロイ・設計パターン

デプロイスクリプト・ナビゲーション設計パターンの詳細は [デプロイリファレンス](./references/deploy-reference.md) を参照。

トラブルシューティングは [トラブルシューティング](./references/troubleshooting.md) を参照。

## コンポーネントタイプ定数

| コンポーネント    | ComponentType | OData Type                          |
| ----------------- | ------------- | ----------------------------------- |
| SiteMap           | 62            | `Microsoft.Dynamics.CRM.sitemap`    |
| AppModule         | 80            | `Microsoft.Dynamics.CRM.appmodule`  |
| Entity (テーブル) | 1             | —                                   |
| View (savedquery) | 26            | `Microsoft.Dynamics.CRM.savedquery` |
| Form (systemform) | 60            | `Microsoft.Dynamics.CRM.systemform` |
| Dashboard         | 60            | —                                   |
| Security Role     | 20            | `Microsoft.Dynamics.CRM.role`       |


## クイックリファレンス: 絶対遵守ルール

| ルール                                           | 理由                                                |
| ------------------------------------------------ | --------------------------------------------------- |
| `clienttype=4` (Unified Interface) を必ず指定     | 未指定だとレガシー Web クライアント用アプリになる    |
| uniquename は英語のみ                             | 日本語は API エラーになる                            |
| SiteMap は `isappaware: true` で作成              | アプリ固有 SiteMap として認識させる                  |
| SiteMap を AddAppComponents で追加                | 追加しないと ValidateApp でエラー                    |
| **`ShowGroups="true"` を Area に指定**             | **未指定だと最初のグループしか表示されない（最重要）** |
| **`IntroducedVersion="7.0.0.0"` を全要素に指定**  | Unified Interface で必須。欠けると表示不具合          |
| **Title は `<Titles>` 子要素で指定**               | 属性ではなくネスト要素が正式フォーマット              |
| **`AvailableOffline="true"` を SubArea に指定**    | モバイル対応・オフラインアクセスに必要                |
| ビュー・フォームを追加するとテーブルも含まれる    | テーブル直接追加は不要（API で追加もできない）        |
| Basic User ロールを関連付け                       | ユーザーがアプリを表示できるようにする                |
| 公開前に ValidateApp で検証                       | エラーがあると公開しても正常動作しない                |
| AddSolutionComponent でソリューション含有検証     | MSCRM.SolutionName ヘッダーだけに依存しない          |
| べき等デプロイパターンを使う                      | uniquename で検索 → 更新 or 新規作成                 |
| **ビューのプライマリ列は常に先頭**                 | `_name` 列を LayoutXml の最初の `<cell>` にする      |
| **複数行テキスト（Memo）はビューに含めない**       | 一覧表示で見づらいため。フォームのみに表示            |
| **テーブルアイコンは SVG で設定**                   | `IconVectorName` + Web Resource (type=11)            |
| **`IconVectorName` は PUT で設定**                  | `MSCRM.MergeLabels: true` 必須                       |
| **AddAppComponents は 50 件ずつバッチ分割**         | 大量送信は失敗する場合あり。失敗時は 1 件ずつ再試行   |
| **アプリ URL は `main.aspx?appid=`**                | `/apps/{id}` 形式ではない                             |
| **PublishXml はテーブル単位で個別公開**              | `PublishAllXml` より高速                              |
| **既存 SiteMap は PATCH で XML 更新**                | 新 SiteMap を AddAppComponents で追加すると 0x80050111 |
| **appmodulecomponent は appmoduleidunique で検索不可**| componenttype=62 で全件取得し objectid で照合          |

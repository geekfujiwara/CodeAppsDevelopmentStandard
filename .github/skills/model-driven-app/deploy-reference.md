# モデル駆動型アプリ デプロイリファレンス

## デプロイスクリプト

### `./deploy_model_driven_app.py`

ソリューション内のテーブルを自動検出し、以下のステップを実行:

1. **ソリューション内テーブル一覧取得** — `solutioncomponents` + `EntityDefinitions` で自動検出
2. **SiteMap XML 動的構築** — テーブルの論理名から `<SubArea Entity="...">` を生成
3. **SiteMap レコード作成** — `sitemaps` テーブルにべき等作成
4. **AppModule 作成** — `appmodules` テーブルにべき等作成
5. **コンポーネント追加** — `AddAppComponents` で SiteMap・ビュー・フォームを追加
6. **セキュリティロール関連付け** — Basic User ロールを関連付け
7. **バリデーション** — `ValidateApp` で検証
8. **アプリ公開** — `PublishXml` で公開
9. **ソリューション含有検証** — `AddSolutionComponent` で AppModule・SiteMap をソリューションに含める

```bash
# 実行
python ./deploy_model_driven_app.py
```

### `./customize_views_forms.py`

モデル駆動型アプリの **ビュー・フォーム・テーブルアイコン** を一括カスタマイズする。
`deploy_model_driven_app.py` 実行後に使用する。

**デフォルトの設計規約（ユーザーから特別な指示がない場合に適用）:**

#### 既定ビュー

- **プライマリ列（`_name`）を常に一番左**に表示
- カスタム列をすべて表示（**複数行テキスト（Memo）は除外**）
- `createdon`（作成日）・`ownerid`（所有者）を表示
- 作成日を基準に**降順ソート**

#### メインフォーム

- カスタム列をすべて表示
- **適切にタブ・セクション分け**（一般情報 / システム情報）
- **複数行テキスト → 行の高さ 7 行**（rowspan="7"）
- **オートナンバー列** → データ入力は任意にし、**読み取り専用**（disabled="true"）
- 基本情報セクションは **2 列表示**
- 詳細情報セクション（Memo 列）は **1 列表示**

#### テーブルアイコン

- テーブルのテーマに合わせた **SVG アイコン（32x32）を自動生成**
- **Web Resource（type=11, SVG）**として Dataverse に登録
- `EntityMetadata.IconVectorName` にWeb Resource名を設定
- テーブル名からテーマを自動判定（incident→警告、category→フォルダ、priority→フラグ等）

```bash
# 全テーブルを一括カスタマイズ
python ./customize_views_forms.py

# 特定テーブルのみ
python ./customize_views_forms.py geek_incident
```

### テーブルアイコン API パターン

```python
# 1. SVG を Web Resource として登録（type=11）
body = {
    "name": f"{PREFIX}_/icons/{table_name}.svg",
    "displayname": f"{table_logical_name} Icon",
    "content": base64_encoded_svg,
    "webresourcetype": 11,  # SVG
}
api_post("webresourceset", body)

# 2. EntityMetadata に IconVectorName を設定（PUT で更新）
requests.put(
    f"{API}/EntityDefinitions(LogicalName='{entity_logical_name}')",
    headers=headers,  # MSCRM.MergeLabels: true 必須
    json={"IconVectorName": f"{PREFIX}_/icons/{table_name}.svg"},
)

# 3. PublishXml で公開
```

> **教訓**: `IconVectorName` の設定は `PUT`（PATCH ではない）で `EntityDefinitions` を更新する。
> `MSCRM.MergeLabels: true` ヘッダーが必須。Web Resource 名は `{prefix}_/icons/{name}.svg` 形式。

## ナビゲーション設計パターン

### パターン A: シンプル（全テーブル 1 グループ）

```xml
<SiteMap IntroducedVersion="7.0.0.0">
  <Area Id="MainArea" ShowGroups="true" IntroducedVersion="7.0.0.0">
    <Titles><Title LCID="1041" Title="アプリ名" /></Titles>
    <Group Id="MainGroup" IntroducedVersion="7.0.0.0" IsProfile="false">
      <Titles><Title LCID="1041" Title="データ管理" /></Titles>
      <SubArea Id="sub_entity1" Entity="prefix_entity1" AvailableOffline="true" />
      <SubArea Id="sub_entity2" Entity="prefix_entity2" AvailableOffline="true" />
    </Group>
  </Area>
</SiteMap>
```

### パターン B: マスタ・トランザクション分離（★ 推奨。自動グループ化対応）

```xml
<SiteMap IntroducedVersion="7.0.0.0">
  <Area Id="MainArea" ShowGroups="true" IntroducedVersion="7.0.0.0">
    <Titles><Title LCID="1041" Title="アプリ名" /></Titles>
    <Group Id="grp_incident" IntroducedVersion="7.0.0.0" IsProfile="false">
      <Titles><Title LCID="1041" Title="インシデント" /></Titles>
      <SubArea Id="sub_incident" Entity="prefix_incident" AvailableOffline="true" />
      <SubArea Id="sub_comment" Entity="prefix_incidentcomment" AvailableOffline="true" />
    </Group>
    <Group Id="grp_master" IntroducedVersion="7.0.0.0" IsProfile="false">
      <Titles><Title LCID="1041" Title="マスタ" /></Titles>
      <SubArea Id="sub_category" Entity="prefix_category" AvailableOffline="true" />
      <SubArea Id="sub_priority" Entity="prefix_priority" AvailableOffline="true" />
    </Group>
  </Area>
</SiteMap>
```

> デプロイスクリプトはテーブル名からテーマを自動判定し、パターン B 相当のグループ化を自動で行う。
> マスタ系キーワード（category, priority, asset, master, type, status 等）を含むテーブルは「マスタデータ」グループに分類される。

### パターン C: マルチエリア（大規模アプリ）

```xml
<SiteMap IntroducedVersion="7.0.0.0">
  <Area Id="OperationArea" ShowGroups="true" IntroducedVersion="7.0.0.0">
    <Titles><Title LCID="1041" Title="運用管理" /></Titles>
    <Group Id="IncidentGroup" IntroducedVersion="7.0.0.0" IsProfile="false">
      <Titles><Title LCID="1041" Title="インシデント" /></Titles>
      <SubArea Id="sub_incident" Entity="prefix_incident" AvailableOffline="true" />
    </Group>
  </Area>
  <Area Id="AdminArea" ShowGroups="true" IntroducedVersion="7.0.0.0">
    <Titles><Title LCID="1041" Title="管理者設定" /></Titles>
    <Group Id="MasterGroup" IntroducedVersion="7.0.0.0" IsProfile="false">
      <Titles><Title LCID="1041" Title="マスタデータ" /></Titles>
      <SubArea Id="sub_category" Entity="prefix_category" AvailableOffline="true" />
    </Group>
  </Area>
</SiteMap>
```

## SiteMap 自動グループ化

デプロイスクリプトはデフォルトで**パターン B（マスタ・トランザクション分離）**を自動生成する。
テーブル名から以下のルールでグループ化:

1. **マスタ系**: テーブル名に `category`, `priority`, `asset`, `master`, `type`, `status`, `location`, `department` を含む → 「マスタデータ」グループ
2. **テーマ別トランザクション**: 共通プレフィックスを持つテーブルをまとめる（例: `incident` + `incidentcomment` → 「インシデント」グループ）
3. **その他**: 独立したテーマのテーブルは独自グループ（例: `market_insight` → 「市場インサイト」グループ）

> ★ **全パターンで `ShowGroups="true"`・`IntroducedVersion="7.0.0.0"`・`<Titles>` 要素・`AvailableOffline="true"` を必ず含める。**
> これらが欠けると複数グループが正常に表示されない。
```

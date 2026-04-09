# Dataverse 統合ガイド

Dataverse は Power Platform のネイティブデータストアです。Code Apps から Dataverse に接続し、CRUD 操作を実行する方法を記載します。

---

## 目次

- [テーブル作成（GitHub Copilot 推奨）](#テーブル作成github-copilot-推奨)
- [セットアップ](#セットアップ)
- [テーブル操作（CRUD）](#テーブル操作crud)
- [Lookup フィールド](#lookup-フィールド)
- [Choice フィールド](#choice-フィールド)
- [システムフィールド](#システムフィールド)
- [スキーマ情報の取得](#スキーマ情報の取得)
- [ベストプラクティス](#ベストプラクティス)
- [トラブルシューティング](#トラブルシューティング)

---

## テーブル作成（GitHub Copilot 推奨）

Dataverse テーブルの作成は **VS Code + GitHub Copilot（GeekPowerCode エージェント + power-platform-standard スキル）** を使って会話形式で行うことを**推奨**します。Power Apps ポータル UI での手動作成よりもこちらを優先してください。

### 前提条件

1. VS Code に **GitHub Copilot** 拡張機能がインストール済みであること
2. `GeekPowerCode` エージェントと開発スキル（`.github/skills/`）がリポジトリに含まれていること
3. GitHub Copilot が有効化されていること（推奨モデル: **Claude Opus 4.6**）
3. Power Platform 環境に認証済みであること

### テーブル作成手順

GitHub Copilot Agent モードで、作成したいテーブルの要件を会話形式で伝えます:

```
# 例: GitHub Copilot への依頼
「以下の Dataverse テーブルを作成してください。

テーブル名: IT Asset（IT資産）
プレフィックス: cr_

フィールド:
- 資産名 (cr_name): テキスト, 必須
- シリアル番号 (cr_serialnumber): テキスト
- 購入日 (cr_purchasedate): 日付
- ステータス (cr_status): 選択肢 (稼働中, 修理中, 廃棄済み)
- 担当者 (cr_assignedto): Lookup → SystemUser
- 資産カテゴリ (cr_category): 選択肢 (PC, モニター, ネットワーク機器, その他)」
```

> 💡 **ポイント**: 指示が曖昧な場合、GitHub Copilot はユーザーに質問して不明点を確認します。フィールド名、データ型、リレーションシップなどの詳細を明確にしてから実装が進むため、手戻りが少なくなります。

### 注意点

以下は [検証結果の詳細ブログ記事](https://www.geekfujiwara.com/tech/powerplatform/8082/) に基づく注意点です:

- ⚠️ **既存システムテーブルとの関係**: SystemUser や BusinessUnit などの既存テーブルとのリレーションシップを設計する際は、Dataverse のデータモデルの基本知識が必要です
- ⚠️ **認証・MCP サーバー設定**: Dataverse MCP サーバーとの連携設定でエンドポイント URL や認証情報（デバイスコード認証）が正しいことを確認してください。設定ミスで連携エラーが発生しやすいです
- ⚠️ **AI 生成の設計レビュー**: AI が生成したテーブル設計は必ず人間がレビューしてください。特に日本語の表示名やデータ型が意図通りか確認が必要です
- ⚠️ **拡張機能のバージョン互換性**: VS Code / 拡張機能 / PAC CLI / SDK のバージョン互換性に注意してください

### 実務で確立した鉄則（再発防止）

以下は実際の開発で手戻りが発生した教訓から確立されたルールです:

| ルール                             | 理由（失敗事例）                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **スキーマ名は英語のみ**           | 日本語の表示名で `pac code add-data-source -a dataverse` が失敗する                                                                                  |
| **ユーザー参照は SystemUser**      | カスタムユーザーテーブルは不要で複雑化する                                                                                                           |
| **作成者・報告者は createdby**     | カスタム ReportedBy Lookup を作成→削除の手戻りが発生した                                                                                             |
| **Choice 値は 100000000 始まり**   | 0, 1, 2... はカスタム Choice では使用不可                                                                                                            |
| **テーブル作成はリトライ付き**     | 連続作成で `0x80040237` メタデータロックが発生する                                                                                                   |
| **作成順序: マスタ→主→従属**       | リレーションシップの依存関係を守らないとエラー                                                                                                       |
| **日本語ローカライズは PUT**       | PATCH/POST では DisplayName が反映されないケースがある                                                                                               |
| **MSCRM.MergeLabels: true 必須**   | ローカライズ時のリクエストヘッダーに必要                                                                                                             |
| **nameUtils.js の Unicode パッチ** | `npx power-apps add-data-source` が日本語 DisplayName で `Failed to sanitize string` 失敗する。[§1.2 参照](./POWER_PLATFORM_DEVELOPMENT_STANDARD.md) |
| **npx でデータソース追加**         | `pac code add-data-source` は SDK v1.0.x で動作しない。`npx power-apps add-data-source` を使用                                                       |

> 📖 詳細は [Power Platform コードファースト開発標準](./POWER_PLATFORM_DEVELOPMENT_STANDARD.md) を参照してください。

### UI でのテーブル作成（代替手段）

GitHub Copilot でのテーブル作成が困難な場合は、Power Apps ポータルまたは PAC CLI を代替手段として使用できます:

```bash
# PAC CLI でのソリューション作成
pac solution init --publisher-name "YourPublisher" --publisher-prefix "yp"

# Power Apps ポータルでテーブルを手動作成
# https://make.powerapps.com → テーブル → 新しいテーブル
```

---

## セットアップ

### コネクタ追加

```bash
# 推奨: npx 経由（SDK v1.0.x 対応）
npx power-apps add-data-source --api-id dataverse \
  --resource-name {table-logical-name} \
  --org-url {DATAVERSE_URL} --non-interactive

# レガシー: pac cli 経由（SDK v0.3.x のみ）
pac code add-data-source -a dataverse -t {table-logical-name}
```

> ⚠️ 日本語環境では `nameUtils.js` のパッチが必要。詳細は [開発標準 §1.2](./POWER_PLATFORM_DEVELOPMENT_STANDARD.md) を参照。

### PAC CLI によるテーブル管理

PAC CLI を使用して Dataverse テーブルをソリューション単位で管理できます:

```bash
# ソリューションの作成
pac solution init --publisher-name "YourPublisher" --publisher-prefix "yp"

# テーブルの作成・管理は GitHub Copilot（GeekPowerCode エージェント + スキル）を優先
# 代替手段として Power Apps ポータルまたは PAC CLI でも実施可能
```

---

## テーブル操作（CRUD）

### データ取得（Read）

```typescript
import { DataverseService } from "../services/DataverseService";

// 全件取得（OData フィルター付き）
const accounts = await DataverseService.GetItems(
  "accounts",
  "$select=name,revenue,createdon&$filter=statecode eq 0&$orderby=createdon desc&$top=50",
);

// 単一レコード取得
const account = await DataverseService.GetItem(
  "accounts",
  "{record-id}",
  "$select=name,revenue",
);
```

### データ作成（Create）

```typescript
const newAccount = await DataverseService.PostItem("accounts", {
  name: "新規取引先企業",
  revenue: 5000000,
  description: "Code Apps から作成",
});
```

### データ更新（Update）

```typescript
await DataverseService.PatchItem("accounts", "{record-id}", {
  revenue: 7500000,
  description: "更新済み",
});
```

### データ削除（Delete）

```typescript
await DataverseService.DeleteItem("accounts", "{record-id}");
```

---

## Lookup フィールド

Lookup フィールドは他のテーブルへの参照です。

### 読み取り時の展開

```typescript
// $expand で関連テーブルのデータを取得
const contacts = await DataverseService.GetItems(
  "contacts",
  "$select=fullname&$expand=parentcustomerid($select=name)",
);

// 結果例: contact.parentcustomerid.name で取引先名にアクセス
```

### 書き込み時の設定

```typescript
// Lookup フィールドの設定（OData バインディング）
await DataverseService.PostItem("contacts", {
  fullname: "山田太郎",
  "parentcustomerid_account@odata.bind": "/accounts({account-id})",
});
```

---

## Choice フィールド

Choice フィールドは列挙型の値を持ちます。

### 読み取り

```typescript
const items = await DataverseService.GetItems(
  "incidents",
  "$select=title,prioritycode",
);
// prioritycode は数値で返される（例: 1 = 高, 2 = 中, 3 = 低）
```

### 書き込み

```typescript
await DataverseService.PostItem("incidents", {
  title: "新規インシデント",
  prioritycode: 1, // 数値で指定
});
```

### Choice 値のマッピング例

```typescript
const priorityMap: Record<number, string> = {
  1: "高",
  2: "中",
  3: "低",
};

const priorityLabel = priorityMap[incident.prioritycode] ?? "未設定";
```

---

## システムフィールド

Dataverse テーブルには自動管理されるシステムフィールドがあります。

| フィールド      | 説明             | 読み取り | 書き込み |
| --------------- | ---------------- | -------- | -------- |
| `createdon`     | 作成日時         | ✅       | ❌       |
| `modifiedon`    | 更新日時         | ✅       | ❌       |
| `createdby`     | 作成者           | ✅       | ❌       |
| `modifiedby`    | 更新者           | ✅       | ❌       |
| `statecode`     | 状態コード       | ✅       | ⚠️       |
| `statuscode`    | ステータスコード | ✅       | ⚠️       |
| `versionnumber` | バージョン番号   | ✅       | ❌       |

> ⚠️ `statecode` と `statuscode` は特定の API を通じてのみ変更可能です。

---

## スキーマ情報の取得

### PAC CLI でのスキーマ確認

```bash
# テーブル情報の確認
pac table list

# テーブルの列情報
pac table get --name account
```

### OData メタデータ

```typescript
// EntityDefinitions を使用してスキーマ情報を取得
const metadata = await DataverseService.GetItems(
  "EntityDefinitions(LogicalName='account')/Attributes",
  "$select=LogicalName,AttributeType,DisplayName",
);
```

---

## ベストプラクティス

### パフォーマンス

- ✅ `$select` で必要なフィールドのみ取得
- ✅ `$top` で取得件数を制限
- ✅ `$filter` でサーバーサイドフィルタリング
- ❌ 全件取得してクライアントサイドでフィルタリングしない

### エラーハンドリング

```typescript
import { getConnectorErrorMessage, withRetry } from "../utils/errorHandling";

try {
  const data = await withRetry(async () => {
    return await DataverseService.GetItems("accounts", "$select=name&$top=50");
  });
} catch (err) {
  const message = getConnectorErrorMessage(err, "Dataverse 取得");
  // ユーザーにフレンドリーなエラーメッセージを表示
}
```

### 楽観的同時実行制御

更新時のコンフリクトを防止するため、`@odata.etag` を活用します。

---

## トラブルシューティング

### データソース名のエラー

PAC CLI が生成するデータソース名がコード内の参照と一致しない場合があります。
`power.config.json` の `dataSources` セクションでデータソース名を確認してください。

### 認証エラー

```
401 Unauthorized
```

PAC CLI の認証が期限切れの可能性があります:

```bash
pac auth list
pac auth create --environment {environment-id}
```

### フィールドが取得できない

- `$select` に対象フィールドが含まれているか確認
- Lookup フィールドの場合は `$expand` を使用
- フィールドのスキーマ名（論理名）が正しいか確認

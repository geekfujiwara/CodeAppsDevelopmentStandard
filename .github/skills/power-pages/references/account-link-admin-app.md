# 管理者向け紐づけ画面（Code Apps）

[SKILL.md](../SKILL.md) Step 4-G の仕様。**Account アクセスを選んだ場合には紐づけ手段が必須**で、
この画面かモデル駆動型アプリ運用のどちらかを選ぶ。

実装はゼロから書かず、アドオンテンプレート
**[code-apps/templates/account-link-admin](../../code-apps/templates/account-link-admin/)** を
`generic-base` の scaffold に重ねて使う（手順はテンプレートの README）。
以下はその画面仕様と、カスタマイズ時に崩してはいけない前提。

## 1. 位置づけ

| 方式 | 実装コスト | 使いどころ |
|---|---|---|
| モデル駆動型アプリで contact を直接編集 | ゼロ | 依頼が少ない・管理者が Dataverse に慣れている |
| 専用の Code Apps 管理画面（本ドキュメント） | 中 | 依頼が多い・情シス以外の担当者が運用する |

**この画面は Power Pages ではなく、社内向けの Code Apps（認証済み Entra ユーザー）として作る。**
ポータル側に管理機能を置くと、権限設定を一つ誤っただけで利用者が他社を紐づけられてしまう。

## 2. 画面構成

### 2.1 依頼一覧（既定タブ）

- データソース: `{prefix}_accountlinkrequest`
- 既定フィルター: `{prefix}_status eq 100000000`（未対応）
- 表示列: 依頼日時 / 依頼者氏名 / 依頼者メール / 申告会社名 / ステータス
- 並び順: `createdon desc`
- 行クリックで詳細パネルを開く

### 2.2 詳細パネル（紐づけ操作）

| 要素 | 内容 |
|---|---|
| 依頼者情報 | contact の氏名・メール・現在の `parentcustomerid`（読み取り専用） |
| 取引先企業ピッカー | `account` を名前で検索するコンボボックス（必須） |
| 紐づけ実行ボタン | contact を PATCH → 依頼を「対応済み」に更新 |
| 却下ボタン | 依頼を「却下」に更新し、理由を `{prefix}_note` に記録 |

### 2.3 手動紐づけタブ（依頼なしで紐づける）

contact を検索 → account を選択 → 紐づけ。入退社対応などで使う。

## 3. 紐づけ処理

```ts
// 1) contact に取引先企業を設定
await patchRecord(`contacts(${contactId})`, {
  "parentcustomerid_account@odata.bind": `/accounts(${accountId})`,
});

// 2) 依頼を対応済みにする
await patchRecord(`${prefix}_accountlinkrequests(${requestId})`, {
  [`${prefix}_status`]: 100000001,
  [`${prefix}_note`]: note,
});
```

- `parentcustomerid` は顧客（customer）型なので、バインド時は
  `parentcustomerid_account@odata.bind`（アカウント側のナビゲーションプロパティ）を使う。
  `parentcustomerid@odata.bind` だけでは型が特定できずエラーになることがある。
- 2 つの PATCH はまとめて 1 つの処理として扱い、1) が失敗したら 2) を実行しない。

## 4. セキュリティ要件

- 画面へのアクセスは Entra のセキュリティグループで制限し、Dataverse 側でも
  管理者用のセキュリティロールでのみ contact の書き込みを許可する
  （画面を隠すだけでは防御にならない）。
- 紐づけ変更は**監査対象**。Dataverse の監査を `contact.parentcustomerid` 列で有効化する。
- 誰がいつ紐づけたかは `{prefix}_note` にも残す（監査ログの補助）。
- 検索結果に個人情報を過剰に表示しない。一覧に必要なのは氏名・メール・会社名まで。

## 5. 実装手順

1. code-apps スキルで新規アプリを作成する。
2. 上記 3 テーブル（`contact` / `account` / `{prefix}_accountlinkrequest`）をデータソースに追加する。
3. 一覧・詳細パネルを実装する。
4. 紐づけ後に Power Pages 側で反映を確認する（サイト再起動は不要。権限ではなくデータの変更のため）。

# account-link-admin — 取引先企業の紐づけ管理画面（アドオンテンプレート）

Power Pages の **Account アクセス**（[power-pages スキル](../../../power-pages/SKILL.md) Step 4）を選んだときに必要になる、
アプリ管理者が `contact` に `account`（取引先企業）を割り当てるための最小画面。

**これは単体プロジェクトではなく、[generic-base](../generic-base/) の上に重ねる差分ファイル一式**。
ポータル利用者に取引先企業を選ばせるのは権限昇格になるため、紐づけは必ずこの管理画面（社内向け Code App）で行う。

## 含まれるファイル

| ファイル | 役割 |
|---|---|
| `src/lib/dataverse-client.ts` | `MicrosoftDataverseService` の薄いラッパー（`*WithOrganization` 固定） |
| `src/services/account-link-service.ts` | 依頼一覧・contact 取得・account 検索・紐づけ・却下 |
| `src/hooks/use-account-link.ts` | 上記を包む TanStack Query の hook |
| `src/pages/account-link.tsx` | 依頼一覧＋紐づけ操作パネル（1 画面） |

## 前提

- Dataverse に依頼テーブル `{prefix}_accountlinkrequest` が作成済み
  （列定義は power-pages スキルの
  [紐づけ依頼メールフロー](../../../power-pages/references/account-link-request-flow.md)）。
- Power Pages 側の権限は `setup_access_scope.py --scope account` と
  `setup_account_link_request.py` で構成済み。

## 導入手順

1. generic-base で scaffold したプロジェクトに、このフォルダの `src/` を上書きコピーする。

2. Dataverse データソースを 1 回だけ追加する（未実施の場合）。

   ```bash
   npx power-apps add-data-source --api-id shared_commondataserviceforapps \
     -cr {CONNECTION_REFERENCE_LOGICAL_NAME} \
     -s {SOLUTION_ID} \
     --resource-name commondataserviceforapps \
     --org-url {DATAVERSE_URL} \
     --non-interactive
   ```

3. `.env` にパブリッシャープレフィックスを設定する。

   ```env
   VITE_PUBLISHER_PREFIX={prefix}
   ```

4. `src/router.tsx` にルートを追加する。

   ```tsx
   const AccountLink = lazy(() => import("@/pages/account-link"))
   // children に追加
   { path: "account-link", element: <Suspense fallback={null}><AccountLink /></Suspense> },
   ```

5. `src/config.ts` のナビゲーションに追加する。

   ```ts
   const coreItems: NavItem[] = [
     { key: "dashboard", label: "ダッシュボード", path: "/dashboard" },
     { key: "accountLink", label: "取引先企業の紐づけ", path: "/account-link" },
   ]
   // ICON_MAP にも同じ key で { accountLink: Building2 } のようにアイコンを登録する
   ```

## 実装上の注意

- `parentcustomerid` は顧客（customer）型のため、書き込みは
  **`parentcustomerid_account@odata.bind`**（アカウント側のナビゲーションプロパティ）で行う。
  `parentcustomerid@odata.bind` だけでは型が特定できずエラーになることがある。
- 紐づけは「contact の更新 → 依頼の対応済み更新」の順に実行し、前段が失敗したら後段を実行しない
  （`linkContactToAccount()` に実装済み）。
- 申告された会社名は**自己申告**であり、これを根拠に自動紐づけしない。名簿と突き合わせて判断する。
- Lookup の表示名はサービスが返さないため、`OData.Community.Display.V1.FormattedValue` 注釈で解決している
  （読み取り時の `Prefer: odata.include-annotations="*"` が前提）。

## セキュリティ

- このアプリの共有は Entra のセキュリティグループで限定し、Dataverse 側でも
  管理者用セキュリティロールでのみ `contact` の書き込みを許可する（画面を隠すだけでは防御にならない）。
- `contact.parentcustomerid` 列の監査を有効化し、誰がいつ紐づけたかを追跡できるようにする。
- 一覧に表示する個人情報は氏名・メール・会社名までに留める。

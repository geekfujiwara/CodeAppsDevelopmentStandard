# Code Apps トラブルシューティング

Code Apps（TypeScript + React）開発で頻出する問題と対処法。

> 参考: このリファレンスは [Code Apps スキル一覧](../SKILL.md) から参照する想定です。関連資料や他のリファレンスは `SKILL.md` の冒頭一覧から確認できます。

---

## 1. Dataverse フィルターで GUID にシングルクォートを付けてはいけない

### 症状

`retrieveMultipleRecordsAsync` のフィルターでレコードが 0 件返る。エラーは出ない。

### 原因

Code Apps SDK の OData フィルターでは、GUID 値を文字列としてシングルクォートで囲むと一致しない。
Dataverse Web API / Code Apps SDK では、GUID 比較は **`eq guid-value`（クォートなし）** の形式で書くのが適切。
`eq 'guid-value'` のような書き方は GUID を文字列比較しているように見えやすく、Code Apps SDK では期待どおり動作しない。

### 例

```typescript
// ❌ レコードが返らない
filter: `_parentaccountid_value eq '${accountId}'`

// ✅ 正しい構文
filter: `_parentaccountid_value eq ${accountId}`
```

### 影響範囲

すべてのルックアップ列フィルター（`_xxx_value eq ...`）に共通。
`retrieveMultipleRecordsAsync` / `retrieveRecordAsync` 両方に適用される。

---

## 2. power.config.json の未使用 connectionReferences でデプロイ 400 エラー

### 症状

`pac code push` / `npx power-apps push` で HTTP 400 エラー。

### 原因

`power.config.json` の `connectionReferences` に、環境に存在しない接続参照
（削除済みフロー・Copilot Studio コネクタ等）が残っている。

### 対処

```jsonc
// power.config.json — 使用していない connectionReferences を削除
{
  "connectionReferences": {
    // ❌ 存在しないフロー接続 → 削除する
    // "workflowDetails": { ... }
  }
}
```

### 予防

コネクタやフローを削除した後は、`power.config.json` の `connectionReferences` から
対応エントリを手動削除すること。

---

## 3. pac code push のテレメトリエラーは無視可能

### 症状

デプロイ後に以下のエラーが出力される:
```
CliLogger: failed to initialize OneDS telemetry writer Error: Network request failed
```

### 判断基準

`App pushed successfully` が出力されていればデプロイは成功。
テレメトリ初期化のタイムアウトは pac CLI 内部の telemetry 送信の問題であり、アプリには影響しない。

---

## 4. OData FormattedValue でルックアップ表示名を取得する

### 課題

ルックアップ列（`_ownerid_value` 等）の ID だけでは表示名がわからない。
追加クエリで `systemuser` テーブルを引くのは N+1 問題になる。

### 解決策

`select` にルックアップ列名を含めると、SDK が自動的に OData アノテーションを返す。

```typescript
const result = await client.retrieveMultipleRecordsAsync(
  "opportunities",
  {
    select: ["opportunityid", "name", "_ownerid_value"],  // ← ルックアップ列を含める
    filter: `_parentaccountid_value eq ${accountId}`,
  },
);

const record = result.data[0];

// 表示名の取得
const ownerName = record["_ownerid_value@OData.Community.Display.V1.FormattedValue"];
// → "山田 太郎"
```

### 利用可能なアノテーション

| アノテーション | 内容 |
|---|---|
| `@OData.Community.Display.V1.FormattedValue` | ルックアップ先の表示名 |
| `@Microsoft.Dynamics.CRM.lookuplogicalname` | ルックアップ先のテーブル論理名 |

### 型定義の注意

TypeScript の interface にアノテーション付きプロパティを含める場合:
```typescript
export interface Opportunity {
  opportunityid: string;
  name: string;
  _ownerid_value?: string;
  "_ownerid_value@OData.Community.Display.V1.FormattedValue"?: string;
}
```

---

## 5. MDA レコードフォームへのリンク URL パターン

### 用途

Code Apps から Dynamics 365 / モデル駆動型アプリのレコードフォームを開くリンクを生成する。

### URL パターン

```
https://{org}.crm7.dynamics.com/main.aspx?pagetype=entityrecord&etn={entityLogicalName}&id={recordId}
```

### エンティティ論理名の対応表

| 表示名 | 論理名 |
|---|---|
| 取引先企業 | `account` |
| 営業案件 | `opportunity` |
| 提案製品 | `opportunityproduct` |
| サポート案件 | `incident` |
| 作業指示書 | `msdyn_workorder` |
| 顧客資産 | `msdyn_customerasset` |
| IoT アラート | `msdyn_iotalert` |
| 機能の場所 | `msdyn_functionallocation` |

### 実装例

```typescript
const MDA_BASE = "https://{org}.crm7.dynamics.com/main.aspx";

function getMdaUrl(entityLogicalName: string, recordId: string): string {
  return `${MDA_BASE}?pagetype=entityrecord&etn=${entityLogicalName}&id=${recordId}`;
}
```

> **Note**: `appid` パラメータを省略すると、ユーザーのデフォルト MDA で開く。
> 特定のアプリで開きたい場合は `&appid={app-guid}` を追加する。

---

## 6. Radix ScrollArea が flex-1 だけではスクロールしない

### 症状

`ScrollArea` に `flex-1` を指定しているのに、コンテンツがはみ出してもスクロールバーが表示されない。
コンテンツが見切れる。

### 原因

Radix ScrollArea は **高さが確定していないとスクロールが有効にならない**。
`flex-1` だけでは `min-height: auto`（コンテンツの自然高さ）が適用され、
ScrollArea はコンテンツ全体の高さまで膨張してしまう。

### 解決策

`h-0` を `flex-1` と併用する。`h-0` で min-height を 0 にリセットし、
flex-grow で親の余剰スペースに伸縮させることで、高さが確定しスクロールが有効になる。

```tsx
// ❌ スクロールが効かない
<div className="flex flex-col h-full">
  <div className="shrink-0">ヘッダー</div>
  <ScrollArea className="flex-1">
    <div>長いコンテンツ...</div>
  </ScrollArea>
</div>

// ✅ スクロールが正しく動作
<div className="flex flex-col h-full">
  <div className="shrink-0">ヘッダー</div>
  <ScrollArea className="flex-1 h-0">
    <div>長いコンテンツ...</div>
  </ScrollArea>
</div>
```

### 親コンテナの注意

親要素にも `overflow-hidden` を指定すること。
そうしないと ScrollArea が親を超えて膨張する場合がある。

```tsx
// 右カラム: overflow-hidden で高さを制約
<div className="flex-1 flex flex-col min-w-0 overflow-hidden">
  <ChatPanel />
</div>
```

### 恒久対策（テンプレート自体に混入していた同一バグを修正済み）

`templates/generic-base/src/components/sidebar.tsx` のナビゲーション `ScrollArea` が
`className="flex-1 overflow-visible"` になっており、本項目が警告する典型的な症状（サイドバーの
メニューが多いとスクロールできず下側の項目に到達できない）を scaffold 直後から再現する状態だった。
`overflow-visible` を `h-0` に置き換えて修正済み（ツールチップは `fixed` 位置指定のため祖先の
overflow 設定に影響されず、`h-0`化後も表示に問題は出ない）。新規プロジェクトはこの修正後の
テンプレートを scaffold するため同じ不具合は再発しない。

---

## 7. 長文メッセージはトランケート+展開トグルにする

### 症状

生の HTML やメールヘッダーなど、数千文字のメッセージがチャットバブルに展開され、
レイアウトが崩壊する（横にもはみ出す）。

### 解決策

200〜300文字で省略し、「全文を表示」/「折りたたむ」トグルを付ける。

```tsx
const MSG_TRUNCATE_LEN = 200;

function MessageBubble({ text, isUser }: { text: string; isUser: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > MSG_TRUNCATE_LEN;

  return (
    <div className="rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words overflow-hidden ...">
      {isLong && !expanded ? (
        <>
          {text.slice(0, MSG_TRUNCATE_LEN)}…
          <button onClick={() => setExpanded(true)} className="text-xs ...">
            全文を表示
          </button>
        </>
      ) : (
        <>
          {text}
          {isLong && (
            <button onClick={() => setExpanded(false)} className="text-xs ...">
              折りたたむ
            </button>
          )}
        </>
      )}
    </div>
  );
}
```

### 適用場面

- Copilot Studio 会話トランスクリプトのチャット表示
- メール本文やツール呼び出し結果の表示
- JSON / HTML ペイロードの表示

---

## 8. orderBy は必ず配列で渡す（文字列不可）

### 症状

`retrieveMultipleRecordsAsync` が `{ success: false, error: {} }` を返し、
コンソールに以下のエラーが表示される:

```
Invalid operation parameters: orderBy must be an array of strings
```

### 原因

Code Apps SDK の `orderBy` パラメータは **文字列の配列** のみ受け付ける。
文字列を直接渡すとバリデーションエラーになり、クエリが実行されない。

### 例

```typescript
// ❌ 文字列 → バリデーションエラー
const result = await client.retrieveMultipleRecordsAsync(
  "opportunities",
  {
    select: ["opportunityid", "name"],
    filter: `_parentaccountid_value eq ${accountId}`,
    orderBy: "createdon desc",  // ← string はダメ
  },
);

// ✅ 配列 → 正常動作
const result = await client.retrieveMultipleRecordsAsync(
  "opportunities",
  {
    select: ["opportunityid", "name"],
    filter: `_parentaccountid_value eq ${accountId}`,
    orderBy: ["createdon desc"],  // ← string[] が必須
  },
);
```

### 補足

- 複数カラムでソートする場合: `orderBy: ["createdon desc", "name asc"]`
- TypeScript の型定義では `string[]` になっているが、コード補完時に文字列を渡しても tsc エラーにならないケースがあるため注意
- このエラーは HTTP 400 ではなく SDK 内部のバリデーションで発生するため、ネットワークタブには何も出ない

---

## 9. `$select` (select オプション) がカスタムテーブルで 0 件を返す

### 症状

`retrieveMultipleRecordsAsync` に `select` オプションを指定すると、
フィルター条件に一致するレコードが存在するにもかかわらず結果が 0 件になる。
`select` を省略すると正常にレコードが返る。

### 原因

一部のカスタムテーブル（特に Lookup 列が多い中間テーブルやリレーションテーブル）で、
Code Apps SDK が `$select` 付き OData クエリを正しく処理できないケースがある。
原因は SDK 内部の列名解決またはメタデータキャッシュに起因すると推測される。

### 影響を受けやすいテーブルの特徴

- カスタムの中間テーブル（N:N リレーション的な用途）
- Lookup 列が 3 つ以上あるテーブル
- ルックアップ値 (`_xxx_value`) をフィルター条件に使用している場合

### 回避策

```typescript
// ❌ select 指定で 0 件になる場合がある
const result = await client.retrieveMultipleRecordsAsync(
  "rcwr_resourceareapriorities",
  {
    select: ["rcwr_name", "_rcwr_resourceid_value", "_rcwr_territoryid_value"],
    filter: `_rcwr_territoryid_value eq ${territoryId} and rcwr_isactive eq true`,
    orderBy: ["rcwr_priority asc"],
  }
);

// ✅ select を省略して全列取得（確実に動作する）
const result = await client.retrieveMultipleRecordsAsync(
  "rcwr_resourceareapriorities",
  {
    filter: `_rcwr_territoryid_value eq ${territoryId} and rcwr_isactive eq true`,
    orderBy: ["rcwr_priority asc"],
  }
);
```

### 注意

- `select` を省略すると全列が返るため、レスポンスサイズが大きくなる。
  レコード数が少ないマスタ系テーブルでは問題にならないが、
  トランザクション系テーブルでは `top` と併用してレコード数を制限する。
- **標準テーブル**（`bookableresourcebookings` 等）では `select` が正常に動作する。
  問題が起きるのは主にカスタムテーブル。

---

## 10. pac code add-data-source が日本語 DisplayName で「Failed to sanitize string」エラー

### 症状

```
Failed to update database references: Failed to sanitize string 顧客一覧
```

`patch-nameutils.cjs` を適用し、`node -e` で検証しても PAC CLI で同じエラーが再現する。

### 原因

`patch-nameutils.cjs` は `node_modules/@microsoft/power-apps-actions/` 内の `nameUtils.js` を修正するが、
**`pac code add-data-source` は PAC CLI 内蔵の .NET ランタイム経由で別の `nameUtils.js` を実行する**。
PAC CLI の `.stage` ディレクトリ配下には複数バージョンが存在し、パッチの到達が不確実。

### 対処: テーブル表示名を一時的に英語に切り替え

```bash
# 1. API で DisplayName/DisplayCollectionName を英語に変更
python toggle_table_lang.py en

# 2. pac code add-data-source 実行
pac code add-data-source -a dataverse -t {prefix}_tablename

# 3. API で日本語に復元
python toggle_table_lang.py jp
```

### 前提

- `auth_helper.py` が設定済み（Dataverse API 認証）
- `toggle_table_lang.py` にプロジェクトのテーブル定義を記述済み

### 備考

- `npx power-apps add-data-source` が正常に使える環境ではこの問題は発生しない
  （`patch-nameutils.cjs` で解決できる）
- この問題が起きるのは `npx power-apps` がテナント不一致で使えず `pac code` を
  使わざるを得ない環境のみ

---

## 11. `pac code add-data-source` のサービスファイル生成（検証済 2026-06-15 — 修正）

### 2026-06-15 時点の検証結果

`pac code add-data-source -a dataverse -t {table}` は **フル生成**（Model + Service + index.ts）を行う。
以前のバージョンでは最小構成のみだった可能性があるが、現行版では `npx power-apps add-data-source` と同等の生成物が得られる。

### 生成されるファイル（pac code / npx power-apps 共通）

| ファイル | 生成 |
|---|---|
| `.power/schemas/dataverse/*.Schema.json` | ✅ |
| `.power/schemas/appschemas/dataSourcesInfo.ts` | ✅ |
| `src/generated/models/CommonModels.ts` | ✅ |
| `src/generated/models/{Table}Model.ts` | ✅ |
| `src/generated/services/{Table}Service.ts` | ✅ |
| `src/generated/index.ts` | ✅ |

### 推奨: 自前 DataverseService ラッパーの使用

生成された Service クラス（`Inv_productsService.create(...)` 等）はそのまま使えるが、
汎用 CRUD ラッパーを 1 ファイルで管理する方が TanStack React Query との統合が容易。
→ 詳細テンプレート: **build-reference.md Step 6**

---

## 12. `npx power-apps add-data-source` がテナント不一致で 403 エラー

### 症状

```
Error: Request failed with status code 403
```

`--org-url` を指定しても解消しない。内部トークンが別テナント（Power Platform 内部テナント `bffa0856...` 等）に向いている。

### 原因

`npx power-apps add-data-source` は PAC CLI とは**独立した認証コンテキスト**を持つ。
`pac auth create` で正しいテナントに認証していても、`npx power-apps` の内部キャッシュは別テナントのトークンを保持し続ける場合がある。

### 対処

```bash
# キャッシュ済みアカウントとアクティブアカウントを確認
npx power-apps auth-status

# 対象テナントのアカウントへ明示的に切り替える
npx power-apps auth-switch --account user@contoso.com

# 破壊的操作の前に、対象環境を読み取れることを確認
npx power-apps list-connections --environment-id {ENVIRONMENT_ID} --json
```

`logout` は全アカウントのキャッシュを削除するため、テナント切り替えには使わない。
切り替え後も解消しない場合に限り、移行時の代替手段として `pac code add-data-source` を使用する。
その場合、日本語サニタイズ問題には `toggle_table_lang.py` を適用する。

### CLI 0.13.0 での検証結果（2026-07-31）

- `auth-status` はキャッシュ済みアカウントとアクティブ状態を表示する。
- `auth-switch --account {UPN}` は他の npm CLI コマンドが使うアカウントを変更する。
- 非対話モードでは `--account` が必須。省略時の対話選択に依存しない。
- 実テナントでの最終確認は、切り替え後の `list-connections` が対象環境を返すことを確認してから `push` / `add-data-source` を実行する。

### 複数テナント切り替えの実測（2026-08-03）

CLI 0.13.0 のキャッシュに異なる2テナントのアカウントがある状態で、次を確認した。

1. `auth-status --json` は両アカウントを返し、片方だけを `isActive: true` と表示した。
2. 非アクティブ側を `auth-switch --account {UPN} --non-interactive --json` で指定すると、直後の `auth-status` で active が切り替わった。
3. 元の UPN を同じコマンドで指定すると active が復元された。

この検証では対象環境 ID が保存されていなかったため、環境を変更する `push` / `add-data-source` は実行していない。
実案件では上記の読み取り確認を挟み、対象環境とアカウントの組み合わせを確認してから実行する。

### 教訓

`npx power-apps` と `pac code` は認証基盤が異なる:
- `npx power-apps`: npm パッケージ独自のトークンキャッシュ（制御困難）
- `pac code`: PAC CLI 認証プロファイル（`pac auth list` で確認可能）

---

## 13. テンプレートファイル削除時に `use-theme.ts` が消える

### 症状

テンプレートの不要ページを削除する際に `Remove-Item "src/hooks/*" -Force` を実行すると、
`src/hooks/use-theme.ts` も削除され、ビルドが壊れる。

```
TS2307: Cannot find module '@/hooks/use-theme'
```

### 原因

テンプレートの `src/hooks/` ディレクトリにはプロジェクト共通の `use-theme.ts` が含まれている。
ワイルドカード削除で巻き添えになる。

### 対処

テンプレートのサンプルページを削除する際は、**ファイル単位で明示的に削除**する。
`src/hooks/use-theme.ts` は保護すること（変更禁止）。

```powershell
# ✅ 正しい: 個別ファイルを指定して削除
Remove-Item "src/pages/sample-list.tsx","src/pages/sample-detail.tsx","src/pages/kanban.tsx" -Force
Remove-Item "src/types/sample.ts" -Force

# ❌ 危険: ディレクトリごとワイルドカード削除
Remove-Item "src/hooks/*" -Force
```

---

## 14. SDK `executeAsync` が CSP でブロックされる

### 症状

`add-dataverse-api` で生成したサービス（WhoAmI 等）を呼ぶと空エラーが返る。

```typescript
const result = await WhoAmIService.Execute();
// → { success: false, error: {} }
```

ブラウザコンソールに CSP 違反: `Refused to connect to '...' because it violates the document's Content Security Policy`.

### 原因

Code Apps は iframe 内で `connect-src: 'none'` の CSP が適用される。
`executeAsync` は内部で `fetch()` を使用するため CSP でブロックされる。

### 対処

**postMessage ベースの SDK メソッドのみが CSP 安全**:

| メソッド | CSP 安全 | 用途 |
|---|---|---|
| `retrieveMultipleRecordsAsync` | ✅ | 一覧取得 |
| `retrieveRecordAsync` | ✅ | 単一レコード取得 |
| `createRecordAsync` | ✅ | レコード作成 |
| `updateRecordAsync` | ✅ | レコード更新 |
| `deleteRecordAsync` | ✅ | レコード削除 |
| `executeAsync` | ❌ | カスタムアクション（CSP ブロック） |
| `fetch()` 直接 | ❌ | 全て（CSP ブロック） |

`WhoAmI` が必要な場合は `systemuser` テーブルの `azureactivedirectoryobjectid` で
SDK `getContext().user.objectId`（Entra AAD Object ID）から systemuserid をマッピングする。

---

## 15. GUID 比較でフィルタが機能しない

### 症状

Lookup 列の `_xxx_value` でフィルタしても該当レコードが返らない。

```typescript
const myRecords = allRecords.filter(r => r._ownerid_value === currentUserId);
// → 常に空配列
```

### 原因

Dataverse API は GUID を大文字小文字混在で返す（例: `A1B2c3D4-...`）。
JavaScript の `===` 比較は大文字小文字を区別するため一致しない。

### 対処

```typescript
// ✅ 正しい: toLowerCase() で統一
const myRecords = allRecords.filter(
  r => r._ownerid_value?.toLowerCase() === currentUserId.toLowerCase()
);
```

すべての GUID 比較（`_resource_value`, `_userid_value`, `systemuserid` 等）で `.toLowerCase()` を適用する。

---

## 16. 初回デプロイコマンドの選択

### 症状

`npx power-apps push` が認証エラーで失敗する。

### 原因

npm CLI のアクティブアカウントが対象環境と異なる。

### 対処

**`auth-status` → `auth-switch` → `power-apps init` → `power-apps push` の順で実行する**:

```bash
# ✅ Step 1: npm CLI の実行アカウントを対象テナントへ切り替える
npx power-apps auth-status
npx power-apps auth-switch --account user@contoso.com

# ✅ Step 2: power.config.json を生成
npx power-apps init --environment-id {ENVIRONMENT_ID} --display-name "AppName"

# ✅ Step 3: ビルド＆初回デプロイ（solution-id は GUID）
npm run build
npx power-apps push --environment-id {ENVIRONMENT_ID} --solution-id {SOLUTION_ID}

# ⚠ power.config.json が未生成だと push は失敗する
#   エラー: "power.config.json is required to push an app"
```

### 備考

- npm CLI は独自の MSAL 認証を使用するため、PAC CLI のプロファイルではなく `auth-status` で確認する
- `power-apps push` は `npm run build` の成果物（`dist/`）を Power Platform にアップロードする
- `--environment-id` でターゲット環境、`--solution-id` でソリューション GUID を指定する
- 初回デプロイ後に `power.config.json` に `appId` が追記され、2回目以降は `--solution-id` を省略可能
- npm CLI で解消できない場合のみ `pac code init` / `push` を移行時の代替手段として使う

### npm CLI 0.13.0 実デプロイ検証（2026-08-03）

`samples/geek-expense` の一時コピーを Managed Environment と既存の unmanaged solution に対して検証した。

1. `npm install` → `auth-status` → `init` で `power.config.json` を生成
2. 接続参照を指定した `add-data-source` で Dataverse 生成コードを取得
3. `npm run deploy -- --solution-id {GUID}` で predeploy、TypeScript/Vite build、初回 push が成功
4. `power.config.json` に `appId` が保存され、`list-codeapps` で同じアプリを確認
5. 続けて引数なしの `npm run deploy` を実行し、同じ app ID への反復 push が成功

実ビルドで見つかった SDK 1.2.7 の型変更（structured operation options、`IOperationResult.data`、
`executeAsync` の operation object）と Recharts 3 の optional value はサンプルへ反映済み。

---

## 17. Dataverse ルックアップ書き込み時の odata.bind 形式エラー（0x80048d19）

### 症状

`createRecordAsync` / `updateRecordAsync` で HTTP 400 エラー:
```
code: 0x80048d19
message: "Error identified in Payload provided by the user for Entity..."
```

### 原因

ルックアップ列への書き込み時に **読み取り用のプロパティ名** を使ってしまっている。

- 読み取り時: `_geek_customerid_value` （アンダースコア付き）
- 書き込み時: `geek_customerid@odata.bind` （論理名 + @odata.bind）

### 例

```typescript
// ❌ 読み取り形式で書き込もうとする → 400 エラー
const data = {
  "_geek_customerid_value@odata.bind": `/accounts(${accountId})`,
};

// ✅ 正しい書き込み形式
const data = {
  "geek_customerid@odata.bind": `/accounts(${accountId})`,
};
```

### 汎用ルール

| 操作 | プロパティ形式 | 例 |
|---|---|---|
| 読み取り（select / filter） | `_logicalname_value` | `_geek_customerid_value` |
| 書き込み（create / update） | `logicalname@odata.bind` | `"geek_customerid@odata.bind": "/accounts(guid)"` |

### 注意

- `@odata.bind` の値は **相対 URI**（`/tablename(guid)` 形式）
- 複数のルックアップ列を書き込む場合、すべてのルックアップで同じルールが適用される
- Web API ドキュメントでは `_field_value` はリードオンリーと明記されている

---

## 18. FormModal の保存ボタンが動かない — DOM 操作パターンの罠

### 症状

`FormModal` コンポーネントの保存ボタンをクリックしても、子コンポーネントの submit ロジックが発火しない。

### 失敗パターン（やってはいけない）

```typescript
// ❌ 1. hidden submit ボタン + getElementById
<button type="submit" id="hidden-submit" style={{ display: 'none' }} />
// → Radix Dialog が Portal レンダリングするため getElementById で見つからない

// ❌ 2. form.requestSubmit()
document.getElementById('my-form')?.requestSubmit()
// → 同上。Dialog 内の要素は document.body 直下の Portal にマウントされる

// ❌ 3. formId + HTMLFormElement
<form id={formId}> + <button type="submit" form={formId}>
// → React 19 + Radix Portal で form 属性の関連付けが機能しない
```

### 正解パターン: React Ref で関数を渡す

```typescript
// 親コンポーネント
const submitRef = useRef<(() => void) | null>(null);

<FormModal
  onSave={() => { submitRef.current?.() }}
>
  <MyForm submitRef={submitRef} onSubmit={handleSubmit} />
</FormModal>

// 子コンポーネント（<form> 要素は使わない）
function MyForm({ submitRef, onSubmit }) {
  const [data, setData] = useState(initialData);

  const doSubmit = () => {
    onSubmit(data);
  };

  // ref に submit 関数を登録
  submitRef.current = doSubmit;

  return (
    <div className="space-y-4">
      {/* form fields - <form> タグ不要 */}
    </div>
  );
}
```

### なぜこのパターンが正しいか

1. **Radix Dialog は Portal レンダリング** — Dialog 内のコンテンツは React ツリー外のDOMノードに配置されるため、`getElementById` / `form` 属性によるリンクが機能しない
2. **React の単方向データフロー** — DOM 操作ではなく、state と ref で制御するのが React の設計思想
3. **`<form>` 要素は不要** — ブラウザのフォーム submit イベントに依存せず、JavaScript で直接データを収集・送信する

---

## 19. ScrollArea がモーダル内でスクロールしない

### 症状

`@radix-ui/react-scroll-area`（shadcn/ui の `ScrollArea`）をモーダル内に配置しても、コンテンツが溢れた時にスクロールしない。

### 原因

ScrollArea は内部で独自のスクロールバーを描画するため、親要素の高さ計算が複雑になる。  
Flexbox レイアウト内で `flex-1` を指定しても、`min-height: 0` がないと高さが確定せずスクロールが発生しない。

### 解決策: ネイティブ overflow を使う

```tsx
// ❌ ScrollArea — モーダル内で動作しない場合が多い
<ScrollArea className="flex-1">
  <div className="px-6 py-6">{children}</div>
</ScrollArea>

// ✅ ネイティブ overflow — 確実に動作する
<div className="flex-1 overflow-y-auto min-h-0">
  <div className="px-6 py-6">{children}</div>
</div>
```

### ポイント

- `flex-1` + `min-h-0` + `overflow-y-auto` の3点セットが必須
- `min-h-0` がないと Flexbox が子要素の高さをそのまま伸ばしてしまいスクロールが発生しない
- モーダル全体を `flex flex-col max-h-[90vh]` にし、ヘッダー/フッターに `flex-shrink-0` を付ける

---

## 20. SelectTrigger がグリッドレイアウトで文字溢れする

### 症状

`SelectTrigger` がグリッドセル内で横幅を超えて拡がり、レイアウトが崩れる。選択値が長いテキストの場合にセルからはみ出す。

### 原因

shadcn/ui デフォルトの `SelectTrigger` は `w-fit` + `whitespace-nowrap` が設定されているため、  
コンテンツ幅に応じて無制限に拡がる。

### 修正

```tsx
// SelectTrigger コンポーネントの className を修正
// ❌ w-fit + whitespace-nowrap + line-clamp-1
// ✅ w-full + min-w-0 + truncate

<SelectPrimitive.Trigger
  className={cn(
    // w-full で親幅に従う
    "flex w-full items-center justify-between gap-2 ...",
    // 子要素の値テキストを truncate
    "*:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate",
    className
  )}
>
```

### ポイント

- `w-full` で親コンテナの幅に収まるようにする
- `*:data-[slot=select-value]:min-w-0` + `truncate` で値テキストを省略表示
- CSS Grid の子要素は `min-width: 0` を明示しないとオーバーフローする（Grid の仕様）

---

## 21. `createBrowserRouter` で初期画面が 404 になる（検証済 2026-05-28）

### 症状

Power Apps にデプロイ後、アプリを開くと初期画面が 404（Not Found）になる。
サイドバーのメニューをクリックするとデータは表示されるが、初回ロード時のみ 404。

### 原因

Power Apps は Code Apps を **iframe 内**の独自パス（`powerplatformusercontent.com`）でホストする。
`createBrowserRouter` は History API を使うため、ブラウザの実際のパスが `/dashboard` ではなく
Power Apps ホストのパスになり、ルーティングが一致しない。

### 対処

**`createHashRouter` を使用する**。URL フラグメント（`#/dashboard`）を使うためホストパスに依存しない。

```typescript
// ❌ Power Apps iframe 内で 404 になる
import { createBrowserRouter, Navigate } from "react-router-dom";
export const router = createBrowserRouter([...]);

// ✅ Hash ルーティングで確実に動作
import { createHashRouter, Navigate } from "react-router-dom";
export const router = createHashRouter([...]);
```

### 補足

- サイドバーの `NavLink` の `to` プロパティはそのまま（`/dashboard` 等）で動作する
- `createHashRouter` は Power Pages でも必須（同じ理由）
- ディープリンクの `basename` 設定は不要になる

## 25. Dataverse に接続できない / データが空で返る（検証済 2026-06-15）

### 症状

Power Apps にデプロイ後、アプリは表示されるがテーブルのデータが一切取得できない。
ブラウザコンソールに明確なエラーは出ず、クエリが空配列を返すか、
`TypeError: client.retrieveMultipleRecordsAsync is not a function` になる。

### 原因

`getClient()` を **引数なしで呼んでいる**。

`@microsoft/power-apps/data` の `getClient` は `dataSourcesInfo` が **必須引数**:

```typescript
// SDK 型定義（node_modules/@microsoft/power-apps/dist/data/powerAppsData.d.ts）
export declare function getClient(dataSourcesInfo: DataSourcesInfo): DataClient;
```

引数なしだと SDK がデータソース情報を持たず、Power Apps ランタイムとの postMessage 通信が確立されない。

### 原因パターン

**パターン A**: `vite-env.d.ts` に手動で `declare module "@microsoft/power-apps/data"` を書いている

```typescript
// ❌ vite-env.d.ts で SDK の型を上書きしてしまう
declare module "@microsoft/power-apps/data" {
  interface PowerAppsClient {
    get(url: string): Promise<Response>;
    post(url: string, options?: RequestInit): Promise<Response>;
  }
  export function getClient(): PowerAppsClient;  // ← 引数なしで定義
}
```

→ TypeScript が SDK の正式な `.d.ts` より `vite-env.d.ts` を優先し、`getClient()` が引数なしで型チェックを通ってしまう。
→ 実行時に `DataClient` ではなく `undefined` が返り、Dataverse に接続不可。

**パターン B**: 古いドキュメントのコードをそのまま使用

```typescript
// ❌ 旧パターン: 引数なし + 生 HTTP メソッド
const client = getClient();
const result = await client.get(`inv_products?$select=inv_name`);
```

→ `DataClient` には `get` / `post` / `patch` メソッドは存在しない。
→ SDK 公式の `retrieveMultipleRecordsAsync` / `createRecordAsync` 等を使用すること。

### 対処

**① `vite-env.d.ts` から SDK 手動型宣言を削除:**

```typescript
// ✅ CSS モジュール宣言のみ残す
declare module "*.css" {
  const content: string;
  export default content;
}
```

**② `dataverse-service.ts` で `getClient(dataSourcesInfo)` を使用:**

```typescript
import { getClient } from "@microsoft/power-apps/data";
import type { IOperationOptions } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";

const client = getClient(dataSourcesInfo);

export const DataverseService = {
  async GetItems<T>(dataSourceName: string, options?: IOperationOptions): Promise<T[]> {
    const result = await client.retrieveMultipleRecordsAsync<T>(dataSourceName, options);
    if (!result.success) throw result.error;
    return result.data ?? [];
  },
  // CreateItem, UpdateItem, DeleteItem も同様
};
```

**③ Hook で OData 文字列ではなく IOperationOptions オブジェクトを使用:**

```typescript
// ❌ OData クエリ文字列
DataverseService.GetItems("inv_products", "$select=inv_name&$orderby=inv_name asc");

// ✅ IOperationOptions オブジェクト
DataverseService.GetItems<Product>("inv_products", {
  select: ["inv_productid", "inv_name"],
  orderBy: ["inv_name asc"],
});
```

---

## 15. サイドバーの幅がページ遷移で崩れる（検証済 2026-05-28）

### 症状

サイドバーのメニューをクリックすると、サイドバーの幅が不安定に変化する。
ページによってはサイドバーが極端に狭くなったり広がったりする。

### 原因

サイドバーが Flex レイアウト内に固定幅なしで配置されている場合、
コンテンツの量に応じて flex アイテムとして伸縮してしまう。

### 対処

**サイドバーを `fixed` ポジション + 固定幅（`w-64`）にする。**
メインコンテンツは `ml-64` でサイドバー分のオフセットを確保する。

```tsx
// ❌ flex 内に幅指定なしで配置 → ページ遷移で幅が崩れる
<div className="flex flex-1">
  <Sidebar />
  <div className="flex-1">
    <Outlet />
  </div>
</div>

// ✅ fixed + 固定幅 → 安定したレイアウト
<aside className={cn(
  "fixed top-16 bottom-0 z-40 flex flex-col border-r border-border bg-background transition-all duration-300 overflow-y-auto",
  isCollapsed ? "w-16" : "w-64",
)}>
  <nav>...</nav>
</aside>

<div className={cn(
  "flex-1 flex flex-col transition-all duration-300",
  isCollapsed ? "md:ml-16" : "md:ml-64"
)}>
  <Outlet />
</div>
```

### ポイント

- `fixed` にすることでフロー外に配置され、メインコンテンツの幅計算に影響しない
- 折りたたみ時は `w-16`（アイコンのみ表示）
- モバイル時はオーバーレイ + スライドイン（`-left-64 md:left-0`）
- メインコンテンツは `md:ml-64` / `md:ml-16` で左マージンを付ける

---

## 16. `useMutation` の `onSuccess` で変数を参照できない（検証済 2026-05-28）

### 症状

`useMutation` の `onSuccess` コールバック内で mutation に渡した変数（ID 等）にアクセスできず、
`undefined` エラーやキャッシュ無効化が不正確になる。

### 原因

`onSuccess` の第1引数は mutation の**レスポンスデータ**であり、入力変数ではない。
入力データ（送信した ID やペイロード）は第2引数 `variables` で取得する。

### 対処

```typescript
// ❌ 第1引数だけ使おうとして variables にアクセスできない
useMutation({
  mutationFn: ({ id, data }) => updateRecord(id, data),
  onSuccess: (result) => {
    // result は API レスポンス。id が取れない
    queryClient.invalidateQueries({ queryKey: ["record", result.id] }); // undefined!
  },
});

// ✅ 第2引数 variables で入力データにアクセス
useMutation({
  mutationFn: ({ id, data }: { id: string; data: UpdateInput }) => updateRecord(id, data),
  onSuccess: (_data, variables) => {
    queryClient.invalidateQueries({ queryKey: ["record", variables.id] });
  },
});
```

### `onSuccess` コールバックの引数

| 引数 | 型 | 内容 |
|---|---|---|
| 第1引数 `data` | `TData` | `mutationFn` の戻り値（API レスポンス） |
| 第2引数 `variables` | `TVariables` | `mutate()` に渡した入力データ |
| 第3引数 `context` | `TContext` | `onMutate` が返した値（楽観的更新用） |

---

## 17. Power Apps プラットフォームのコンソール警告は無視してよい

### 症状

Power Apps 上でアプリを開くとブラウザコンソールに以下のような警告が大量に表示される:

```
Warning: React.createElement: type is invalid -- expected a string or a class/function...
Warning: componentWillReceiveProps has been renamed, and is not recommended for use...
```

### 原因

これらは Power Apps ホストシェル（`es6.webplayer-host-ui.js` / `@fluentui` コンポーネント）から
出力されるものであり、**自アプリのコードが原因ではない**。

### 判断基準

| ソース | 対応 |
|---|---|
| `es6.webplayer-host-ui.js` / `powerapps-client.js` | ✅ 無視 |
| `@fluentui/react` / `office-ui-fabric-react` | ✅ 無視（Power Apps シェル由来） |
| 自アプリの chunk（`index-xxx.js`） | ❌ 調査必要 |

### 対処

ブラウザ DevTools のコンソールフィルタでソースを確認する。
Power Apps プラットフォーム由来の警告はアプリの動作に影響しないため修正不要。

---

## 18. cmdk (Combobox) の `onSelect` が値を小文字化する

### 症状

shadcn/ui の `Combobox`（内部で cmdk ライブラリを使用）で、選択した値が小文字に変換される。
大文字小文字が混在する ID やスキーマ名でフィルタが一致しなくなる。

### 原因

cmdk ライブラリの `CommandItem` の `onSelect` コールバックは、
内部で `value.toLowerCase()` を適用した値を引数として渡す。

```tsx
// ❌ callback arg は小文字化されている
<CommandItem
  value="MyAgent_Schema"
  onSelect={(val) => {
    // val === "myagent_schema" ← 小文字化されている！
    onValueChange(val);
  }}
/>
```

### 解決策

コールバック引数を使わず、`options` 配列から元の `value` を参照する。

```tsx
// ✅ option.value をそのまま使う
<CommandItem
  value={option.value}
  onSelect={() => {
    onValueChange(option.value);  // ← 元の大文字小文字を保持
  }}
/>
```

### 影響範囲

- `src/components/ui/combobox.tsx` の `onSelect` ハンドラ
- Combobox を使用しているすべてのページ（エージェント選択、テリトリー選択等）
- Dataverse のスキーマ名は大文字小文字混在（例: `geek_MyAgent`）のため、この問題を踏みやすい

---

## 19. 連続文字列（HTML / URL）が `break-words` で折り返せない

### 症状

ユーザーが HTML コードや長い URL を入力した場合、チャットバブルやテーブルセルから
テキストがはみ出す。`whitespace-pre-wrap` + `break-words` を指定しても効果がない。

### 原因

`overflow-wrap: break-word`（Tailwind の `break-words`）は、
**単語の区切り（スペース）がある前提** で折り返しを行う。
`<div class="very-long-unbroken-html-string-without-spaces">` のように
スペースが一切ないテキストでは折り返されない。

### 解決策

`break-all` + `overflow-hidden` + `min-w-0` の 3 点セットを使う。

```tsx
// ❌ スペースのない長文が折り返されない
<div className="whitespace-pre-wrap break-words">
  {longUnbrokenText}
</div>

// ✅ 任意の位置で折り返し + はみ出し防止
<div className="whitespace-pre-wrap break-all overflow-hidden min-w-0">
  {longUnbrokenText}
</div>
```

### 各クラスの役割

| クラス | 役割 |
|---|---|
| `break-all` | 単語の途中でも折り返す（`word-break: break-all`） |
| `overflow-hidden` | はみ出したコンテンツを非表示にする（安全弁） |
| `min-w-0` | flex 子要素のデフォルト `min-width: auto` をリセット。これがないと flex コンテナがコンテンツ幅まで広がる |

### 適用場面

- チャットメッセージバブル（ユーザー入力に HTML/URL が含まれうる場合）
- インラインテーブルのテキストセル
- ツール呼び出し結果の表示パネル

---

## 22. デプロイ後にアセット（CSS / JS / フォント）が 404 になる（検証済 2026-06-15）

### 症状

`pac code push` / `npx power-apps push` でデプロイ後、アプリを開くと白画面。
ブラウザの DevTools ネットワークタブで CSS・JS・フォントファイルがすべて 404。

### 原因

`vite.config.ts` に `base: "./"` が未設定。デフォルトの `base: "/"` では、
ビルド出力の HTML が `/assets/index-xxx.js` のようなルート相対パスでアセットを参照する。
Power Apps はアプリを `powerplatformusercontent.com` の深いサブディレクトリでホストするため、
ルート相対パスでは正しいファイルに到達できない。

### 対処

```typescript
// vite.config.ts
export default defineConfig({
  base: "./",  // ← 必須: 相対パスでアセットを参照
  // ...
})
```

### 確認方法

ビルド後に `dist/index.html` を開き、`<script>` と `<link>` のパスを確認する。

```html
<!-- ❌ base 未指定 → ルート相対パス → 404 -->
<script type="module" src="/assets/index-xxx.js"></script>

<!-- ✅ base: "./" → 相対パス → 正しく解決 -->
<script type="module" src="./assets/index-xxx.js"></script>
```

→ 詳細: [ビルドリファレンス Step 2](build-reference.md)

---

## 23. `@microsoft/power-apps` の `Failed to resolve module specifier` エラー（検証済 2026-06-15）

### 症状

デプロイ後、ブラウザコンソールに以下のエラーが表示されアプリが起動しない:

```
Uncaught TypeError: Failed to resolve module specifier "@microsoft/power-apps".
Relative references must start with either "/", "./", or "../".
```

### 原因

`vite.config.ts` の `rollupOptions.external` に `@microsoft/power-apps` が含まれている。
`external` に指定されたパッケージはバンドルに含まれず、ビルド出力に
`import { getClient } from "@microsoft/power-apps/data"` のようなベアモジュール指定子が残る。
ブラウザはインポートマップなしではベアモジュール指定子を解決できない。

### 対処

```typescript
// vite.config.ts
build: {
  rollupOptions: {
    // ❌ @microsoft/power-apps を external にしてはならない
    // external: ["@microsoft/power-apps"],

    output: {
      manualChunks: (id) => {
        if (id.includes('node_modules')) {
          // ✅ @microsoft/power-apps は vendor に含める
          return 'vendor'
        }
      },
    },
  },
},
```

### 補足

`@microsoft/power-apps` はルートエクスポート（`"."`）を提供していない。
インポートは必ずサブパスを指定する:

```typescript
// ❌ ビルドエラー: "." is not exported
import { getClient } from "@microsoft/power-apps";

// ✅ サブパスインポート
import { getClient } from "@microsoft/power-apps/data";
import { getContext } from "@microsoft/power-apps/app";
```

→ 詳細: [ビルドリファレンス Step 2](build-reference.md)

---

## 24. WOFF2 フォントが Power Apps ストレージプロキシで破損する（検証済 2026-06-15）

### 症状

デプロイ後、ブラウザコンソールに以下の警告が表示される:

```
Failed to decode downloaded font: .../assets/geist-latin-wght-normal-xxx.woff2
OTS parsing error: Size of decompressed WOFF 2.0 is less than compressed size
```

テキストは表示されるが、カスタムフォント（Geist 等）がフォールバックフォントに置き換わる。

### 原因

Power Apps のストレージプロキシ（`powerplatformusercontent.com/powerapps/appruntime/.../storageproxy/...`）が
WOFF2 バイナリファイルを配信する際に、Content-Encoding やバイナリ処理の不整合でファイルが破損する場合がある。

### 対処

1. **システムフォントを使う（推奨）**: カスタム WOFF2 フォントの代わりに OS 標準フォントを使用する。

```css
/* index.css — システムフォントスタック */
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, "Noto Sans JP", sans-serif;
}
```

2. **CDN フォントを使う**: Google Fonts 等の CDN から読み込む（CSP の `font-src` 追加が必要）。

3. **許容する**: フォント破損は視覚的な問題のみ。アプリの機能には影響しない。ブラウザはシステムフォントにフォールバックする。

### 影響範囲

- `@fontsource/geist` 等の npm フォントパッケージ
- `public/` や `assets/` に配置した `.woff2` / `.woff` ファイル
- `.ttf` / `.otf` でも同様の問題が発生する可能性がある

---

## 25. サンプルを流用すると `styles/index.pcss` / `plugins/plugin-power-apps.ts` が欠落しビルド失敗（検証済 2026-06-15）

### 症状

テンプレート scaffold を経ずにサンプル（`samples/geek-*`）の `src/` だけを別プロジェクトにコピーして開発を始めると、
`npm run build` が以下のいずれかで失敗する:

```
[@tailwindcss/vite:generate:build] Can't resolve '../styles/index.pcss' in '.../src'
```

```
error TS2307: Cannot find module './plugins/plugin-power-apps' or its corresponding type declarations.
```

### 原因

テンプレートが scaffold するファイルのうち、**`src/` の外にあるファイルがコピー漏れする**。

| ファイル | 参照元 | 役割 |
|---|---|---|
| `styles/index.pcss` | `src/index.css` の `@import "../styles/index.pcss"` | Tailwind v4 テーマ（CSS Variables 一式） |
| `plugins/plugin-power-apps.ts` | `vite.config.ts` の `import { powerApps, POWER_APPS_CORS_ORIGINS } from "./plugins/plugin-power-apps"` | Vite 開発サーバー用プラグイン（**`apply: "serve"` の dev 専用**） |

`plugin-power-apps.ts` は `apply: "serve"` のため**本番ビルドの実行には不要**だが、
`vite.config.ts` の `import` 文がトップレベルにあるため、ファイルが存在しないとビルドが起動しない。

### 対処

1. **正攻法**: テンプレートから scaffold し、含まれる `styles/` と `plugins/` を残したまま `src/` を実装する
   （サンプルをそのまま出発点にしない → [新規テーマ開始チェックリスト](new-theme-checklist.md)）。
2. **既にサンプルを流用してしまった場合**: 不足ファイルをサンプルから補完する。
   - `styles/index.pcss` … 任意のサンプル（`samples/geek-*/styles/index.pcss`）からコピーし、配色を調整
   - `plugins/plugin-power-apps.ts` … 任意のサンプル（`samples/geek-*/plugins/plugin-power-apps.ts`）からコピー（中身は全テーマ共通）

### 予防

テンプレートが scaffold するインフラは `src/` だけではない。
プロジェクト直下の **`styles/` `plugins/` `vite.config.ts` `index.html`** も含めて一式で扱う。

---

## 26. `DataSourcesInfo` 型は `@microsoft/power-apps` からエクスポートされない（検証済 2026-06-15）

### 症状

`src/lib/dataSourcesInfo.ts` を手書きする際に型注釈を付けようとすると、import がすべて失敗する:

```
error TS2307: Cannot find module '@microsoft/power-apps' ...          // ルート import
error TS2305: Module '"@microsoft/power-apps/data"' has no exported member 'DataSourcesInfo'.
```

### 原因

`@microsoft/power-apps`（v1.2.2）は **`DataSourcesInfo` という型を公開エクスポートしていない**。
`/data` サブパスが公開するのは `getClient` / `IOperationOptions` / `IOperationResult` / `DataClient` のみ。
内部型（`IDataSourceInfo` 等）は `internal/...` にあり、公開 API として import すべきではない。

### 対処（推奨）: 生成ファイルをそのまま re-export する

`src/lib/dataSourcesInfo.ts` で型を手書きせず、SDK が生成した `dataSourcesInfo` を再エクスポートする。
型は生成オブジェクトから推論されるため、手書きの型注釈は不要。

```typescript
// src/lib/dataSourcesInfo.ts
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";

export default dataSourcesInfo;
```

フロー/コネクタや SDK で追加できないテーブルを足す場合のみ spread する:

```typescript
import { dataSourcesInfo as powerInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";

export default {
  ...powerInfo,
  // SDK の add-data-source で追加できなかったテーブル/コネクタのみここに足す
};
```

### どうしても型注釈が必要な場合

`getClient` の引数型から導出する（公開 API の範囲で完結する）:

```typescript
import { type getClient } from "@microsoft/power-apps/data";
type DataSourcesInfo = Parameters<typeof getClient>[0];
```

→ 関連: [データソースパターン](data-source-patterns.md)

## 27. カラムの多い一覧がページ全体からはみ出す（ページ番号ボタン氾濫 + 横スクロール未格納）（検証済 2026-07-29）

### 症状

`ListTable` を使う一覧画面（列数が多い・件数が多い）で、次の 2 つの見た目崩れが同時に起きる。

1. 総ページ数ぶんの番号ボタン（`1 2 3 ... 30` 等）が全部並び、ページネーション行がカード幅からはみ出す。
2. カラム数が多くテーブルの内容幅が画面幅を超えると、テーブル内で横スクロールする代わりに**ページ全体**が横に伸びてしまう（ヘッダー・サイドバーごと横スクロールが発生する、またはレイアウトが崩れる）。

### 原因

1. `list-table.tsx` のページネーションが `Array.from({ length: totalPages }, ...)` で **全ページ番号を無条件描画**していたため、ページ数が増えるとボタン列がそのまま伸び続けていた。
2. `src/pages/_layout.tsx` のメインコンテンツ側（サイドバーと横並びの `flex` アイテム）に `min-w-0` が付いていなかった。Flex アイテムは既定で `min-width: auto` となり、中の `<table>`（`white-space: nowrap` で内容ぶん伸びる）を最小限まで縮められない。その結果、`Table` コンポーネント自身が持つ `overflow-x-auto`（`src/components/ui/table.tsx`）が効かず、はみ出しが祖先のフレックスコンテナ（＝ページ全体）まで伝播してしまう。

### 対処（恒久対策・`list-table.tsx` と `_layout.tsx` 双方に適用）

**1. ページ番号ボタンを先頭/末尾/現在ページ±1＋省略記号に限定する**（`list-table.tsx`）:

```tsx
// handlePageChange の直後に追加
const getPageNumbers = (current: number, total: number): (number | "ellipsis")[] => {
  const delta = 1
  const range: number[] = []
  const withDots: (number | "ellipsis")[] = []
  let last: number | undefined

  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i)
    }
  }
  for (const i of range) {
    if (last !== undefined) {
      if (i - last === 2) withDots.push(last + 1)
      else if (i - last > 2) withDots.push("ellipsis")
    }
    withDots.push(i)
    last = i
  }
  return withDots
}
```

```tsx
// ページ番号ボタンの描画（Array.from(...) を置き換える）
<div className="flex items-center gap-1">
  {getPageNumbers(currentPage, totalPages).map((page, idx) =>
    page === "ellipsis" ? (
      <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-muted-foreground">
        <MoreHorizontal className="h-4 w-4" />
      </span>
    ) : (
      <Button key={page} variant={currentPage === page ? "default" : "outline"} size="sm"
        onClick={() => handlePageChange(page)} className="w-8 h-8 p-0">
        {page}
      </Button>
    )
  )}
</div>
```

`lucide-react` の import に `MoreHorizontal` を追加すること。

**2. `_layout.tsx` のメインコンテンツ側フレックスチェーンに `min-w-0` を通す**:

```tsx
// ❌ min-w-0 が無いと、中の横長テーブルがページ全体を押し広げる
<div className={`flex-1 flex flex-col transition-all duration-300 relative z-0 ${isCollapsed ? 'md:ml-16' : 'md:ml-64'}`}>
  <main className="flex-1 flex flex-col overflow-visible">
    <div className="flex-1 p-6 max-w-full">
      <Outlet />
    </div>
  </main>
</div>

// ✅ min-w-0 を通すことで Table 自身の overflow-x-auto が効き、テーブル内だけで横スクロールする
<div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 relative z-0 ${isCollapsed ? 'md:ml-16' : 'md:ml-64'}`}>
  <main className="flex-1 flex flex-col min-w-0 overflow-visible">
    <div className="flex-1 min-w-0 p-6 max-w-full">
      <Outlet />
    </div>
  </main>
</div>
```

`TableHead` / `TableCell` は既定で `whitespace-nowrap` のため、`min-w-0` さえ通せば列は折り返さず、テーブルの外枠（`rounded-md border` を包む `Table` コンポーネントの `overflow-x-auto`）だけがスクロールコンテナになる。ヘッダー・サイドバーの幅は変わらない。

> **恒久対策済み**: `components/list-table.tsx` の `getPageNumbers`（ページ番号限定表示）と `pages/_layout.tsx` の `min-w-0` チェーンとして全 20 サンプルに適用済み（`scripts/_patch_table_overflow.py` で一括適用、適用後にスクリプト自体は削除）。新規スキャフォールド時もこの2点を含めること。

→ 関連: [コンポーネントカタログ](component-catalog.md#listtable-の列定義)、[プレデプロイレビュー](pre-deploy-review.md)
---

## 28. `pac code push -s` を後から付けてもソリューションに入らない（検証済 2026-06-15）

### 症状

`pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}` は成功する（`App pushed successfully`）のに、
Power Apps ポータルのソリューションにアプリが出てこない。Dataverse を直接見ても存在しない。

```
pac env fetch --xml "<fetch><entity name='canvasapp'>...</entity></fetch>"
→ canvasapps({APP_ID}) Does Not Exist
```

### 原因

Power Apps API 上のアプリの `almMode` が `Environment` になっている。
`almMode` が `Solution` に切り替わるのは **`power.config.json` の `appId` が未割当の初回 push のみ**。
既に `Environment` で作られたアプリは、後から `-s` を付けても無視される。
`pac code init` にソリューション指定オプションは無い（`-env / -n / -d / -b / -f / -a / -l / -c`）。

### 対処

- **予防（正常系）**: ソリューションを先に用意し、**最初の `pac code push` から必ず `-s {SOLUTION_NAME}` を付ける**。
- **復旧**: Power Apps ポータル → 対象ソリューション → **既存の追加 → アプリ → コード アプリ** で手動追加する
  （[Learn: ALM for code apps](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/alm)）。
  CLI での復旧手段は 2026-06 時点で存在しない。

→ 関連: [ソリューション ALM](solution-alm.md)

---

## 29. 接続参照のソリューション コンポーネント種別は 10132（検証済 2026-06-15）

### 症状

Dataverse Web API で接続参照をソリューションへ追加しようとすると失敗する。

```
AddSolutionComponent (ComponentType: 10029)
→ Cannot add CustomAPIResponseProperty ... does not exist
```

`pac` でも失敗する。

```
pac solution add-solution-component -ct 10029
→ The provided Component Type Id (10029) is not known
```

### 原因

- 接続参照（`connectionreference`）の `componenttype` は **`10132`**。`10029` は `CustomAPIResponseProperty`。
- `pac solution add-solution-component` は**数値を受け付けない**。`--componentType` には**型名**を渡す。

### 対処

```powershell
# Web API（数値）
# ComponentType: 10132, SolutionUniqueName: {SOLUTION_NAME}
python .github/skills/code-apps/scripts/setup_connection_reference.py

# pac（型名）
pac solution add-solution-component -sn {SOLUTION_NAME} -c {CONNECTION_REFERENCE_ID} -ct connectionreference
```

> `RemoveSolutionComponent` は `ComponentId` パラメータを受け付けない（`is not a valid parameter`）。
> 誤って追加した接続参照の除去はポータル（ソリューション → 対象行 → 削除 → このソリューションから削除）で行う。

→ 関連: [ソリューション ALM](solution-alm.md)

---

## 30. `npx power-apps` と `pac` は認証キャッシュが別（更新 2026-07-31）

### 症状

`pac auth list` では正しい環境にサインイン済みなのに、npm CLI 側だけ失敗する。

```
npx power-apps list-connections
→ ServiceToServiceEnvironmentNotFound / 403
```

### 原因

`@microsoft/power-apps` の npm CLI は **PAC CLI とは独立した認証キャッシュ**を持つ。
別テナントのアカウントが残っていると、環境 ID が解決できずテナント不一致エラーになる。

### 対処

```powershell
npx power-apps auth-status
npx power-apps auth-switch --account {UPN}
npx power-apps list-connections --environment-id {ENVIRONMENT_ID} --json
```

対象アカウントが一覧にない場合のみ `login --account {UPN}` で追加する。`logout` は全キャッシュ削除なので切り替えには使わない。

> `npx power-apps list-connection-references` は応答が返らずハングすることがある。
> 接続参照の確認は `pac code list-connection-references -env {DATAVERSE_URL} -s {SOLUTION_ID}` を使う。

---

## 31. CLI オプションの落とし穴（検証済 2026-06-15）

| 症状 | 原因 | 対処 |
|---|---|---|
| `npx power-apps delete-data-source --data-source x` → `unknown option` | フラグ名が違う | `-n` / `--data-source-name`（`--force` で確認スキップ） |
| `pac solution list --json \| ConvertFrom-Json` が日本語名で失敗 | PowerShell の既定コンソールが cp932 | `[Console]::OutputEncoding = [Text.Encoding]::UTF8` を先に実行 |
| `pac env fetch --xml "... top='50' ..."` が拒否される | ページング属性と `top` は併用不可 | `count='50'` を使う |
| `pac code init` / `add-data-source` が `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` を出す | libuv のシャットダウン時ノイズ | 無害。終了コード 0 なら無視してよい |
| `power-apps init` が `power.config.json` 生成後に同じ assertion を出して終了コード 1 | CLI 0.13.0 の Windows 終了処理 | `power.config.json` の内容を確認し、後続の `add-data-source` が成功すれば初期化済みとして継続する |
| `add-data-source` / `list-codeapps --environment-id ...` が `unknown option` | CLI 0.13.0 は help と実装が不一致 | `init` 後のプロジェクトで `--environment-id` を外し、`power.config.json` の環境を使う |
| `-cr {未存在の論理名}` → `Failed to resolve connection ID for reference` | 接続参照は自動作成されない | 先に [setup_connection_reference.py](../scripts/setup_connection_reference.py) を実行 |


---

## 32. `count: true` の件数が 5000 で止まる／ページャの総ページ数がずれる（検証済 2026-08-04）

### 症状

- `retrieveMultipleRecordsAsync` に `count: true` を渡して取得した `result.count` が、
  実際のレコード数（5000 件超）に関わらず常に `5000` になる。
- 上記の `count` を総ページ数計算（`Math.ceil(count / pageSize)`）にそのまま使うと、
  実際にはまだ後続ページが存在するのに最終ページ扱いになり、途中でデータが見えなくなる。
- ページ移動のたびに `count: true` を送っていると、一覧の初期表示・ページ切替が体感で遅くなる。

### 原因

1. Dataverse の `@odata.count` アノテーションはプラットフォーム側で 5000 件が上限。
   結果セットが 5000 件を超えていても `count` は `5000` を返す（SDK の型定義コメントにも明記）。
2. `count` を「正確な総件数」として `totalPages` 計算に使い続けると、5000 件超のテーブルで
   実際のページ数と表示上のページ数が食い違う。
3. `count: true` は `@odata.count` の集計コストが毎回乗るため、全ページ取得時に指定すると
   不要なオーバーヘッドになる。

### 対処（恒久対策: [データソースパターン「ページングと総件数」](data-source-patterns.md#ページングと総件数count-true5000-件上限)）

1. `count === 5000` のときは実件数として表示せず「5000+ 件」「5000 件以上」と明示する。
2. レコード数が 5000 件を超える可能性がある画面では、総件数ページャ（ページ番号 + 総ページ数）ではなく
   `skipToken` による「次へ」方式に切り替える。総ページ数を前提にした UI を作らない。
3. `count: true` は総件数キャッシュがない場合（初回取得または検索条件変更時）のみ送り、以降のページ取得では
  省略して取得済みの総件数を再利用する（React Query の `keepPreviousData` と併用）。

> **恒久対策済み**: `data-source-patterns.md` の「ページングと総件数」節に、
> `count: true` の実装例・5000 件上限の UI 表現・`skipToken` への切り替え基準・
> 総件数キャッシュ方針を追加済み。新規の一覧実装時はこの節を必ず参照すること。

→ 関連: [データソースパターン](data-source-patterns.md#ページングと総件数count-true5000-件上限)、[コンポーネントカタログ](component-catalog.md#listtable-の列定義)

---

## 33. MultiSelectPicklist で 400 エラーになる／選択状態が復元されない

### 症状

- `createRecordAsync` / `updateRecordAsync` で MultiSelectPicklist を保存すると HTTP 400 になる。
- すべての選択を解除して保存すると 400 になる。
- 取得した値が文字列のままで、チェックボックスまたはマルチセレクト UI の選択状態が復元されない。

### 原因

Dataverse Web API は MultiSelectPicklist を `"100,200,300"` のようなカンマ区切り文字列で扱うが、
生成 TypeScript 型と UI state は `number[]` で扱う。配列をそのまま書き込む、列クリア時に空文字列
（`""`）を送る、または取得値を deserialize せず UI に渡すと、上記の問題になる。

### 対処

`@microsoft/power-apps/data` の SDK ヘルパーを service 層の境界で使う。対象の論理列名を
`const MULTISELECT_FIELDS = [...] as const` としてテーブルごとに一元管理し、次を徹底する。

1. `list` / `get` の戻り値を UI に返す直前に `deserializeMultiSelectPicklistFields` で変換する。
2. `create` / `update` の SDK 呼び出し直前に `serializeMultiSelectPicklistFields` で変換する。
3. 空配列（`[]`）は **`null` に serialize され、列をクリアする**。空文字列は送らない。

`serializeMultiSelectPicklistFields` は入力を破壊せずシャローコピーを返す。対して
`deserializeMultiSelectPicklistFields` は in-place で変換するため、取得したレコードに適用してから
UI state に渡す。

```typescript
import {
  deserializeMultiSelectPicklistFields,
  serializeMultiSelectPicklistFields,
} from "@microsoft/power-apps/data"

const MULTISELECT_FIELDS = ["{prefix}_categories"] as const

const recordForUi = deserializeMultiSelectPicklistFields(record, MULTISELECT_FIELDS)
const payload = serializeMultiSelectPicklistFields(formState, MULTISELECT_FIELDS)
```

→ 関連: [データソースパターン](data-source-patterns.md#multiselectpicklist複数選択列)、
[コンポーネントカタログ](component-catalog.md#multiselectpicklist-の選択-ui)

---

## 34. scaffold 直後に詰まる 3 点（検証済 2026-08-10、更新 2026-08-17）

`generic-base` を degit して `npm install` した直後、手順どおりに進めても止まる箇所が 3 つある。
いずれもコードの問題ではなく、テンプレート／ドキュメント側の不整合。

### 34.1 `npx power-apps` が `could not determine executable to run`

```
npm error could not determine executable to run
```

`@microsoft/power-apps` **1.2.12 以降で `@microsoft/power-apps-cli` が依存から削除された**。
旧テンプレートの SDK バージョン範囲 `^1.0.17` でも 1.2.12 以降が解決されるため、
CLI と `power-apps` bin がインストールされず `npx power-apps` を実行できない。

```bash
npm install @microsoft/power-apps@latest
npm install -D @microsoft/power-apps-cli@latest
```

2026-08-17 時点の検証済み最新版は SDK 1.2.13 / CLI 0.15.3。
`templates/generic-base/package.json` と全サンプルへ反映済みで、`scripts/validate_sample.py` は
テンプレートを基準に SDK / CLI の両方を検証する。
古いテンプレートから作ったプロジェクトでは手動で足す。

### 34.2 CLI 0.13.0 で `npx power-apps push --environment-id` が `unknown option`

```
error: unknown option '--environment-id'
```

CLI 0.13.0 はhelpに表示した `--environment-id` を実行時に拒否する。
CLI 0.15.3 では `push` / `add-data-source` / `list-codeapps` のhelpに同オプションがあり、最新版では環境IDを明示する。

```bash
npx power-apps push --environment-id {ENVIRONMENT_ID} --solution-id {SOLUTION_ID_GUID}   # 初回
npx power-apps push                                     # 2 回目以降
```

0.13.0を使い続ける場合は `--environment-id` を外し、`power.config.json` の環境を使う。
→ [CLI リファレンス](cli-reference.md#グローバルオプション)

### 34.3 `npm run predeploy` が `.env の ENV_ID が未設定` で落ちる

`scripts/pre-deploy-check.mjs` の必須キーは **`ENV_ID`** だが、
`references/.env.example` は `ENVIRONMENT_ID` を案内している。
両方を同じ値で `.env` に置くのが確実。

```env
ENVIRONMENT_ID=00000000-0000-0000-0000-000000000000
ENV_ID=00000000-0000-0000-0000-000000000000
```

---

## 35. Python ヘルパースクリプトが `.env` を読まない／`UnicodeEncodeError` で落ちる（検証済 2026-08-10）

### 症状

```
DATAVERSE_URL が .env に設定されていません（または --environment-id を指定）
```

プロジェクト直下に `.env` があり、そこで `cd` しているのに読まれない。

```
UnicodeEncodeError: 'cp932' codec can't encode character '\u2705' in position 0
```

### 原因

- `check_code_apps_environment.py` などは **スクリプト自身の親ディレクトリ**を遡って `.env` を探す
  （`for _p in _SCRIPT_DIR.parents:`）。カレントディレクトリは見ない。
  スキルをリポジトリ外から参照して実行すると、プロジェクトの `.env` に到達しない。
- 日本語 Windows の既定コンソールは cp932 なので、`✅` / `⚠️` を含む出力で例外になる。

### 対処

プロセス環境変数として渡し、出力エンコーディングを UTF-8 に固定する。

```powershell
$env:DATAVERSE_URL  = "https://<org>.crm.dynamics.com"
$env:TENANT_ID      = "<tenant-guid>"
$env:PYTHONIOENCODING = "utf-8"
python <skill>/scripts/check_code_apps_environment.py --environment-id <env-guid>
```

`--environment-id` のように引数で渡せるものは引数を優先する。


---

## 36. Dataverse の JSON 列をそのまま描画して "Minified React error #31" で落ちる（検証済 2026-08-10）

### 症状

一覧は表示できるのに、行をクリックして詳細モーダルを開いた瞬間に画面が真っ白になる。

```
Minified React error #31; Objects are not valid as a React child
(found: object with keys {path})
```

### 原因

Memo 列に格納した JSON を `JSON.parse` した結果を、そのまま JSX に埋め込んでいる。
生成元によって同じフィールドが文字列だったりオブジェクトだったりするため、
サンプルデータでは動いても本番データで落ちる。
（例: ツール呼び出しの `arguments` が `"{\"path\":\"...\"}"` のときと `{ path: "..." }` のときがある）

### 対処

描画の直前で必ず文字列へ正規化するヘルパーを通す。列の型を信用しない。

```typescript
export function formatToolArguments(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  try { return JSON.stringify(value) } catch { return String(value) }
}
```

型定義側も `arguments?: unknown` にしておくと、生の値を JSX へ渡した時点で
TypeScript が気付いてくれる。

---

## 37. `power-apps push` 後もブラウザが古いバンドルを表示する（検証済 2026-08-10）

### 症状

ビルドと push は成功しているのに、プレイヤーで開くと修正前の挙動のまま。
画面上部に「このアプリの古いバージョンを使用しています。更新してください」の
バナーが出ることがある。

### 原因

Power Apps プレイヤーが直前のバンドルをキャッシュしている。

### 対処

バナーの「更新」を押すか、プレイヤー URL を再読み込みする。
Playwright で検証する場合は `page.reload()` ではなく `page.goto(playerUrl)` の方が確実。

なお、プレイヤーはアプリを **入れ子の iframe**
（`*.environment.api.powerplatformusercontent.com`）で描画するため、
自動操作は `page.frameLocator(...)` 経由で行う。
行クリックが "element is not stable" でタイムアウトするときは
`.click({ force: true })`、同名ボタンが複数あるときは `{ exact: true }` を使う。

## 38. ダッシュボードの KPI カードを押しても「何も起きない」（検証済 2026-08-13）

### 症状

「要確認 12 件」のような KPI カードをクリックしても画面が変わらないように見える。
また KPI が 6 枚あると縦を占有し、下のグラフが初期表示で見えない。

### 原因

- クリックで同じページの**最下部**にドリルダウン領域を開く実装だった。開いてはいるが
  スクロールしないと見えないため、ユーザーからは無反応と区別できない。
- KPI カードが既定パディング（`py-6`）＋ `text-3xl` のまま `lg:grid-cols-3` で 2 段になっていた。

### 対処

1. 押せる KPI は `<Link to="/turns?view=attention">` にして**一覧画面へ遷移**させる。
   押せることが分かるよう矢印アイコンとホバー色を付け、遷移先の無い KPI はリンクにしない。
2. 遷移先は `useSearchParams` でクエリを読み、**タブの初期選択**に反映する（件数バッジ付き、`replace: true`）。
3. KPI は `py-3 px-3` + `text-xl` に詰め、`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` で 1 行に並べる。
4. 「要確認」の判定は `src/lib/` に置いてダッシュボードと一覧で共有する（閾値の二重定義を避ける）。

**恒久対策済み**: `scripts/pre-deploy-check.mjs` のチェック 9 が、リンクに書いたクエリキーを
どの画面も `useSearchParams().get()` で読んでいない場合に警告する。
書き方は [デザインパターン「ダッシュボードは『数字 → 一覧』の導線として作る」](design-pattern.md)。

## 39. 既存テーブルに列を追加したのに `Could not find a property named '...'`（検証済 2026-08-13）

### 症状

セットアップスクリプトで列を追加し、`EntityDefinitions(...)/Attributes` にも列が見えているのに、
アプリからの読み取りが次のエラーで落ちる。

```json
{"error":{"code":"0x80060888","message":"Could not find a property named 'geek_conversation' on type 'Microsoft.Dynamics.CRM.geek_evalturn'."}}
```

### 原因

列の作成（Metadata API）と、Web API が公開する `$metadata` の更新は別。**発行していないと
`$metadata` が古いまま**なので、実体はあるのに `$select` / `$filter` から見えない。
待っても直らない。テーブルを新規作成した直後は自動で発行されるため、
「最初は動いたのに、あとで足した列だけ見えない」という形で出る。

### 対処

列を追加するスクリプトの**最後に必ず発行を入れる**。テーブル新規作成のときだけでなく、
既存テーブルへの列追加でも必要。

```powershell
# 発行しないと Web API の $metadata が古いままで、追加した列を $select しただけで落ちる
Invoke-Dataverse POST "PublishAllXml" -Body @{} | Out-Null
```

```python
api_post("PublishAllXml", {})
```

発行後は `?$select=<新しい列>&$top=1` を 1 回叩いて、200 が返ることを確認してからアプリを触る。

## 40. アプリから積んだ評価ジョブが待機中／実行中のまま進まない（検証済 2026-08-13）

### 症状

コマンドセンターで「再実行」を押すとジョブ行は増えるのに、実行履歴の状態が変わらない。
あるいは一度 `実行中` になったまま、いつまで経っても `完了` にならない。

### 原因

- **消化する常駐側が居ない。** アプリはキュー行を作るだけなので、拾って回す常駐プロセスを
  作っていなければ待機中のまま溜まる。開発者PCのタスクスケジューラは、ユーザーが押した
  ボタンの受け皿にはならない
- **常駐側を Always On の無いプランに置いている。** App Service の Free/Shared は
  `alwaysOn` を設定できず、アイドルでワーカーごとアンロードされる。走行中のジョブは
  `実行中` のまま取り残される
- **待機中しか拾わない実装。** 取り残された行を誰も戻さないので、永久に復旧しない

### 対処

1. 常駐ワーカー（`BackgroundService` など）を用意し、**Always On が有効なプラン**に置く
2. 拾う前に孤児を回収する。進捗更新で `modifiedon` が動くのを利用し、
   `status eq 実行中 and modifiedon lt (now - 15分)` を待機中へ戻す
3. 進捗は数件ごとに書き戻す。書き戻し間隔が長いと、正常なジョブまで孤児と誤判定される

### 確認

`geek_evaljobs` を `requestedon desc` で数件引き、`status` / `targetcount` / `donecount` が
進むことを見る。`donecount` が止まったまま `modifiedon` だけ古くなっていれば、ワーカーが死んでいる。

---

## 41. `power-apps share` が principal／権限／環境エラーになる（検証済 2026-08-17）

### 症状・原因・対処

| 症状 | 主な原因 | 対処 |
|---|---|---|
| principal が存在しない、または解決できない | メールアドレスの誤記、別テナントのユーザー、サービスプリンシパルの application/client ID を指定した | 対象テナントのユーザーメールまたは Entra **object ID** を使う。サービスプリンシパルも object ID を指定する |
| 共有操作が forbidden／権限不足になる | CLI のアクティブアカウントにアプリ共有権限がない | `npx power-apps auth-status` で主体を確認し、アプリ所有者または共有可能な権限を持つアカウントへ `auth-switch` する |
| コマンドは成功したが意図した環境で共有されない、またはアプリが見つからない | `power.config.json` と対象環境が違う、push と share で `--environment-id` が不一致 | push と share の両方に同じ `--environment-id` を明示し、実行前に `auth-status` と `power.config.json` を確認する |
| `--access` が拒否される、または過剰な編集権限を付けた | `play` / `edit` 以外を指定した、通常利用者へ `edit` を指定した | 値は `play` または `edit` のみ。既定は `play` とし、`edit` は共同開発者など必要な主体だけに分離する |

CI/CD では `--non-interactive --json` を付け、終了コードが 0 のときだけ後続処理へ進む。
principal 一覧を環境別変数として管理し、開発環境の object ID を本番環境へ流用しない。

**恒久対策済み**: [CLI リファレンスの `share`](cli-reference.md#share) に最小権限・環境明示・自動化の
標準を集約し、`scripts/validate_cli_reference.py` が CLI help と主要オプション／実行例の整合を検証する。

## 42. Badge に動的な値を複数連結すると長文でカードからはみ出す（検証済 2026-08-27）

### 症状

一覧・詳細のカードに `<Badge>KPI: {name} +{value}{unit}</Badge>` のように複数の動的な値を
連結して表示すると、KPI 名や説明文が長い場合にバッジの横幅がカード幅を超えてはみ出す。

### 原因

shadcn の `Badge`（`components/ui/badge.tsx`）は既定で `whitespace-nowrap shrink-0 w-fit` を
持つ。ステータス等の**固定・短文の enum ラベル**（`{STATUS_LABEL[...]}` のような単一の式）を
1 行で見せるための設計であり、複数の式を連結した**可変長の合成テキスト**（名前＋数値＋単位など）を
入れると、`flex-wrap` の親の中でもバッジ自体が縮まずカード外にはみ出す。

### 対処

可変長の値を連結して表示するバッジには、個別に折り返し用のクラスを追加する。

```tsx
<Badge variant="secondary" className="max-w-full h-auto whitespace-normal break-words text-left">
  KPI: {c.kpiName} +{c.value}{c.unit}
</Badge>
```

**恒久対策済み**: `scripts/pre-deploy-check.mjs` のチェック 7d が、`<Badge>` の子要素に `{...}` 式が
2 つ以上連結され、かつ `className` に `max-w-full` / `truncate` / `break-words` / `whitespace-normal` /
`line-clamp` のいずれも無い箇所を警告する（enum の単一ラベル表示は式が 1 つのため誤検出しない）。


---
name: code-apps
description: "Power Apps Code Apps（コードファースト）の初期化・Dataverse 接続・UI 設計・開発・デプロイ。TypeScript + React + Tailwind CSS + shadcn/ui で開発する。CSP 構成・メール送信パターンも含む。"
category: ui
triggers:
  - "Code Apps"
  - "power-apps init"
  - "power-apps push"
  - "add-data-source"
  - "DataverseService"
  - "Tailwind"
  - "shadcn"
  - "React"
  - "TypeScript"
  - "Vite"
  - "Code Apps デプロイ"
  - "nameUtils パッチ"
  - "日本語サニタイズ"
  - "Code Apps デザイン"
  - "UI 設計"
  - "コンポーネント選定"
  - "画面レイアウト"
  - "ギャラリー"
  - "テーブル"
  - "カンバン"
  - "ガントチャート"
  - "ダッシュボード"
  - "フォーム"
  - "デザイン例"
  - "iframe"
  - "embed"
  - "埋め込み"
  - "CSP"
  - "Content Security Policy"
  - "frame-src"
  - "connect-src"
  - "メール送信"
  - "PDF添付"
  - "PDF生成"
  - "htmlToPdfBase64"
  - "ContentBytes"
  - "base64"
  - "html2canvas"
  - "jsPDF"
  - "日本地図"
  - "地図"
  - "マップ"
  - "JapanMap"
  - "add-flow"
  - "list-flows"
  - "フロー呼び出し"
  - "フロー連携"
  - "AI Builder"
  - "executeAsync"
  - "dataSourcesInfo"
---

# Code Apps 開発スキル

Power Apps Code Apps（コードファースト）を **TypeScript + React + Tailwind CSS + shadcn/ui** で開発する。
UI 設計・CSP 構成・メール送信パターンまで Code Apps 開発の全領域をカバーする統合スキル。

## サブリファレンス（必要に応じて参照）

| リファレンス | 内容 |
|---|---|
| [デザインシステム](references/design-system.md) | shadcn/ui + Tailwind CSS v4 のコンポーネント選定・画面設計パターン |
| [コンポーネントカタログ](references/component-catalog.md) | 全コンポーネントの詳細仕様・使用例 |
| [CSP 構成](references/csp.md) | iframe 埋め込み・外部 API 接続時の Content Security Policy 設定 |
| [メール・PDF 送信](references/mail-pdf.md) | HTML→PDF 変換・Power Automate 経由メール添付送信パターン |
| [日本地図パターン](references/japan-map-pattern.md) | SVG 都道府県地図の実装パターン |
| [ビルドリファレンス](references/build-reference.md) | ビルド・デプロイの詳細手順 |
| [フロー連携](references/flow-integration.md) | Power Automate フロー呼び出し・AI Builder JSON パース・dataSourcesInfo 統合 |

> [!NOTE]
> 本スキル内のコード例は **インシデント管理サンプル** を題材としています。
> `geek_incident` / `Geek_incidents` 等のテーブル名・型名は、あなたのプロジェクトのエンティティに読み替えてください。
> パターン（Lookup 名前解決、SDK ラッパー、useMemo マップ等）はそのまま適用できます。

## 前提: 設計フェーズ完了後に実装に入る（必須）

**このスキルでコードを書く前に、[デザインシステム](references/design-system.md) を参照して UI 設計を行い、ユーザーの承認を得ていること。**

```
① デザインシステムリファレンス（references/design-system.md）を読み込む
② 画面構成・コンポーネント選定・Lookup 名前解決パターンを設計
③ ユーザーに設計を提示し、「この設計で進めてよいですか？」と承認を得る
④ 承認後、このスキルに従って実装
```

> **設計で提示する内容**: 画面一覧（ページ名・ルート）、各画面のコンポーネント構成（ListTable / InlineEditTable / StatsCards / FormModal 等）、
> カラム定義、Lookup 名前解決の方法（`_xxx_value` + `useMemo` Map）、ナビゲーション構造

## 大前提: 一つのソリューション内に開発

Dataverse テーブル・Code Apps・Power Automate フロー・Copilot Studio エージェントは **すべて同一のソリューション内** に含める。

```
SOLUTION_NAME={YourSolutionName}  ← .env で定義。全フェーズで同じ値を使用
PUBLISHER_PREFIX={prefix}          ← ソリューション発行者の prefix
```

- Code Apps は `npx power-apps push` でソリューション内にデプロイされる（環境 ID で紐づけ）
- Dataverse データソース追加時はソリューション内のテーブルを参照
- 開発・テスト・本番の環境間移行はソリューションのエクスポート/インポートで行う

## 絶対遵守ルール

### 環境の前提条件（デプロイ前に必ず確認）

```
1. Power Platform 管理センターで「コード アプリを許可する」がオン
   → オフの場合: CodeAppOperationNotAllowedInEnvironment (403) エラー

2. PAC CLI 認証プロファイルが対象環境用に作成済み
   pac auth create --name {profile-name} --environment {ENVIRONMENT_ID}
   pac auth list  # * が付いているのがアクティブ

3. power.config.json は npx power-apps init で生成する
   → テンプレートから手動コピーしない
   → 別環境の appId が残っていると: AppLeaseMissing (409) エラー
   → 新規環境では必ず npx power-apps init で新規生成
```

### `npx power-apps init` でスキャフォールドされるファイル（手動作成禁止）

`npx power-apps init` は以下のファイルを自動生成する。**これらを手動作成・他プロジェクトからコピーしてはならない。**

| ファイル | 役割 | カスタマイズ |
|---|---|---|
| `power.config.json` | 環境 ID・アプリ ID（環境固有） | ❌ 禁止 |
| `plugins/plugin-power-apps.ts` | Vite 開発サーバー用 Power Apps プラグイン（CORS・ミドルウェア・起動 URL 表示） | ❌ 不要 |
| `vite.config.ts` | Vite 設定（power-apps プラグイン組み込み済み） | ⚠ `manualChunks` 等の追加のみ |
| `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` | TypeScript 設定 | ⚠ パスエイリアス等の追加のみ |
| `eslint.config.js` | ESLint 設定 | ⚠ ルール追加のみ |
| `index.html` | エントリ HTML | ❌ 不要 |
| `package.json` | 依存関係（`@microsoft/power-apps` 等） | ⚠ 依存追加のみ |
| `src/main.tsx` / `src/App.tsx` / `src/index.css` | React エントリポイント | ✅ 自由にカスタマイズ |
| `components.json` | shadcn/ui 設定 | ⚠ 通常変更不要 |

> **原則**: SDK がスキャフォールドしたインフラファイル（`plugin-power-apps.ts`、`power.config.json`）は変更しない。開発者がカスタマイズするのは `src/` 配下のアプリコードのみ。

### .power/ と src/generated/ は SDK コマンドで生成（手動作成禁止）

`.power/` は `.gitignore` で除外されているため、git clone 後は `dataSourcesInfo.ts` が存在しない。
**カスタムスクリプトで生成せず、SDK コマンドで必ず再生成すること。**

```
❌ git clone 直後に npm run build
   → TS2307: Cannot find module '../../../.power/schemas/appschemas/dataSourcesInfo'

❌ カスタムスクリプト（generate_datasources_info.py 等）で手動生成
   → SDK が管理するファイルを自前で作ると整合性が崩れる

✅ npx power-apps add-data-source で各テーブルを再追加
   → .power/schemas/appschemas/dataSourcesInfo.ts が自動生成される
   → src/generated/ のモデル・サービスも同時に再生成される
   → その後 npm run build が成功する
```

### 先にデプロイ、後から開発（最重要）

```bash
# ✅ 正しい順序
npx power-apps init --display-name "アプリ名" --environment-id {ENVIRONMENT_ID} --non-interactive
npm install
npm run build
pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}  # ← まずデプロイ！
# ↑ npx power-apps push でテナント不一致エラーが出る場合は pac code push を使う
# この時点で Power Platform にアプリが登録され Dataverse 接続が確立
npx power-apps add-data-source ...       # ← その後にデータソース追加

# ❌ 間違い: ローカルで全部作ってから最後にデプロイ
#    → Dataverse 接続が確立されず add-data-source が失敗する
```

### npx power-apps を使う（pac code ではない）

```
❌ pac code add-data-source -a dataverse -t {table}
   → SDK v1.0.x でスクリプトパスが変更され "Could not find the PowerApps CLI script" エラー

✅ npx power-apps add-data-source --api-id dataverse \
     --resource-name {table_logical_name} \
     --org-url {DATAVERSE_URL} --non-interactive
```

### npx power-apps push/add-data-source テナント不一致問題（検証済 2026-04-22）

`npx power-apps push` / `npx power-apps add-data-source` が内部で異なるテナントで環境を検索し、
`ServiceToServiceEnvironmentNotFound` (404) を返す場合がある。

```
❌ npx power-apps push --non-interactive
   → HTTP error status: 404 for POST .../generateResourceStorage
   → The environment '...' could not be found in the tenant '...'
   → 内部で使用するテナント ID が実際の環境テナントと異なる

✅ pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}
   → PAC CLI は pac auth の認証プロファイルを使うためテナント解決が正確
   → -env で環境 ID を明示指定
```

```
❌ npx power-apps add-data-source --api-id dataverse --resource-name {table}
   → 同様にテナント不一致で org-url プロンプトが表示される

✅ npx power-apps add-data-source --api-id dataverse \
     --resource-name {table} \
     --org-url {DATAVERSE_URL}
   → --org-url を明示指定するとテナント解決をバイパス
   → 対話プロンプトが出たら DATAVERSE_URL を入力しても可
```

**推奨ワークフロー**:
1. 初回デプロイ: `pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}`
2. データソース追加: `npx power-apps add-data-source --api-id dataverse --resource-name {table} --org-url {DATAVERSE_URL}`
3. 以降のデプロイ: `npm run build && pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}`

### 日本語 DisplayName サニタイズエラーの回避

```
問題: テーブルの日本語表示名で "Failed to sanitize string インシデント" エラー
原因: nameUtils.js が ASCII 文字のみ許容
```

**修正対象**: `node_modules/@microsoft/power-apps-actions/dist/CodeGen/shared/nameUtils.js`

```javascript
// ❌ 元のコード
name = name.replace(/[^a-zA-Z0-9_$]/g, "_");

// ✅ 修正後（CJK・Unicode 文字を許容）
name = name.replace(
  /[^a-zA-Z0-9_$\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/g,
  "_",
);
```

**パッチ適用方法（重要）**: PowerShell では `$` のエスケープ問題でパッチが適用されないことがある。
**必ず Node.js スクリプト（`patch-nameutils.cjs`）を使うこと。**

```javascript
// patch-nameutils.cjs — プロジェクトルートに配置
const fs = require('fs');
const p = 'node_modules/@microsoft/power-apps-actions/dist/CodeGen/shared/nameUtils.js';
let c = fs.readFileSync(p, 'utf8');
const oldPat = "[^a-zA-Z0-9_$]/g, '_')";
const newPat = "[^a-zA-Z0-9_$\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF\\u3000-\\u9FFF\\uAC00-\\uD7AF\\uF900-\\uFAFF]/g, '_')";
if (c.includes(oldPat)) {
  c = c.replace(oldPat, newPat);
  fs.writeFileSync(p, c);
  console.log('Patched successfully');
} else {
  console.log('Already patched or pattern not found');
}
```

```bash
# パッチ適用コマンド
node patch-nameutils.cjs

# 検証
node -e "const c=require('fs').readFileSync('node_modules/@microsoft/power-apps-actions/dist/CodeGen/shared/nameUtils.js','utf8');c.split('\n').forEach((l,i)=>{if(l.includes('replace')&&l.includes('a-zA-Z'))console.log(i+':',l.trim())})"
```

```
❌ PowerShell の文字列置換（$, バッククォート, 正規表現のエスケープが競合）
   → パッチが適用されたように見えて実際には変更されていないケースがある

✅ Node.js スクリプト（patch-nameutils.cjs）で確実に適用
   → 適用後に Select-String または node -e で検証必須
```

> `npm install` で node_modules が再生成されるとパッチが消える。データソース追加のたびに `node patch-nameutils.cjs` を実行すること。

### スキーマ名は英語のみ

```
✅ テーブル: {prefix}_yourtable  列: {prefix}_description
❌ テーブル: {prefix}_テーブル名  列: {prefix}_説明
→ 日本語スキーマ名は pac code add-data-source で失敗する
```

### Power Apps CSP（Content Security Policy）違反の回避

Power Apps ランタイムは厳格な CSP を適用し、**外部 API への `fetch`/`XMLHttpRequest` はすべてブロックされる**（`connect-src 'none'`）。

```
❌ fetch("https://learn.microsoft.com/api/learn/catalog")
   → Connecting to '...' violates Content Security Policy: "connect-src 'none'"

❌ window.open("https://外部サイト") を含むページ
   → CSP または Power Apps の制約でブロック

✅ Dataverse SDK（getClient()）経由のデータアクセスのみ
   → Power Apps SDK は CSP の制約を受けない内部通信
```

**CodeAppsStarter テンプレートにはデモ用の外部 API 呼び出しが含まれる**ため、必ず削除すること。

### ログインユーザーの systemuserid 取得（検証済 2026-04-25）

Code Apps でログインユーザーの Dataverse `systemuserid` を取得するには、以下の **唯一の確実な方法** を使う。

```
❌ Xrm.Utility.getGlobalContext().userSettings.userId
   → Code Apps では Xrm オブジェクトは利用不可（undefined）

❌ fetch("/api/data/v9.2/WhoAmI")
   → CSP connect-src: 'none' でブロックされる（Code Apps はデフォルトで全 fetch を禁止）

❌ WhoAmIService.WhoAmI()（npx power-apps add-dataverse-api -n WhoAmI で生成）
   → executeAsync は内部的に fetch を使うため、CSP でブロックされる
   → {"success":false,"error":{}} が返る

❌ SDK getContext().user.objectId をそのまま使う
   → これは Entra AAD Object ID であり、Dataverse systemuserid ではない
   → bookableresource._userid_value 等と一致しない

✅ SDK getContext() → Entra objectId 取得 → systemuser テーブルクエリで systemuserid を解決
   → retrieveMultipleRecordsAsync は postMessage ベースのため CSP 制約を受けない
```

**前提: systemuser をデータソースに追加**

```bash
npx power-apps add-data-source --api-id dataverse \
  --resource-name systemuser \
  --org-url {DATAVERSE_URL}
```

`src/generated/appschemas/dataSourcesInfo.ts` に `systemusers` エントリが自動追加される。
追加されない場合は手動で追記:

```typescript
"systemusers": {
  "tableId": "systemuser",
  "version": "",
  "primaryKey": "systemuserid",
  "dataSourceType": "Dataverse",
  "apis": {}
}
```

**実装パターン（最小構成）:**

```typescript
// src/services/booking-service.ts（または user-service.ts）

// --- SDK App Context ---
// @ts-ignore - resolved at runtime by Power Apps host
import { getContext } from "@microsoft/power-apps/app";
import type { IContext } from "@microsoft/power-apps/app";

let _sdkContext: IContext | null = null;
async function getSdkContext(): Promise<IContext | null> {
  if (_sdkContext) return _sdkContext;
  try {
    _sdkContext = await getContext();
    return _sdkContext;
  } catch { return null; }
}

/**
 * ログインユーザーの Dataverse systemuserid を取得する。
 * SDK getContext() で Entra objectId を取得し、systemuser テーブルから systemuserid を解決。
 * retrieveMultipleRecordsAsync は postMessage ベースのため CSP の影響を受けない。
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const ctx = await getSdkContext();
    if (ctx?.user?.objectId) {
      const entraId = ctx.user.objectId;
      console.log("[getCurrentUserId] Entra objectId:", entraId);

      const client = await getClient();  // SDK DataClient
      const result = await client.retrieveMultipleRecordsAsync(
        "systemusers",
        {
          select: ["systemuserid"],
          filter: `azureactivedirectoryobjectid eq '${entraId}'`,
          top: 1,
        }
      );
      if (result?.success && result.data?.length > 0) {
        const uid = result.data[0]?.systemuserid;
        if (uid) return uid.toLowerCase();
      }
    }
  } catch (e) {
    console.warn("[getCurrentUserId] failed:", e);
  }
  return null;
}
```

**TanStack React Query フック:**

```typescript
// src/hooks/use-bookings.ts（または use-user.ts）
export function useCurrentUserId() {
  return useQuery({
    queryKey: ["currentUserId"],
    queryFn: getCurrentUserId,
    staleTime: Infinity,  // ユーザー ID はセッション中変わらない
    retry: 2,
  });
}
```

**ページでの使用パターン（予約フィルタ）:**

```typescript
export default function BookingsPage() {
  const { data: bookings = [] } = useBookings();
  const { data: resources = [] } = useBookableResources();
  const { data: currentUserId } = useCurrentUserId();

  // systemuserid → bookableresourceid を解決
  const currentResourceId = useMemo(() => {
    if (!currentUserId) return null;
    const uid = currentUserId.toLowerCase();
    const res = resources.find((r) => r._userid_value?.toLowerCase() === uid);
    return res?.bookableresourceid ?? null;
  }, [currentUserId, resources]);

  // 自分の予約のみ表示（未解決時は空配列）
  const myBookings = useMemo(() => {
    if (!currentResourceId) return [];
    return bookings.filter((b) => b._resource_value === currentResourceId);
  }, [bookings, currentResourceId]);
}
```

**重要な教訓:**
- **GUID の大文字/小文字は統一する**: Dataverse API は大文字小文字混在で返すことがある。比較時は必ず `.toLowerCase()` を使う
- **systemuserid が取れない場合は空配列を返す**: null フォールバックで全データ表示しない（セキュリティリスク）
- **`IContext.user.objectId` は Entra AAD Object ID**: Dataverse の `systemuserid` とは異なる値。`azureactivedirectoryobjectid` 列でマッピングが必要
- **`executeAsync` も CSP でブロックされる**: `add-dataverse-api` で生成した WhoAmI サービスは `executeAsync` を使うが、これも内部で `fetch()` を使用しておりCSPでブロックされる。`retrieveMultipleRecordsAsync` だけが postMessage ベースで CSP 安全

### 基本設計方針: モーダル操作 + z-index ルール

**新規作成・編集・削除はすべてモーダル（Dialog / AlertDialog）で操作する。**
別ページに遷移させない。サイドバーのメニューは機能名のみ（「一覧」「新規作成」等の動詞を付けない）。

```
❌ /{entities}/new → 別ページで新規作成フォーム
❌ サイドバーに「{エンティティ}一覧」「新規作成」を個別メニュー

✅ /{entities} ページ内で「新規作成」ボタン → Dialog モーダル表示
✅ 一覧テーブルで行クリック → 詳細ページ（閲覧+インライン編集）
✅ 削除ボタン → ConfirmDialog（AlertDialog）で確認
✅ サイドバーには「{エンティティ名}」のみ表示
```

**z-index ルール（サイドバーとモーダルの重なり問題回避）**:

```
サイドバー:       z-40（固定メニュー）
Dialog Overlay:   z-[300]（モーダル背景）
Dialog Content:   z-[400]（モーダル本体）
AlertDialog:      z-[300] / z-[400]（Dialog と同階層）

❌ サイドバー z-[100] + AlertDialog z-50
   → モーダル表示時にサイドバーがシャドウレイヤーの上に表示される

✅ サイドバー z-40 + AlertDialog/Dialog z-[300]/z-[400]
   → モーダルが常にサイドバーの上に表示される
```

### SDK 生成サービス必須（カスタム getClient() / dataSourcesInfo 禁止）

`npx power-apps add-data-source` で生成される **`src/generated/` のサービスと型を必ず使用する**。
カスタムの `getClient()` や自前の `dataSourcesInfo` でのデータ取得は禁止。

```
❌ カスタム dataSourcesInfo を自前で定義して getClient() に渡す
   → Power Apps ランタイムで Dataverse 接続が確立されない
   → ローカルでは動くがデプロイ後にデータ取得できない

✅ src/generated/services/ の SDK 生成サービスを使用
   → .power/schemas/appschemas/dataSourcesInfo.ts を経由
   → Power Apps ランタイムが自動で Dataverse 接続を解決
```

#### ★ 例外: フロー連携時は統合 dataSourcesInfo が必須

`npx power-apps add-flow` で追加したフローを使う場合、SDK の `getClient` シングルトン問題が発生する。
詳細は **[フロー連携リファレンス](references/flow-integration.md)** を参照。

```
問題: getClient() はシングルトン。最初に src/generated 版（テーブルのみ）で初期化されると
      フローの Connector データソースが見つからない。
      → "Data source not found: Unable to find data source: {flowName}"

解決: src/lib/dataSourcesInfo.ts で両方をマージし、全コードで統合版を使用
```

```typescript
// src/lib/dataSourcesInfo.ts（フロー連携時に作成）
import { dataSourcesInfo as generatedInfo } from "@/generated/appschemas/dataSourcesInfo";
import { dataSourcesInfo as powerInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";

export const dataSourcesInfo = {
  ...generatedInfo,
  ...powerInfo,
} as typeof generatedInfo & typeof powerInfo;
```

**SDK 生成コードの構成**（`npx power-apps add-data-source` 実行後に生成される）:

```
src/generated/
├── index.ts                                 # 全モデル・サービスの re-export
├── models/
│   ├── CommonModels.ts                      # IGetOptions, IGetAllOptions
│   ├── {Prefix}_{entities}Model.ts          # エンティティ型 + Choice 値（例: Geek_incidentsModel.ts）
│   ├── {Prefix}_{categories}Model.ts        # 関連テーブルの型
│   └── SystemusersModel.ts
└── services/
    ├── {Prefix}_{entities}Service.ts        # create/update/delete/get/getAll
    ├── {Prefix}_{categories}Service.ts
    └── SystemusersService.ts
.power/schemas/appschemas/
└── dataSourcesInfo.ts                       # SDK が内部で使用（直接参照不要）
```

**推奨アーキテクチャ**: SDK 生成サービスの薄いラッパーを作成する。
**Lookup の名前表示は必ずクライアントサイド名前解決パターンを使う。**

```typescript
// src/services/incident-service.ts — SDK生成サービスのラッパー
import { Geek_incidentsService } from "@/generated/services/Geek_incidentsService";
import { SystemusersService } from "@/generated/services/SystemusersService";
import { Geek_incidentcategoriesService } from "@/generated/services/Geek_incidentcategoriesService";
import type {
  Geek_incidents,
  Geek_incidentsBase,
} from "@/generated/models/Geek_incidentsModel";

// システムフィールドは Dataverse が自動設定 → Create 時は除外
type SystemFields =
  | "geek_incidentid"
  | "ownerid"
  | "owneridtype"
  | "statecode"
  | "statuscode";
export type CreatePayload = Omit<Geek_incidentsBase, SystemFields> &
  Partial<
    Pick<
      Geek_incidentsBase,
      "ownerid" | "owneridtype" | "statecode" | "statuscode"
    >
  >;

// ★ select に Lookup GUID（_xxx_value）を必ず含める
export async function getIncidents(): Promise<Geek_incidents[]> {
  const result = await Geek_incidentsService.getAll({
    select: [
      "geek_incidentid", "geek_name", "geek_description",
      "geek_status", "geek_priority", "createdon",
      "_geek_incidentcategoryid_value", "_geek_assignedtoid_value",
      "_geek_itassetid_value", "_createdby_value",
    ],
    orderBy: ["createdon desc"],
  });
  return result.data;
}

// 名前解決用: systemuser 一覧を取得
export async function getSystemUsers() {
  const result = await SystemusersService.getAll({
    select: ["systemuserid", "fullname", "internalemailaddress"],
    filter: "isdisabled eq false and accessmode ne 3 and accessmode ne 4",
    orderBy: ["fullname asc"],
  });
  return result.data;
}

// 名前解決用: カテゴリ一覧を取得
export async function getCategories() {
  const result = await Geek_incidentcategoriesService.getAll({
    select: ["geek_incidentcategoryid", "geek_name"],
    orderBy: ["geek_name asc"],
  });
  return result.data;
}
```

**SDK 生成型の注意点（最初の実装から適用すること）**:

- **Lookup 名フィールド（`createdbyname`, `geek_assignedtoidname` 等）は SDK が返さない**
  → `_xxx_value`（GUID）+ クライアントサイド名前解決が必須（下記パターン参照）
- `createdon`, `modifiedon` は `string | undefined` → null チェック必須
- `geek_status`, `geek_priority` は `number | undefined` → null チェック必須
- Choice 値マップ（`Geek_incidentsgeek_status` 等）は SDK が生成するが、UI ラベルは別途定義

### Lookup 名はクライアントサイド名前解決が必須（最重要）

SDK 生成サービスの `getAll()` / `get()` は **フォーマット済み Lookup 名フィールド**
（`createdbyname`, `geek_assignedtoidname`, `geek_incidentcategoryidname` 等）を
**返さない**。最初のページ実装から以下のパターンを適用すること。

```
❌ Lookup 名フィールドに依存して表示（初回デプロイから壊れる）
   → item.createdbyname → undefined → 「-」や空白になる
   → item.geek_assignedtoidname → undefined → 担当者列が空
   → item.geek_incidentcategoryidname → undefined → カテゴリが空

✅ _xxx_value（GUID）+ useMemo で名前解決マップ（正しいパターン）
   → 関連テーブル（systemuser, category, itasset 等）を hooks で取得
   → useMemo で Map<GUID, 名前> を構築
   → テーブルカラムの render で GUID → 名前変換して表示
```

**ページ実装の推奨パターン（一覧ページ）**:

```typescript
// ① hooks で関連テーブルを取得
const { data: incidents = [] } = useIncidents()
const { data: users = [] } = useSystemUsers()
const { data: categories = [] } = useCategories()

// ② useMemo で GUID → 名前の Map を構築
const userMap = useMemo(() => {
  const m = new Map<string, string>()
  users.forEach((u) => m.set(u.systemuserid, u.fullname || u.internalemailaddress || ""))
  return m
}, [users])

const categoryMap = useMemo(() => {
  const m = new Map<string, string>()
  categories.forEach((c) => m.set(c.geek_incidentcategoryid, c.geek_name))
  return m
}, [categories])

// ③ テーブルカラムで render 関数を使って GUID → 名前を解決
const columns = [
  { key: "geek_name", label: "タイトル", sortable: true },
  {
    key: "_geek_incidentcategoryid_value",
    label: "カテゴリ",
    render: (item) => {
      const v = item._geek_incidentcategoryid_value as string | undefined
      return v ? categoryMap.get(v) || "" : ""
    },
  },
  {
    key: "_geek_assignedtoid_value",
    label: "担当者",
    render: (item) => {
      const v = item._geek_assignedtoid_value as string | undefined
      return v ? userMap.get(v) || "" : ""
    },
  },
  {
    key: "_createdby_value",
    label: "報告者",
    render: (item) => {
      const v = item._createdby_value as string | undefined
      return v ? userMap.get(v) || "" : ""
    },
  },
]
```

**詳細ページの推奨パターン**:

```typescript
// 詳細ページも同様に useMemo マップで解決
<FormColumns columns={2}>
  <div>
    <Label className="text-muted-foreground text-xs">担当者</Label>
    <p className="font-medium">
      {(incident._geek_assignedtoid_value && userMap.get(incident._geek_assignedtoid_value)) || "未割当"}
    </p>
  </div>
  <div>
    <Label className="text-muted-foreground text-xs">報告者</Label>
    <p className="font-medium">
      {(incident._createdby_value && userMap.get(incident._createdby_value)) || "-"}
    </p>
  </div>
</FormColumns>
```

### データソース未登録テーブルの Lookup 名前解決（OData FormattedValue 活用）

`npx power-apps add-data-source` でデータソースを追加しても、**Power Apps ランタイムで「Data source not found」エラー**が発生し、そのテーブルの SDK サービスが使えないケースがある。

```
❌ データソース追加・ビルド・デプロイしても解決しない
   → "Data source not found: Unable to find data source: {tableName} in data sources info."
   → SDK 生成サービス（{Table}Service.getAll()）も getClient().retrieveMultipleRecordsAsync() も同じエラー
   → dataSourcesInfo.ts にエントリが存在しても、ランタイム側のデータソース登録が反映されない

✅ OData FormattedValue アノテーションを使って Lookup 名を取得する
   → 登録済みデータソースから取得したレコードの Lookup 列には、自動で名前が付与される
   → SDK の retrieveMultipleRecordsAsync が返す raw オブジェクトに含まれる
```

**原因**: Power Apps Code Apps のランタイムが管理するデータソースレジストリと、ローカルの `dataSourcesInfo.ts` が同期しないプラットフォーム問題。一部のテーブル（特に後から追加したもの）で発生する。

**解決パターン 1: Lookup 列の FormattedValue から名前を取得**

Dataverse の OData API は、Lookup 列（`_xxx_value`）に対応するフォーマット済み値を
`_xxx_value@OData.Community.Display.V1.FormattedValue` プロパティとして自動的に返す。
SDK 生成サービスの型定義にはこのプロパティが含まれないが、**raw オブジェクトには存在する**。

```typescript
// 例: 登録済みテーブル（例: 在庫テーブル）のレコードから、
//      未登録テーブル（例: 倉庫テーブル）の名前を取得する

// --- パターン A: 一覧取得時に Lookup 名を付与 ---
export async function getRecordsWithLookupNames(): Promise<MyRecord[]> {
  const client = await getClient();
  const result = await client.retrieveMultipleRecordsAsync(
    "registeredtablename",  // ← データソース登録済みテーブル
    {
      select: [
        "primaryid", "name",
        "_lookupfield_value",  // ← 未登録テーブルへの Lookup GUID
      ],
      filter: "statecode eq 0",
    }
  );
  if (!result.success) throw result.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (result.data ?? []).map((raw: any) => {
    const record = raw as MyRecord;
    // OData FormattedValue アノテーションから Lookup 先の名前を取得
    const lookupName = raw["_lookupfield_value@OData.Community.Display.V1.FormattedValue"];
    if (lookupName) record._lookupfield_name = lookupName;
    return record;
  });
}
```

```typescript
// --- パターン B: 登録済みテーブルから未登録テーブルの名前マップを構築 ---
// Lookup 先テーブルが未登録でも、Lookup 元テーブルが登録済みなら名前を取得可能

export interface LookupInfo {
  id: string;
  name: string;
}

export async function getLookupNamesFromRegisteredTable(): Promise<LookupInfo[]> {
  const result = await RegisteredTableService.getAll({
    select: ["primaryid", "_lookupfield_value"],
    filter: "statecode eq 0",
  });
  if (!result.success || !result.data) return [];

  const nameMap = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const raw of result.data as any[]) {
    const id = raw._lookupfield_value as string | undefined;
    const name = raw["_lookupfield_value@OData.Community.Display.V1.FormattedValue"] as string | undefined;
    if (id && name && !nameMap.has(id.toLowerCase())) {
      nameMap.set(id.toLowerCase(), name);
    }
  }

  return Array.from(nameMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

**型定義の拡張:**

```typescript
// Dataverse が返す raw レコードには FormattedValue が含まれるが、
// SDK 生成型には定義されない。型に手動で追加する。
export interface MyRecord {
  primaryid: string;
  name: string;
  _lookupfield_value?: string;
  _lookupfield_name?: string;  // ← FormattedValue から取得した名前用
}
```

**UI での使い方:**

```typescript
// FormattedValue 由来の名前を第一候補、useMemo マップをフォールバック
{record._lookupfield_value && (
  <span>
    {record._lookupfield_name
      ?? lookupNameMap.get(record._lookupfield_value.toLowerCase())
      ?? "不明"}
  </span>
)}
```

**重要な注意事項:**
- **FormattedValue はランタイムの Dataverse OData API が自動付与する** — `select` に指定する必要はない。Lookup 列（`_xxx_value`）を `select` に含めれば自動で返される
- **SDK 生成サービスの型（TypeScript）にはこのプロパティがない** — `any` キャストで raw オブジェクトからアクセスする必要がある
- **データソース登録済みテーブル経由でのみ取得可能** — 未登録テーブルに直接クエリはできない。登録済みテーブルの Lookup 列を経由して名前を取得する
- **この問題は `npx power-apps add-data-source` の再実行・`pac code push` の再デプロイでは解決しない** — プラットフォーム側のデータソースレジストリが更新されないため

### CodeAppsStarter テンプレートのクリーンアップ（必須）

CodeAppsStarter からプロジェクトを作成した場合、テンプレートのデモページ・コンポーネントが残る。
**アプリのテーマに無関係な要素はすべて削除**し、ユーザーのプロンプトに準拠したアプリのみ残す。

```
削除対象（インシデント管理の例）:
├── src/pages/home.tsx            ← テンプレートホーム（ロゴ表示）
├── src/pages/design-examples.tsx ← デザインショーケース（外部API呼出=CSP違反）
├── src/pages/guide.tsx           ← テンプレートガイド
├── src/pages/feedback.tsx        ← フィードバックページ
├── src/hooks/use-learn-catalog.ts ← Microsoft Learn API（CSP違反）
├── src/lib/learn-client.ts        ← 外部API呼出（CSP違反の根本原因）
├── src/lib/gallery-utils.ts       ← テンプレート専用ユーティリティ
├── src/lib/table-utils.tsx
├── src/lib/project-management-*.ts
├── src/components/chart-dashboard.tsx  ← recharts 依存
├── src/components/gantt-chart.tsx      ← テンプレートデモ
├── src/components/kanban-*.tsx         ← テンプレートデモ
├── src/components/tree-structure.tsx   ← mermaid 依存
├── src/components/gallery-*.ts(x)     ← テンプレートデモ
├── src/components/stats-cards.tsx      ← テンプレートデモ
├── src/components/*-gallery.tsx        ← テンプレートデモ
├── src/components/link-confirm-modal.tsx
├── src/components/code-block.tsx
├── src/components/hamburger-menu.tsx
├── src/components/csv-import-export.tsx
└── src/components/ui/chart.tsx    ← recharts 依存
```

**修正手順**:

1. `router.tsx`: テンプレートページのルートを削除、`/` を `/incidents` にリダイレクト
2. `_layout.tsx`: ヘッダーのアプリ名をテーマに合わせ変更、テンプレート外部リンク・フッター削除
3. `sidebar.tsx`: ナビゲーションをアプリのテーマに限定
4. テンプレート専用ファイルを削除
5. `npm remove mermaid recharts`（テンプレートデモ専用パッケージ）
6. `inline-edit-table.tsx` / `list-table.tsx` から `csv-import-export` 参照を削除
7. ビルド → 0 エラー確認 → デプロイ

> **残すコンポーネント**: `form-modal.tsx`, `inline-edit-table.tsx`, `list-table.tsx`, `loading-skeleton.tsx`,
> `fullscreen-wrapper.tsx`, `sidebar-layout.tsx`, `sidebar.tsx`, `mode-toggle.tsx`, `ui/` 配下全て。
> これらは将来の画面実装で活用できる汎用コンポーネント。


## 構築手順

詳細な構築手順（初期化・Dataverse 接続・ビルド・デプロイ）は [構築リファレンス](references/build-reference.md) を参照。

## 技術スタック

| レイヤー       | 技術                                   |
| -------------- | -------------------------------------- |
| UI             | React 18 + TypeScript                  |
| スタイリング   | Tailwind CSS + shadcn/ui               |
| データフェッチ | TanStack React Query                   |
| ルーティング   | React Router                           |
| ビルド         | Vite                                   |
| 状態管理       | React Query キャッシュ + React Context |
| Dataverse 通信 | DataverseService パターン              |

## TanStack React Query パターン

```typescript
// hooks/useIncidents.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useIncidents() {
  return useQuery({
    queryKey: ["incidents"],
    queryFn: () =>
      DataverseService.GetItems(
        "geek_incidents",
        "$select=geek_name,geek_status&$orderby=createdon desc",
      ),
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateIncidentInput) =>
      DataverseService.PostItem("geek_incidents", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["incidents"] }),
  });
}
```


## ビルド・デプロイの注意事項（検証済 2026-04-22）

### TypeScript ビルドエラー: 未使用 import

データソース追加やコンポーネント変更後に `npm run build` で `TS6133: 'xxx' is declared but its value is never read` が出る場合がある。
**tsconfig の `noUnusedLocals: true` が有効**のため、使わなくなった import は即座に削除する。

```
❌ npm run build → TS6133 エラーで失敗
   → import を整理せずに新機能を追加

✅ コンポーネント変更後は必ず不要 import を確認・削除してから build
```

### `npm run build` のコマンド結合に注意

PowerShell で `npm run build 2>&1` の後にテキストを付けると Vite の入力パスとして解釈される。

```
❌ npm run build 2>&1Check-Success?
   → Vite が "Check-Success?/index.html" を探しに行きビルド失敗

✅ npm run build 2>&1
   → $LASTEXITCODE で結果を確認
```

## .env 必須項目

```env
DATAVERSE_URL=https://xxx.crm7.dynamics.com
ENVIRONMENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  # pac code push -env で使用
SOLUTION_NAME=SolutionName
PUBLISHER_PREFIX=prefix
```

> **ENVIRONMENT_ID** はセッション詳細の `Environment ID` から取得。`pac code push -env` と `npx power-apps add-data-source --org-url` で使用する。

## Power Automate フロー統合（検証済 2026-04-30）

### フロー追加は `add-flow` を使う（`add-data-source --api-id logicflows` は旧方式）

Code Apps から Power Automate フロー（Copilot Studio エージェント呼び出し等）を利用する場合、**必ず `npx power-apps add-flow` を使用する**。

> 公式ドキュメント: https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/add-flows

```
❌ npx power-apps add-data-source --api-id logicflows --resource-name {flowname} --org-url {URL}
   → 旧方式。power.config.json に workflowDetails が生成されない
   → API Hub の接続解決が不十分で 502 BadGateway / NoResponse エラーが頻発
   → Copilot Studio エージェント呼び出し時にタイムアウトでフォールバックされる

✅ npx power-apps add-flow --flow-id {flow-id}
   → 新方式。power.config.json に workflowDetails（workflowEntityId, workflowName, workflowDisplayName）が追加
   → .power/schemas/logicflows/ に OpenAPI スキーマファイルが生成
   → API Hub 接続が正しく解決され、502 エラーが解消
```

**手順:**

```bash
# 1. 利用可能なフロー一覧を表示（ソリューション対応フローのみ）
npx power-apps list-flows
npx power-apps list-flows --search {name}  # 名前でフィルタ

# 2. フローを追加（Flow ID を指定）
npx power-apps add-flow --flow-id {flow-id}

# 3. フロー定義が変更された場合は再実行（アイデンポテント）
npx power-apps add-flow --flow-id {flow-id}

# 4. フローを削除する場合
npx power-apps remove-flow --flow-name {datasource-name}
npx power-apps remove-flow --flow-id {flow-id}
```

**生成されるファイル構成:**

```
power.config.json                              ← workflowDetails が追加される
.power/schemas/logicflows/{name}.Schema.json   ← OpenAPI スキーマ
.power/schemas/appschemas/dataSourcesInfo.ts   ← Connector エントリが追加
src/generated/services/{Name}Service.ts        ← 型付きサービスクラス
src/generated/models/{Name}Model.ts            ← 入出力の TypeScript 型
```

**power.config.json の違い（旧方式 vs 新方式）:**

```jsonc
// ❌ 旧方式: workflowDetails がない
{
  "connectionReferences": {
    "uuid": {
      "id": "/providers/Microsoft.PowerApps/apis/shared_logicflows",
      "displayName": "Logic flows",
      "dataSources": ["myflow"]
    }
  }
}

// ✅ 新方式: workflowDetails で接続が正しく紐付く
{
  "connectionReferences": {
    "uuid": {
      "id": "/providers/Microsoft.PowerApps/apis/shared_logicflows",
      "displayName": "Logic flows",
      "dataSources": ["myflow"],
      "workflowDetails": {
        "workflowEntityId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "workflowDisplayName": "myflow",
        "workflowName": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      }
    }
  }
}
```

**旧方式から新方式への移行手順:**

1. `power.config.json` の `connectionReferences` からフロー関連エントリを削除
2. `npx power-apps add-flow --flow-id {flow-id}` で再追加
3. `npm run build && npx power-apps push`（または `pac code push`）でデプロイ

### フロー呼び出しの制約事項

```
・PowerApps トリガー（手動フロー）のみサポート
  → スケジュール・自動化・PowerApps 以外のトリガーは非対応
・ソリューション対応フローのみ
  → list-flows で表示されないフローはソリューションに追加してから add-flow
・フロー定義変更時は手動で再追加が必要
  → add-flow --flow-id を再実行してサービスファイルを再生成
```

### Copilot Studio エージェント呼び出しフローの応答パース（検証済 2026-04-30）

Copilot Studio の `ExecuteCopilotAsyncV2`（エージェントを実行して待機する）アクションは、`body/responses` を **JSON 配列文字列** で返す。Power Automate の「Power App またはフローに応答する」で `@{outputs('...')?['body/responses']}` と文字列補間すると、Code Apps 側には `["応答テキスト"]` という配列ラッパー付き文字列が届く。

```
❌ flowResult.data.response をそのまま表示
   → ["応答テキスト"] とブラケット付きで表示される

✅ JSON.parse() → 配列の最初の要素を取得
   → パースエラー時はフォールバックで生文字列を使用
```

**実装パターン:**

```typescript
// Copilot Studio フローの応答をパースするヘルパー
function parseCopilotResponse(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return String(parsed[0]);
    }
    if (typeof parsed === "string") {
      return parsed;
    }
  } catch {
    // JSON パース失敗 → 生文字列をそのまま使用
  }
  return raw;
}

// フロー呼び出し後の応答処理
const flowResult = await MyFlowService.Run({ text: query, text_1: context });
if (flowResult.success && flowResult.data?.response) {
  const answer = parseCopilotResponse(flowResult.data.response);
  // answer は Markdown 形式のテキスト（参照リンク付き）
}
```

**フロー定義側の注意:**

```jsonc
// Power Automate「Power App またはフローに応答する」アクション
{
  "body": {
    // body/responses は JSON 配列 → 文字列補間で配列ごと入る
    "response": "@{outputs('エージェントを実行して待機する')?['body/responses']}"
  }
}
```

### Copilot Studio フロー呼び出しのエラーハンドリング

Copilot Studio エージェントの応答には数十秒かかる場合がある（検証では約 48 秒）。API Hub のゲートウェイタイムアウトで 502 エラーが発生しうるため、**ローカル検索へのフォールバック**を必ず実装する。

```typescript
try {
  const { MyFlowService } = await import("@/generated/services/MyFlowService");
  const flowResult = await MyFlowService.Run({ text: query, text_1: context });

  if (flowResult.success && flowResult.data?.response) {
    answer = parseCopilotResponse(flowResult.data.response);
    format = "markdown";
  } else {
    throw new Error(`Flow failed: ${JSON.stringify(flowResult)}`);
  }
} catch (err) {
  // 502 BadGateway / タイムアウト時はローカル検索にフォールバック
  console.warn("[Copilot] Flow call failed, falling back to local search:", err);
  const result = localSearch(query);
  answer = result.answer;
  format = "plain";
}
```

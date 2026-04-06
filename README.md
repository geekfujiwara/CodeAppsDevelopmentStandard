# Power Apps Code Apps 開発標準

> **Power Apps Code Apps** は React / TypeScript などのコードファーストアプローチで Web アプリを構築し、Power Platform のインフラ上で実行できる機能です（一般提供 (GA) 済み）。Microsoft Entra 認証、1,500+ コネクター、管理プラットフォームポリシーに対応しています。

このリポジトリは、**Power Apps Code Apps プロジェクトのスキャフォールド**と**開発標準ガイド**を提供します。Microsoft 公式ドキュメントと [PowerAppsCodeApps リポジトリ](https://github.com/microsoft/PowerAppsCodeApps) に基づいたベストプラクティスに従っています。

> 📝 **本リポジトリは [ギークフジワラ](https://twitter.com/geekfujiwara) の実務経験・検証に基づき継続的に更新されています。** Power Apps Code Apps と Dataverse を組み合わせた開発の実践ノウハウを反映しています。

---

## 🤖 GitHub Copilot での活用方法（推奨）

**推奨モデル: Claude Opus 4.6**

本リポジトリは **GitHub Copilot のコンテキスト**として活用することを想定しています。以下のように使ってください:

1. GitHub Copilot（Agent モード）に本リポジトリの URL を渡す
2. 「〇〇を作成して」と伝える

```
このリポジトリを参照して、IT資産管理アプリを作成してください。
https://github.com/geekfujiwara/CodeAppsDevelopmentStandard
```

これにより、本リポジトリの開発標準・コネクタ設定・デザインシステムに準拠したコードを GitHub Copilot が生成してくれます。

> 💡 **ユーザーからの指示が曖昧な場合**: GitHub Copilot は不明点をユーザーに質問（Ask User Question）して確認しながら実装を進めます。要件を完全に明確にしてから実装することで、手戻りを防ぎ品質の高いアプリケーションを構築できます。

---

## 📋 目次

- [GitHub Copilot での活用方法（推奨）](#-github-copilot-での活用方法推奨)
- [前提条件](#-前提条件)
- [クイックスタート](#-クイックスタート)
- [プロジェクト構造](#-プロジェクト構造)
- [PAC CLI コマンドリファレンス](#-pac-cli-コマンドリファレンス)
- [コネクタ設定](#-コネクタ設定)
- [開発ガイド](#-開発ガイド)
- [デプロイ](#-デプロイ)
- [制限事項](#-制限事項)
- [トラブルシューティング](#-トラブルシューティング)
- [参考リファレンス](#-参考リファレンス)
- [ライセンス](#-ライセンス)

---

## 🔧 前提条件

| 項目 | 詳細 |
|------|------|
| **Visual Studio Code** | [Power Platform Tools 拡張機能](https://marketplace.visualstudio.com/items?itemName=microsoft-IsvExpTools.powerplatform-vscode) をインストール |
| **Awesome Copilot プラグイン** | VS Code に **Code Apps** および **Dataverse** のプラグインをインストール（[詳細はこちら](https://www.geekfujiwara.com/tech/powerplatform/8082/)） |
| **GitHub Copilot** | VS Code に GitHub Copilot 拡張機能をインストール（推奨モデル: **Claude Opus 4.6**） |
| **Node.js** | LTS バージョン（v18.x または v20.x 推奨） |
| **Git** | バージョン管理用 |
| **Power Platform CLI (PAC CLI)** | 最新バージョン（`npm install -g @microsoft/power-apps-cli` または VS Code 拡張機能に同梱） |
| **Power Platform 環境** | Code Apps が有効化されていること（管理者設定が必要） |
| **ライセンス** | エンドユーザーに Power Apps Premium ライセンスが必要 |
| **Azure アカウント** | Azure SQL など Azure コネクタを使用する場合（任意） |

> ⚡ **Awesome Copilot の Code Apps / Dataverse プラグイン**をインストールすることで、GitHub Copilot を通じて**会話形式で Dataverse テーブルの設計・作成・デプロイ**が可能になります。従来の Power Apps ポータル UI でのテーブル作成よりもこちらを優先してください。詳細な注意点は[こちらのブログ記事](https://www.geekfujiwara.com/tech/powerplatform/8082/)を参照してください。

---

## 🚀 クイックスタート

### 1. CodeAppsStarter のクローンと依存関係のインストール

新規プロジェクトは **[CodeAppsStarter](https://github.com/geekfujiwara/CodeAppsStarter)** をベースにしてください。このテンプレートには標準デザイン（Tailwind CSS + shadcn/ui）と実装パターンがあらかじめ組み込まれています。

```bash
git clone https://github.com/geekfujiwara/CodeAppsStarter.git
cd CodeAppsStarter
npm install
```

### 2. Power Platform 認証

```bash
# Power Platform 環境に認証
pac auth create --environment {environment-id}

# 対象環境を選択
pac env select --environment {environment-url}
```

### 3. Code App の初期化

```bash
# Code App プロジェクトを初期化（power.config.json が生成/更新されます）
pac code init --displayName "My Code App"
```

### 4. Dataverse テーブルの作成（GitHub Copilot 推奨）

Dataverse テーブルの作成は、**Awesome Copilot の Dataverse プラグイン**を使い、VS Code 上の GitHub Copilot で会話形式で行うことを推奨します。Power Apps ポータル UI での手動作成よりもこちらを優先してください。

```
# GitHub Copilot Agent モードで以下のように依頼
「IT資産管理用の Dataverse テーブルを作成してください。
テーブル名: IT Asset
フィールド: 資産名(テキスト), シリアル番号(テキスト), 購入日(日付), ステータス(選択肢), 担当者(Lookup)」
```

> ⚠️ **注意点**（[検証結果の詳細はこちら](https://www.geekfujiwara.com/tech/powerplatform/8082/)）:
> - Awesome Copilot の Code Apps および Dataverse プラグインが VS Code にインストールされていることを確認してください
> - Dataverse テーブル設計では、既存のシステムテーブル（SystemUser 等）との関係を理解した上で設計してください
> - AI が生成した設計は必ずレビューし、組織固有の要件に合っているか確認してください
> - 認証・MCP サーバーの設定エラーが発生した場合は、エンドポイント URL と認証情報を再確認してください

### 5. コネクタの追加（例: Office 365 Users）

```bash
# 利用可能な接続を確認
pac connection list

# Office 365 Users コネクタを追加
pac code add-data-source -a shared_office365users -c {connection-id}
```

### 6. ローカル開発の開始

```bash
# Vite 開発サーバーと PAC CLI を並列実行
npm run dev

# Vite 単体で実行する場合（PAC CLI なし）
npm run dev:vite
```

アプリは `http://localhost:3000` で起動します（ポート 3000 は Power Apps SDK の要件です）。

### 7. Power Platform へのデプロイ（標準デザインの確認）

CodeAppsStarter を Code App としてデプロイし、標準デザインを確認します:

```bash
# プロダクションビルド
npm run build

# Power Platform にデプロイ
pac code push
```

デプロイされた CodeAppsStarter の画面構成・デザインを標準として認識した上で、追加開発を行ってください。

---

## 📁 プロジェクト構造

```
.
├── src/
│   ├── components/          # 再利用可能な UI コンポーネント
│   │   ├── UserProfile.tsx  #   Office 365 Users コネクタのサンプル
│   │   ├── ErrorDisplay.tsx #   エラー表示共通コンポーネント
│   │   └── LoadingDisplay.tsx # ローディング表示共通コンポーネント
│   ├── services/            # PAC CLI 自動生成のコネクタサービス
│   │   └── Office365UsersService.ts  # プレースホルダー（PAC CLI で置換）
│   ├── models/              # PAC CLI 自動生成の TypeScript モデル
│   ├── hooks/               # カスタム React フック
│   │   └── useConnector.ts  #   コネクタ操作の状態管理フック
│   ├── utils/               # ユーティリティ関数
│   │   └── errorHandling.ts #   エラーハンドリング・リトライ
│   ├── types/               # TypeScript 型定義
│   │   ├── user.ts          #   ユーザー関連の型
│   │   └── connector.ts     #   コネクタレスポンスの共通型
│   ├── PowerProvider.tsx    # Power Platform 初期化コンポーネント
│   ├── App.tsx              # メインアプリケーション
│   └── main.tsx             # エントリーポイント
├── assets/                  # 静的アセット（ロゴ、ファビコン）
├── docs/                    # 詳細リファレンスドキュメント
├── index.html               # HTML エントリーポイント
├── package.json             # 依存関係とスクリプト
├── tsconfig.json            # TypeScript 設定
├── vite.config.ts           # Vite ビルド設定
├── power.config.json        # Power Platform メタデータ（PAC CLI 生成）
└── eslint.config.js         # ESLint 設定
```

---

## 📟 PAC CLI コマンドリファレンス

### 認証と環境

```bash
# 環境に認証
pac auth create --environment {environment-id}

# 対象環境を選択
pac env select --environment {environment-url}

# 認証情報の確認
pac auth list
```

### プロジェクト初期化

```bash
# Code App プロジェクトの初期化
pac code init --displayName "App Name"
```

### データソース（コネクタ）管理

```bash
# 利用可能な接続を一覧表示
pac connection list

# データソースを追加
pac code add-data-source -a {api-name} -c {connection-id}
```

### デプロイ

```bash
# ローカル開発実行
pac code run

# Power Platform にデプロイ
pac code push
```

---

## 🔌 コネクタ設定

### サポートされるコネクタ

| コネクタ | API 名 | 主な用途 |
|---------|--------|---------|
| **SQL Server** (Azure SQL 含む) | `shared_sql` | CRUD 操作、ストアドプロシージャ |
| **SharePoint** | `shared_sharepointonline` | ドキュメントライブラリ、リスト |
| **Office 365 Users** | `shared_office365users` | プロフィール情報、ユーザー写真 |
| **Office 365 Groups** | `shared_office365groups` | チーム情報、コラボレーション |
| **Azure Data Explorer** | `shared_kusto` | 分析・ビッグデータクエリ |
| **OneDrive for Business** | `shared_onedriveforbusiness` | ファイルストレージ、共有 |
| **Microsoft Teams** | `shared_teams` | チームコラボレーション、通知 |
| **MSN Weather** | `shared_msnweather` | 天気データ連携 |
| **Microsoft Translator V2** | `shared_microsofttranslator` | 多言語翻訳 |
| **Dataverse** | `dataverse` | CRUD 操作、リレーションシップ（`-t` でテーブル指定、テーブル作成は GitHub Copilot 推奨） |

### コネクタ追加の手順

```bash
# 1. 接続 ID を確認
pac connection list

# 2. コネクタを追加（例: Office 365 Users）
pac code add-data-source -a shared_office365users -c {connection-id}

# 3. 自動生成されるファイルを確認
#    - src/services/ にサービスファイル
#    - src/models/ に型定義ファイル
```

### Office 365 Users コネクタの使用例

```typescript
import { Office365UsersService } from "../services/Office365UsersService";

// 現在のユーザーのプロフィールを取得
const profile = await Office365UsersService.MyProfile_V2(
  "id,displayName,jobTitle,department,mail,userPrincipalName"
);
console.log(profile.data.displayName);

// ユーザー写真を取得
const photoData = await Office365UsersService.UserPhoto_V2(profile.data.id);

// ユーザーを検索
const results = await Office365UsersService.SearchUser_V2("田中", 10);
```

---

## 💻 開発ガイド

### NPM スクリプト

| コマンド | 説明 |
|---------|------|
| `npm run dev` | Vite + PAC CLI を並列実行（ローカル開発） |
| `npm run dev:vite` | Vite 単体で実行 |
| `npm run build` | TypeScript コンパイル + Vite ビルド |
| `npm run preview` | プロダクションビルドのプレビュー |
| `npm run lint` | ESLint によるコード品質チェック |

### PowerProvider の使い方

`PowerProvider` は Power Platform SDK の初期化を管理する React Context Provider です。アプリケーションのルートで使用します。

```tsx
// src/main.tsx
import { PowerProvider } from "./PowerProvider";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PowerProvider>
      <FluentProvider theme={webLightTheme}>
        <App />
      </FluentProvider>
    </PowerProvider>
  </React.StrictMode>
);
```

コンポーネント内で SDK の状態を取得:

```tsx
import { usePower } from "./PowerProvider";

const MyComponent = () => {
  const { isInitialized, isLoading, error } = usePower();

  if (isLoading) return <Spinner label="接続中..." />;
  if (error) return <ErrorDisplay error={error} />;
  // isInitialized === true の場合、コネクタ操作が可能
};
```

### useConnector フック

コネクタ操作の状態管理（データ・ローディング・エラー）を簡潔に扱えるカスタムフックです。

```tsx
import { useConnector } from "./hooks/useConnector";
import type { UserProfileData } from "./types/user";

const { data, isLoading, error, execute } = useConnector<UserProfileData>();

useEffect(() => {
  execute(async () => {
    const response = await Office365UsersService.MyProfile_V2("id,displayName");
    return response.data;
  });
}, [execute]);
```

### エラーハンドリング

コネクタ操作では必ず `try/catch` パターンを使用してください。

```typescript
import { getConnectorErrorMessage, withRetry } from "./utils/errorHandling";

try {
  // リトライ付きで操作を実行（デフォルト: 最大 3 回、指数バックオフ）
  const result = await withRetry(async () => {
    return await Office365UsersService.MyProfile_V2("id,displayName");
  });
} catch (err) {
  const message = getConnectorErrorMessage(err, "プロフィール取得");
  console.error(message);
}
```

### ベストプラクティス

- ✅ ローカル開発はポート 3000 を使用（Power Apps SDK の要件）
- ✅ `tsconfig.json` で `verbatimModuleSyntax: false` を設定
- ✅ `vite.config.ts` で `base: "./"` を設定
- ✅ 機密データはアプリコード内ではなくデータソースに保存
- ✅ PAC CLI が生成した TypeScript モデルとサービスを使用
- ✅ PowerProvider で非同期初期化とエラーハンドリングを実装
- ✅ コネクタ操作に適切なエラーハンドリングを実装
- ✅ Fluent UI React コンポーネントで一貫した UI を構築

---

## 🚢 デプロイ

### Power Platform へのデプロイ

```bash
# 1. プロダクションビルド
npm run build

# 2. Power Platform にプッシュ
pac code push
```

### デプロイ前チェックリスト

- [ ] `npm run build` がエラーなく完了する
- [ ] `npm run lint` で重大な警告がない
- [ ] コネクタの接続設定が正しい
- [ ] Power Platform 環境に認証済み（`pac auth list` で確認）
- [ ] `power.config.json` が最新

---

## ⚠️ 制限事項

Power Apps Code Apps には以下の制限があります:

| 制限事項 | 詳細 |
|---------|------|
| Content Security Policy (CSP) | 未サポート |
| ストレージ SAS IP 制限 | 未サポート |
| Power Platform Git 統合 | 未サポート |
| Dataverse ソリューション | 未サポート |
| Azure Application Insights | ネイティブ統合なし |

---

## 🔍 トラブルシューティング

### よくある問題と解決方法

#### SDK 初期化エラー

```
Error: Power Platform SDK の初期化に失敗しました
```

**原因**: PAC CLI が起動していない、または認証が切れている

**解決**:
1. `pac auth list` で認証状態を確認
2. `pac auth create --environment {id}` で再認証
3. `npm run dev` で Vite と PAC CLI を同時起動

#### コネクタ接続エラー

```
Error: Office365UsersService は pac code add-data-source で生成してください
```

**原因**: コネクタが追加されていない

**解決**:
1. `pac connection list` で接続を確認
2. `pac code add-data-source -a shared_office365users -c {connection-id}` で追加
3. `src/services/` に生成されたファイルを確認

#### ポート 3000 が使用中

```
Error: Port 3000 is already in use
```

**解決**: ポート 3000 を使用しているプロセスを終了してから再実行

```bash
# macOS / Linux
lsof -i :3000
kill -9 {PID}

# Windows
netstat -ano | findstr :3000
taskkill /PID {PID} /F
```

#### TypeScript ビルドエラー

```
Error: verbatimModuleSyntax
```

**解決**: `tsconfig.json` で `"verbatimModuleSyntax": false` が設定されていることを確認

---

## 📚 参考リファレンス

### 公式ドキュメント

- [Power Apps Code Apps 公式ドキュメント](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/)
- [Power Apps Code Apps サンプル (GitHub)](https://github.com/microsoft/PowerAppsCodeApps)
- [Power Platform CLI ドキュメント](https://learn.microsoft.com/ja-jp/power-platform/developer/cli/introduction)

### Awesome Copilot / Dataverse プラグイン

- [VS Code 拡張機能のスキルを用いて GitHub Copilot から Power Platform を開発する（注意点・検証結果）](https://www.geekfujiwara.com/tech/powerplatform/8082/)

### 詳細リファレンス（docs/）

| ドキュメント | 内容 |
|-------------|------|
| [docs/CONNECTOR_REFERENCE.md](./docs/CONNECTOR_REFERENCE.md) | コネクタ設定の詳細リファレンス |
| [docs/DATAVERSE_GUIDE.md](./docs/DATAVERSE_GUIDE.md) | Dataverse 統合ガイド |
| [docs/DESIGN_SYSTEM.md](./docs/DESIGN_SYSTEM.md) | デザインシステムガイド（CodeAppsStarter 標準デザイン） |
| [docs/ADVANCED_PATTERNS.md](./docs/ADVANCED_PATTERNS.md) | 高度な実装パターン |

### 関連リポジトリ

- [CodeAppsStarter（標準デザインテンプレート）](https://github.com/geekfujiwara/CodeAppsStarter) - **新規開発の起点**。Tailwind CSS + shadcn/ui を採用した標準デザインテンプレートです。まずこのテンプレートをクローン・デプロイして標準デザインを確認し、追加開発の出発点としてください。

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

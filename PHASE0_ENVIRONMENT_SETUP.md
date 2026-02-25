# Phase 0: 環境準備

## 📋 概要

このPhaseでは、Power Apps Code Apps開発に必要なすべてのツールと環境をセットアップします。

**主な実施内容:**
- 開発ツールのインストール
- Power Apps CLI（@microsoft/power-apps-cli）のセットアップ
- VS Code拡張機能のインストール
- Power Platform環境の確認

> **📢 お知らせ**: Power Platform CLI（`pac`）は、Code Apps開発では不要になりました。新しいnpmベースのCLI（`@microsoft/power-apps-cli`）を使用します。

---

## 🎯 Phase 0の目標

```mermaid
graph LR
    A[開発ツール準備] --> B[Power Platform環境確認]
    B --> C[VS Code + 拡張機能設定]
    C --> D[環境準備完了]
```

**完了条件:**
- ✅ 必要な開発ツールがインストールされている
- ✅ @microsoft/power-apps-cli が正常に動作する
- ✅ Power Platform環境にアクセスできる
- ✅ VS Code拡張機能がインストールされている

---

## 📝 セットアップ手順

### 🚀 クイックスタート（Windows）

**wingetを使った一括インストール:**
```powershell
# Visual Studio Code
winget install Microsoft.VisualStudioCode

# Node.js (LTS版)
winget install OpenJS.NodeJS.LTS

# Git for Windows
winget install Git.Git

# Power Apps CLI（npm経由でインストール）
npm install -g @microsoft/power-apps-cli@latest
```

> **💡 ヒント**: VS Code起動後、拡張機能マーケットプレイスで「Power Platform Tools」をインストールしてください。

---

### Step 1: Node.jsのインストール

**推奨バージョン:** Node.js 18.x以上（LTS版）

**インストール方法:**

**Windows (winget):**
```powershell
winget install OpenJS.NodeJS.LTS
```

**macOS (Homebrew):**
```bash
brew install node@18
```

**手動インストール:**
1. [Node.js公式サイト](https://nodejs.org/) にアクセス
2. LTS版をダウンロード
3. インストーラーを実行

**確認方法:**
```bash
node --version
# v18.x.x または v20.x.x

npm --version
# 9.x.x以上
```

---

### Step 2: Power Apps CLIのインストール

Power Apps Code Apps開発には、npmベースの `@microsoft/power-apps-cli` を使用します。
Windows・macOS両方で同じnpmコマンドでインストールできます（クロスプラットフォーム対応）。

> **📢 重要**: 旧来の Power Platform CLI（`pac`）は Code Apps 開発には不要です。`@microsoft/power-apps-cli` を使用してください。

**インストール方法（Windows / macOS 共通）:**

```bash
# npm経由でグローバルインストール（推奨）
npm install -g @microsoft/power-apps-cli@latest
```

または、インストールせずに `npx` でその場実行することもできます:

```bash
# npxで直接実行（インストール不要）
npx @microsoft/power-apps-cli@latest [コマンド]
```

**確認方法:**
```bash
npx @microsoft/power-apps-cli --version
```

---

### Step 3: Power Platform環境の準備

#### 3-1. Power Platform環境へのアクセス確認

1. [Power Apps](https://make.powerapps.com) にアクセス
2. Microsoft アカウントでサインイン
3. 開発用環境を確認

**必要な権限:**
- 環境作成者（Environment Maker）または
- システムカスタマイザー（System Customizer）

#### 3-2. 開発用環境の作成（必要な場合）

1. Power Platform管理センター（https://admin.powerplatform.microsoft.com）にアクセス
2. 「環境」→「+新規」
3. 環境設定:
   - **名前**: Development Environment
   - **種類**: 試用版または開発者
   - **地域**: 日本
   - **Dataverseの追加**: はい

---

### Step 4: VS Codeのインストールと設定

#### 4-1. VS Codeのインストール

**Windows (winget):**
```powershell
winget install Microsoft.VisualStudioCode
```

**macOS (Homebrew):**
```bash
brew install --cask visual-studio-code
```

**手動インストール:**
1. [Visual Studio Code](https://code.visualstudio.com/) をダウンロード
2. インストーラーを実行

#### 4-2. 必須拡張機能のインストール

**Power Platform関連:**
- **Power Platform Tools** (microsoft-IsvExpTools.powerplatform-vscode)

**開発効率化:**
- **ES7+ React/Redux/React-Native snippets** (dsznajder.es7-react-js-snippets)
- **Tailwind CSS IntelliSense** (bradlc.vscode-tailwindcss)
- **Prettier - Code formatter** (esbenp.prettier-vscode)
- **ESLint** (dbaeumer.vscode-eslint)

**インストール方法（コマンドパレット使用）:**
1. VS Codeを開く
2. `Ctrl+Shift+P` (Mac: `Cmd+Shift+P`)
3. "Extensions: Install Extensions"を選択
4. 拡張機能名で検索してインストール

**または、コマンドラインから:**
```bash
code --install-extension microsoft-IsvExpTools.powerplatform-vscode
code --install-extension dsznajder.es7-react-js-snippets
code --install-extension bradlc.vscode-tailwindcss
code --install-extension esbenp.prettier-vscode
code --install-extension dbaeumer.vscode-eslint
```

---

### Step 5: Power Apps CLI 認証について

`@microsoft/power-apps-cli` では、**認証は自動**で行われます。
`pac auth create` のような事前認証コマンドは不要です。

#### 5-1. 自動認証の仕組み

CLIコマンド（`init`、`push`、`add-data-source` など）を初めて実行すると、ブラウザが自動的に開き、Microsoftアカウントでのサインインが求められます。

**認証フロー:**
1. CLIコマンドを実行（例: `npx @microsoft/power-apps-cli init ...`）
2. ブラウザが自動的に開く（MSAL認証）
3. Microsoft アカウントでサインイン
4. Power Platform環境へのアクセスを許可
5. 認証完了後、コマンドが継続実行される

#### 5-2. ログアウト

認証情報をクリアする場合は以下のコマンドを使用します:

```bash
npx @microsoft/power-apps-cli logout
```

---

### Step 6: Git設定（オプション）

バージョン管理を使用する場合、Gitの設定を行います。

**Gitのインストール:**

**Windows (winget):**
```powershell
winget install Git.Git
```

**macOS (Homebrew):**
```bash
brew install git
```

**手動インストール:**
- [Git公式サイト](https://git-scm.com/) からダウンロードしてインストール

**基本設定:**
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

**VS Code統合:**
VS CodeにはGitが統合されているため、追加設定は不要です。

---

## ✅ Phase 0 完了チェックリスト

### 開発ツール
- [ ] Node.js 18.x以上がインストールされている
- [ ] npm が正常に動作する
- [ ] @microsoft/power-apps-cli がインストールされている
- [ ] `npx @microsoft/power-apps-cli --version` でバージョンが表示される

### Power Platform
- [ ] Power Platform環境にアクセスできる
- [ ] 認証はCLIコマンド実行時にブラウザが自動的に開くことを確認した（MSAL）
- [ ] 開発用環境が準備されている

### VS Code
- [ ] VS Codeがインストールされている
- [ ] Power Platform Tools拡張機能がインストールされている
- [ ] その他の開発効率化拡張機能がインストールされている

### 権限確認
- [ ] Power Platform環境の作成権限がある
- [ ] アプリの作成権限がある
- [ ] Dataverseへのアクセス権限がある
- [ ] Code Apps が有効化されている環境を使用している
- [ ] Power Apps Premium ライセンスが利用可能

---

## 💡 AI活用のヒント

Phase 0完了後のAI支援例:
- *"開発環境をセットアップしました。Power Platform環境に接続できていますか？"*
- *"環境準備が完了しました。MVPの開発を開始しますか？"*
- *"必要な拡張機能がすべてインストールされているか確認してください"*

---

## 🔧 トラブルシューティング

### @microsoft/power-apps-cli が認識されない

**グローバルインストールの確認と再インストール:**
```bash
# 現在のバージョンを確認
npx @microsoft/power-apps-cli --version

# 再インストール
npm uninstall -g @microsoft/power-apps-cli
npm install -g @microsoft/power-apps-cli@latest
```

**または npx で直接実行（インストール不要）:**
```bash
npx @microsoft/power-apps-cli@latest --version
```

### 認証エラーが発生する

```bash
# ログアウトして認証情報をクリア
npx @microsoft/power-apps-cli logout

# 次回CLIコマンド実行時にブラウザが開き、自動的に再認証されます
# 例: npx @microsoft/power-apps-cli init --environmentId [id] --displayName "[名前]"
```

### 環境が表示されない

- Power Platform管理センターで環境の状態を確認
- 適切な権限が付与されているか確認
- 環境のURLが正しいか確認

---

## 📚 参考リンク

- [@microsoft/power-apps-cli npm クイックスタート](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/npm-quickstart)
- [Power Apps Code Apps公式ドキュメント](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/)
- [Node.js公式サイト](https://nodejs.org/)
- [Visual Studio Code公式サイト](https://code.visualstudio.com/)

---

## 🔄 次のステップ

Phase 0が完了したら、次は **Phase 1: Microsoft標準テンプレート・デプロイ** に進みます。

> **⚠️ 重要: 新しい開発プロセス**
>
> **aka.ms/CodeApps リポジトリでSDKが更新されたため、開発プロセスが変更されました:**
>
> **Phase 1での作業:**
> 1. Microsoft標準テンプレート（Vite + React + TypeScript）を使用
> 2. `npm create vite@latest . -- --template react-ts` でプロジェクト作成
> 3. `@microsoft/power-apps` SDKをインストール
> 4. 改変せずにデプロイ（SDK互換性確保）
>
> **Phase 2での作業:**
> 1. CodeAppsStarterを**参照**（全体クローンはしない）
> 2. 必要な機能のみを段階的に追加
> 3. `npx shadcn-ui@latest add [component]` でUIコンポーネント追加
>
> **Phase 3での作業:**
> 1. Dataverseやコネクター接続（最後のステップ）
>
> この新しいプロセスにより、SDK初期化エラーを回避し、最新SDKとの互換性を保証します。

👉 **Phase 1に進む前に、READMEの[開発フロー概要](./README.md#開発フローの概要)を確認してください**



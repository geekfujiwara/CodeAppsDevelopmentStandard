# ブラウザ自動化方針（VS Code 統合ブラウザ必須 / Playwright インストール禁止）

複数スキル（cowork / update-skills / copilot-studio-v2 等）から参照される横断ルール。
ポータル操作を伴うすべてのタスクで、この方針を最優先で適用する。

## 原則

- **すべてのブラウザ操作**（管理ポータルのフォーム入力、OAuth クライアント登録、
  Purview 等のダイアグノーシスなど）は **VS Code 統合ブラウザツール**を使う。
- **Playwright MCP（`npx @playwright/mcp@latest`）や Playwright 単体ブラウザの
  インストール・起動（`npx playwright install chrome` / `chromium` 等）は、
  いかなる場合も実施しない。**
- 理由:
  - 統合ブラウザはユーザーの既存サインインセッション（Cookie / SSO）を共有できるため、
    認証済みポータル（Purview・Teams 開発者ポータル・M365 管理センター等）で
    毎回の追加サインインが発生しない。
  - Playwright 単体の Chrome/Chromium は別プロファイルの新規プロセスになり、
    サインインをやり直す必要がある・ダウンロードに時間がかかる・環境によっては
    管理者権限やネットワーク許可が必要になるなど、余計な導入コストが発生する。

## 使用ツール一覧

| 操作 | ツール |
|---|---|
| ページを開く（既存タブがあれば再利用） | `open_browser_page` |
| 現在の状態を確認（アクセシビリティスナップショット） | `read_page` |
| クリック | `click_element` |
| 文字入力・キー操作 | `type_in_page` |
| ドラッグ&ドロップ | `drag_element` |
| モーダル / ファイル選択ダイアログへの応答（ファイルアップロード含む） | `handle_dialog`（`selectFiles` に絶対パスを渡す） |
| スクリーンショット（アクション不可、確認用のみ） | `screenshot_page` |

## 手順

1. `open_browser_page` で対象 URL を開く（同じホストの既存共有ページがあれば自動的に再利用される）。
2. `read_page` でアクセシビリティスナップショットを取得し、要素の `ref` を確認してから操作する
   （`ref` はページ遷移や再読み込みで無効になるため、都度取り直す）。
3. サインインが必要な画面が出たら、**ユーザー自身にブラウザ上でサインイン（パスワード・MFA 含む）してもらう**。
   資格情報（パスワード・ワンタイムコード等）の代行入力やチャットへの出力は行わない。
   メールアドレス・UPN 等の非秘密情報は代行入力してよい。
4. ファイルアップロード（「ファイルを選択」ボタン等）は、クリック後に `handle_dialog` の
   `selectFiles` にローカルの絶対パスを渡して応答する（OS ネイティブダイアログは DOM 外なので
   通常の `click_element` では選択できない）。
5. 機密値（クライアントシークレット等）は `.env` から読み、画面へ直接入力する。
   チャットや `vscode_askQuestions` には出さない。

## 禁止事項（再掲）

- `.vscode/mcp.json` への `playwright` MCP サーバー登録・起動。
- `npx playwright install chrome` / `chromium` / `chrome-for-testing` 等のブラウザダウンロード実行。
- 上記を代替するいかなる形の Playwright 単体プロセス起動。

## 既存ワークスペースに Playwright MCP が残っている場合

過去の設定で `.vscode/mcp.json` に `playwright` サーバーが登録されていても、
**新規に有効化・インストールし直さない**。統合ブラウザに切り替え、`playwright` エントリは
（他に依存箇所がなければ）削除してよい。

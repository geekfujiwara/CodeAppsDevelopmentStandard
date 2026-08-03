# ブラウザ自動化方針（VS Code 統合ブラウザ必須 / Playwright MCP・単体ブラウザ禁止）

複数スキル（cowork / update-skills / copilot-studio-v2 等）から参照される横断ルール。
ポータル操作を伴うすべてのタスクで、この方針を最優先で適用する。

## 必須ゲート: Edge プロファイルを確認してから開く

ブラウザを開く可能性がある操作では、**最初のブラウザ起動・ページ共有・URL 遷移・
対話認証より前**に `AskUserQuestion` を使い、使用する Microsoft Edge プロファイルを
ユーザーに確認する。回答を得るまではブラウザ操作や、ブラウザを自動起動する CLI / スクリプトを
実行しない。

質問例:

> この操作ではブラウザを開きます。使用する Microsoft Edge プロファイルを選択してください。

- 選択したプロファイルはタスク中の後続ブラウザ操作でも一貫して使用し、別プロファイルへ
   切り替える必要が生じた場合は、切り替える前に再度確認する。
- VS Code 統合ブラウザの `open_browser_page` にはプロファイル指定引数がない。選択した
   プロファイルのページを直接利用できない場合は、ユーザーにその Edge プロファイルで対象ページを
   開いて共有してもらい、共有されるまで操作を停止する。別プロファイルで代行しない。
- CLI や API だけで完結し、ブラウザを開かないことを事前に確認できた操作では質問不要。
   ただし `az login`、`pac auth create`、`power-apps login` など、条件次第でブラウザを
   起動するコマンドは、実際に起動する直前に確認する。

## 原則

- **すべてのブラウザ操作**（管理ポータルのフォーム入力、OAuth クライアント登録、
  Purview 等のダイアグノーシスなど）は **VS Code 統合ブラウザツール群**
  （`open_browser_page` / `read_page` / `click_element` / `type_in_page` / `handle_dialog` /
  `drag_element` / `hover_element` / `screenshot_page` / `navigate_page`）を使う。
- **Playwright MCP サーバー（`npx @playwright/mcp@latest`）や Playwright 単体ブラウザの
  インストール・起動（`npx playwright install chrome` / `chromium` 等）は、
  いかなる場合も実施しない。**
- 理由:
  - VS Code 統合ブラウザはユーザーの既存サインインセッション（Cookie / SSO）を共有できるため、
    認証済みポータル（Purview・Teams 開発者ポータル・M365 管理センター等）で
    毎回の追加サインインが発生しない。
  - Playwright MCP サーバーや単体の Chrome/Chromium は別プロファイルの新規プロセスになり、
    サインインをやり直す必要がある・ダウンロードに時間がかかる・環境によっては
    管理者権限やネットワーク許可が必要になるなど、余計な導入コストが発生する。

## 使用ツール一覧

| 操作 | ツール |
|---|---|
| ページを開く（既存の共有ページがあれば再利用） | `open_browser_page` |
| 開いたページ内で URL 遷移・戻る/進む・再読み込み | `navigate_page` |
| 現在の状態を確認（アクセシビリティスナップショット。操作前に必ず取得） | `read_page` |
| クリック | `click_element` |
| 文字入力・キー送信 | `type_in_page` |
| ホバー | `hover_element` |
| ドラッグ&ドロップ | `drag_element` |
| モーダル / ファイル選択ダイアログへの応答（ファイルアップロード含む） | `handle_dialog`（`selectFiles` に絶対パスを渡す） |
| スクリーンショット（アクション不可、確認用のみ） | `screenshot_page` |

## 手順

1. [必須ゲート](#必須ゲート-edge-プロファイルを確認してから開く)に従い、`AskUserQuestion` で
   Edge プロファイルを確認する。回答前は以降へ進まない。
2. `open_browser_page` で対象 URL を開く（同一ホストの既存ページがあれば再利用されるため、
   新規タブを乱立させない）。
3. `read_page` でアクセシビリティスナップショットを取得し、要素の `ref` を確認してから操作する
   （`ref` はページ遷移や再読み込みで無効になるため、都度取り直す）。
4. サインインが必要な画面が出たら、**ユーザー自身にブラウザ上でサインイン（パスワード・MFA 含む）してもらう**。
   資格情報（パスワード・ワンタイムコード等）の代行入力やチャットへの出力は行わない。
   メールアドレス・UPN 等の非秘密情報は代行入力してよい。
5. ファイルアップロード（「ファイルを選択」ボタン等）は、クリック後に `handle_dialog` の
   `selectFiles` にローカルの絶対パスを渡して応答する（OS ネイティブダイアログは DOM 外なので
   通常の `click_element` では選択できない）。
6. 機密値（クライアントシークレット等）は `.env` から読み、画面へ直接入力する。
   チャットや `vscode_askQuestions` には出さない。

## 禁止事項（再掲）

- `.vscode/mcp.json` への `playwright` MCP サーバー登録・起動。
- `npx playwright install chrome` / `chromium` / `chrome-for-testing` 等のブラウザダウンロード実行。
- 上記を代替するいかなる形の Playwright MCP サーバー・単体プロセス起動。

## 既存ワークスペースに Playwright MCP が残っている場合

過去の設定で `.vscode/mcp.json` に `playwright` サーバーが登録されていても、
**新規に有効化・インストールし直さない**。VS Code 統合 Playwright ブラウザに切り替え、
`playwright` エントリは（他に依存箇所がなければ）削除してよい。

# Cowork Studio

Cowork プラグインを **作る → 確かめる → 登録する → 書き出す** までを 1 つの画面で操作する Windows アプリ。
cowork スキルのスクリプト（`../../scripts/`）をそのまま呼ぶ GUI で、Premiere Pro / After Effects の編集ワークスペースを手本にした
プロ向けのパネル構成にしている。**インストール不要**（.NET ランタイム同梱の 1 ファイル exe）。

## 画面

| パネル | 内容 |
|---|---|
| ワークスペース（上部中央） | **デザイン**（manifest・スキル・アイコン）/ **パイプライン**（診断・登録・インストール）/ **出力**（書き出しキュー） |
| インスペクター（左上） | manifest のフォーム（文字数カウンター・`+0.0.1`・アクセント色）と検証、ステップごとのパラメーター・操作・**承認待ちの計画** |
| ソース（左上） | 行番号付きエディター。JSON は保存前に構文を確認 |
| プログラム（右上） | Cowork カードのプレビュー、SKILL.md の表示、アイコンの要件確認（192 / 32）、計画の JSON、ステップの概要、パッケージの中身 |
| プロジェクト / コンソール / 出力キュー（左下） | プラグインとファイル、スクリプトの出力（秘密は伏せる・絞り込み）、Media Encoder 風のキュー |
| タイムライン（右下） | 7 工程（Entra → 同意 → MCP 許可 → OAuth 登録 → ビルド → 個人インストール → 組織に公開）を階段状のクリップで表示。再生ヘッドが次にやる工程を指し、完了範囲をワーク エリア バーで示す |

変更を伴う操作（OAuth 登録の作成、個人インストール・アンインストール）は、スクリプトの **dry-run → PLAN_HASH の承認カード → 承認して実行** の順でしか送らない。
初回サインインが必要なときはデバイス コードの画面が出る（コードは自動でコピー）。

## 使い方

```powershell
# 書き出し（.NET 8 SDK が必要なのは作る人だけ。exe は .NET 無しで動く）
pwsh .github/skills/cowork/tools/cowork-studio/build.ps1
# 起動（ルートは exe の場所・作業フォルダから自動で探す）
.github/skills/cowork/tools/cowork-studio/publish/CoworkStudio.exe
```

前提: リポジトリのルートに `.env`（`DATAVERSE_URL` / `TENANT_ID` / `COWORK_OAUTH_*`）、`python`（auth_helper のキャッシュ済み認証）、`pwsh`。
`.env` の値はスクリプトに環境変数として渡す。Python の場所は `COWORK_STUDIO_PYTHON` で変えられる。

| キー | 操作 |
|---|---|
| F5 | 全体を確認（診断・OAuth 登録の一覧・個人インストールの状態） |
| Ctrl+Enter | 選んだステップの主な操作（承認待ちなら承認） |
| Ctrl+S | 保存（manifest / ソース） |
| Ctrl+1 / 2 / 3 | デザイン / パイプライン / 出力 |
| Ctrl+M | 書き出し |
| ← / → | パイプラインでステップを移動 |

## コマンドライン（画面を出さない）

| 引数 | 用途 |
|---|---|
| `--root <dir>` `--plugin <name>` | ルートとプラグインを指定 |
| `--workspace design\|pipeline\|output` `--select manifest\|step:<n>\|file:<rel>` | 開く画面と選択 |
| `--no-refresh` | 起動時の「全体を確認」をしない |
| `--export package,report,manifest [--out <dir>]` | 書き出しキューを実行して終了（失敗があれば終了コード 1） |
| `--selftest <json>` | 検出したプラグイン・検証・各工程の状態を JSON に書いて終了 |
| `--screenshot <png> [--size 1600x960]` | 画面を PNG に描いて終了 |

## テスト

```powershell
# UI Automation で実際の画面を操作する（計画の作成と破棄まで。承認・実行はしない）
powershell -ExecutionPolicy Bypass -File .github/skills/cowork/tools/cowork-studio/tests/test_ui.ps1 `
  -Exe .github/skills/cowork/tools/cowork-studio/publish/CoworkStudio.exe -Root .
```

画面の状態はプラグインごとに `%LOCALAPPDATA%\CoworkStudio\state\` に保存する（個人インストールの titleId・公開の記録。リポジトリには置かない）。

# update-skills — 異常系・トラブルシュート

## 1. `validate_skill.py` がフォルダ名不一致を報告する
- 原因: frontmatter `name` とスキルフォルダ名が違う（kebab-case 不一致を含む）。
- 対処: どちらかを合わせる。`name` は小文字英数とハイフンのみ、先頭/末尾/連続ハイフン禁止。

## 2. Step 番号の連番エラー（飛び・重複）
- 原因: 見出しが `### Step 0:` `### Step 2:` のように飛んでいる、または重複している。
- 対処: `Step 0` から連続する整数に振り直す。番号は**整数のみ**（`Step 2.5` のような小数は不可）。
- 補足: validator は `## Step N` / `### Step N` の見出しを対象にする。小数や全角数字はヒットしない。

## 3. 秘匿情報スキャンがヒットする
- 検出例: 36 桁 GUID、`*.crm*.dynamics.com` の実 URL、`@`付き実メール、`*~*`（クライアントシークレット様）。
- 対処: プレースホルダーに置換する（`{your-tenant-id}` / `https://<org>.crm.dynamics.com` / `admin@example.com`）。
- 例外: 公式ドキュメントの well-known なシステム GUID（例: Dynamics CRM の `00000007-0000-0000-c000-000000000000`）は
  許可リストに入っている。誤検出が出た場合は `validate_skill.py` の `ALLOWLIST` に追記する。

## 4. `manage_skill_pr.py` が `gh` を見つけられない
- 原因: GitHub CLI が PATH に無い、または未認証。
- 対処: `gh auth status` を確認。Windows では PATH 追加が必要なことがある
  （例: `$env:PATH = "C:\Program Files\GitHub CLI;$env:PATH"`）。

## 5. オープン PR を更新したら push が rejected される
- 原因: リモートブランチが先に進んでいる（他者のコミット）。
- 対処: `git fetch origin && git rebase origin/<branch>`（または `git pull --rebase`）してから push。
  強制 push（`--force`）は共有ブランチでは避け、必要時は `--force-with-lease` を使い、事前に確認を取る。

## 6. 新規 PR が既存 PR とコンフリクトした
- 原因: 同じ集約ファイル（README カタログ等）を両方が編集している。
- 対処: [pr-strategy.md](pr-strategy.md) のケース 3 に従い、先行 PR をマージ後にリベース。
  そもそも集約ファイルの編集は最小行に留める。

## 7. Learn MCP が使えない環境 / ブラウザ操作は Playwright MCP を使わない
- Learn MCP 不在: `microsoft_docs_search` が無ければ Web 取得にフォールバックしつつ、出典 URL を残す。
- ブラウザ操作は常に **VS Code 統合 Playwright ブラウザ**（`playwright-browser_navigate` / `playwright-browser_click` /
  `playwright-browser_snapshot` / `playwright-browser_type` / `playwright-browser_handle_dialog`）を使う。Playwright MCP サーバー・Playwright 単体ブラウザは
  インストール・起動しない（→ [ブラウザ自動化方針](../../standard/references/browser-automation.md)）。
  統合ブラウザツールが提供されていない環境のみ、ブラウザ手順を手動手順として書き、
  画面パス・ボタン名・入力値を具体的に明記して後で自動化に置換できる粒度で残す。

## 8. push 直前スキャンでシークレットが見つかった
- 即中止。コミット済みなら `git restore --staged` / 履歴に入っていれば該当コミットを作り直す。
- `.env` がステージされていないか（`.gitignore` 済みか）を必ず確認する。

## 9. `validate_skill.py` が Windows コンソールで `UnicodeEncodeError`（❌ 等）
- 原因: 既定コンソールが cp932 で、絵文字マーカーを出力できない。
- 対処: スクリプトは `sys.stdout.reconfigure(encoding="utf-8")` を試み、失敗時は `[NG]`/`[WARN]`/`[OK]` の
  ASCII マーカーに自動フォールバックするため、そのまま動く。明示的に UTF-8 化したい場合は
  `$env:PYTHONIOENCODING="utf-8"` を設定する。

## 10. `@odata.bind` 等が「実メールらしき値」として誤検出される
- 原因: `parentbotid@odata.bind` のような OData アノテーションが `@` を含む。
- 対処: validator は `@odata.` / `@microsoft.` / `@xmlns.` と `noreply.github.com` を許可リストで除外する。
  別パターンの誤検出は `validate_skill.py` の `NON_EMAIL_RE` / `EMAIL_ALLOW` に追記する。

## 11. `publish_skill.py` の clone 先で commit が `please tell me who you are`
- 原因: 新規 clone には git identity（user.name / user.email）が未設定。
- 対処: `publish_skill.py` は `gh api user` のログインから identity を解決して
  `git -c user.name=... -c user.email=...` でコミットするため通常は自動解決する。
  手動でクローンした場合は `git config user.name` / `git config user.email` を設定してからコミットする。

## 12. `publish_skill.py` の使い方メモ
- 必須: `.env` に `SKILL_PR_REPO`（owner/repo）。`gh auth status` が認証済みであること。
- 主オプション: `--skill <name>`（必須）/ `--extra <path>`（README・agents 等の集約ファイルを同時反映、複数可）/
  `--branch`（既定 `skill/<name>`）/ `--dry-run`（push・PR をスキップして検証のみ）。
- 既存の同名ブランチ/PR があれば自動で更新（新規 PR を作らない）。

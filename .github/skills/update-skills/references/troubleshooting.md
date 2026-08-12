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
- ブラウザを開く前に `AskUserQuestion` で Microsoft Edge プロファイルを確認し、回答前は
  起動・遷移・認証を開始しない。同一タスクでは選択したプロファイルを継続利用する。
- `validate_skill.py` はブラウザ起動を示す Markdown に `AskUserQuestion` または
  `browser-automation.md` の参照が無い場合にエラー終了する。

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

## 13. `manage_skill_pr.py` が既存のオープン PR を「0 件」と誤検出する（`UnicodeDecodeError` がスレッド内で出る）
### 症状
`gh pr list` の PR タイトルに絵文字等の UTF-8 専用文字が含まれると、`subprocess.run(..., text=True)` の
バックグラウンド読み取りスレッドで `UnicodeDecodeError: 'cp932' codec can't decode byte ...` が発生する。
このエラーはスレッド内で表示されるだけでプロセス自体は終了コード 0 で正常終了するため、
**気づかずに「オープン PR: 0 件 → 新規 PR で OK」という誤った判定結果を信じてしまう**（実際には
関連するオープン PR が存在し、新規 PR を作るとコンフリクトの原因になる）。

### 原因
Windows の日本語環境では `subprocess.run(text=True)` が既定で `locale.getpreferredencoding()`（cp932）を
使ってデコードしようとするため、UTF-8 専用の文字（絵文字等）を含む `gh` の出力でデコードに失敗する。

### 恒久対策（スクリプトに実装済み）
`manage_skill_pr.py` / `publish_skill.py` の `gh`/git 呼び出しラッパーはいずれも
`subprocess.run(..., encoding="utf-8", errors="replace")` を明示し、cp932 起因のデコード失敗を防ぐ。
これにより正常系（オープン PR が実際に 0 件の場合も含む）でも毎回正しくデコードされる状態になっている。
新しく `gh`/`git` を呼び出すヘルパーを追加する場合も、必ず `encoding="utf-8"` を明示すること
（`text=True` だけでは Windows の日本語環境で cp932 にフォールバックされ、同じ問題が再発する）。

## 14. 追加した再発防止チェックが警告だらけになり、読まれなくなる

### 症状
原則「再発防止」に従って `scripts/` に静的チェックを追加したところ、実プロジェクトで
数十件の警告が出た。ほぼ全部が問題の無い箇所で、**真の検出が埋もれてしまう**。

### 原因
パターンを広く取りすぎている。「正しく書いていてもヒットする形」を含んでいると、
使う人は警告ごと無視するようになる。チェックが無いのと同じになる。

### 対処
- **実コードで調整する。** 追加したら必ず既存プロジェクトにかけ、
  **真の検出だけが残るまで条件を狭める**。修正後に 0 件になるところまで確かめる。
- 対象を限定する（例: あらゆるコンテナ → 特定の書き方をしているコンテナだけ）。
- 警告件数に上限を設け、超えた分は件数だけ表示する。
- 機械的に判別できないものは `errors`（失敗）にしない。警告に留める。

## 15. 別ブランチへの反映のつもりが、作業中のブランチにコミットされる

### 症状
`git checkout -b <new>; git cherry-pick <sha>` のように 1 行で繋いだところ、
`checkout` が**未コミットの変更で失敗**し、cherry-pick だけが現在のブランチで実行された。

### 対処
- PowerShell の `;` は**前のコマンドが失敗しても次を実行する**。
  ブランチを切る操作とコミットを造る操作は**行を分け、切り替わったことを確認してから**進む。
- 入ってしまったら `git cherry-pick --abort` → 邪魔な変更を `git stash push -- <path>` で退避
  → 目的のブランチへ checkout → cherry-pick → `git stash pop`。
- 既存 PR への追記は、**リモートの先端から作業ブランチを切り直して cherry-pick** するのが安全。
  手元のブランチに無関係なコミットが混ざっていても、PR に巻き込まない。

  ```powershell
  git fetch origin
  git checkout -B <作業名> origin/<PR のブランチ>
  git cherry-pick <sha>
  git push origin <作業名>:<PR のブランチ>
  ```

## 16. チェックを強化したのに、新規プロジェクトでは動かない

### 原因
スキルの `scripts/` と `templates/<name>/scripts/` のように**同じファイルが複数箇所にある**。
手元の 1 つだけ直しても、scaffold される側には届かない。

### 対処
- 共有スクリプトを直したら、**テンプレート側にもコピーして差分 0 を確認する**。

  ```powershell
  git diff --no-index --stat .github/skills/<name>/scripts/<file> `
    .github/skills/<name>/templates/<template>/scripts/<file>
  ```

- サンプルにも同名ファイルがある場合、全部を追従させるか、**追従させない方針を明記**する。
  どちらでもない状態が一番危い。

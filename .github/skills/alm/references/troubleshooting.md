# ALM — 異常系・トラブルシュート

## 1. `sanitize.py` がテンプレートを壊す（散文中の語まで `${VAR}` になる）

- 原因: `AGENT_NAME` / `APP_NAME` のような短い公開識別子が置換対象に入っている。
- 対処: `alm.config.json` の `non_secret_vars` に追加する（または `--non-secret <NAME>` を渡す）。
  置換は**長い値から順に**実行される（部分文字列による取り違え防止）。

## 2. `render.py` が `Missing required environment variables: ...` で失敗する

- 原因: テンプレートの `${VAR}` に対応する値が `.env`（または CI のシークレット）に無い、または空。
- 対処: `.env.example` と突き合わせて不足分を追加する。**空文字も「未設定」として扱われる**。
- CI では、テンプレートに追加した `${VAR}` をワークフローの `env:` へ配線し忘れていないか確認する。

## 3. `review_sanitization.py` が Fail する

| メッセージ | 対処 |
|---|---|
| `.env is tracked` | `git rm --cached .env` し `.gitignore` に追加 |
| `Rendered output is tracked` | `alm.config.json` の `rendered` に該当。`git rm --cached <path>` |
| `Build artifact is tracked` | `alm.config.json` の `artifacts` に該当。`git rm --cached <path>` |
| `contains a real GUID` | 該当箇所を `${VAR}` へ置換し `.env.example` にプレースホルダーを追加 |
| `no ${VAR} placeholders found` | テンプレートが汎用化されていない。`sanitize.py` を実行する |

すべてゼロの GUID（`00000000-...`）はプレースホルダーとして許可される。

## 4. ゲート連鎖のリリース判定が `missing verdict for the '...' gate` で FAIL する

- 原因: `.gate/` はドットディレクトリで、`actions/upload-artifact@v4` が既定で除外する。
  ログに `No files were found with the provided path: .gate/` が出る。
- 対処: upload / download 両方のステップで `include-hidden-files: true` を指定する。

## 5. 全ゲート PASS なのにデプロイが始まらない / ステップ 0 件で失敗する

- 原因: Environment に**必須レビュアー**が残っている。または承認待ちの実行中に保護ルールを変更した。
- 対処: 自律運用にするなら保護ルールを外す。変更後に失敗した実行は `gh run rerun <run-id> --failed`。

```powershell
'{"wait_timer":0,"reviewers":[],"deployment_branch_policy":null}' |
  gh api -X PUT repos/<owner>/<repo>/environments/production --input -
```

## 6. セキュリティゲート `S1` が正当な `contents: write` を弾く

- 原因: リリース発行には書き込み権限が必要だが、既定では最小権限のみ許可される。
- 対処: ルールを緩めず、`alm.config.json` の `contents_write_jobs` にジョブ名を限定追加する。

## 7. デプロイ用シークレットがゲートに漏れて `S5` が FAIL する

- 原因: 再利用ワークフローの呼び出しに `secrets: inherit` を付けた。
- 対処: ゲートには必要なシークレットだけを明示的に渡す（レビューに実値は不要）。

## 8. シークレットストアへの同期が途中で止まる

- 原因: `SECRET_BACKEND` の必須変数（`AZDO_*` / `AZURE_KEYVAULT_NAME`）が不足している。
- 対処: `sanitize.py` は同期前に設定を検証して中断するため、半分だけ書き込まれることはない。
  エラーメッセージの変数を `.env` に追加して再実行する。
- Key Vault のシークレット名は英数字とハイフンのみ。`AZURE_TENANT_ID` → `AZURE-TENANT-ID` に自動変換される。

## 9. Windows PowerShell 5.1 で `&&` が使えない

- 対処: `;` で区切るか `; if ($?) { ... }` を使う。PowerShell 7（`pwsh`）なら `&&` が使える。

## 10. デプロイ履歴が Issue に溜まって課題一覧が読めない

- 原因: デプロイ結果を Issue コメントとして記録している。
- 対処: **バージョンごとの GitHub Release** に移す（[review-gates.md](review-gates.md) の release ジョブ）。
  既存のメモ用 Issue とラベルは削除してよい。

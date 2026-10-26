# クイックスタートの異常系

## 標準のコピーで社内ルールや .gitignore が消える

`degit --force` や `.gitignore` の単純な上書きでは既存のカスタマイズを失う。
`scripts/initialize_workspace.py` の `install_workspace()` はコピー前に全対象を比較し、
同じファイルはスキップ、異なる既存ファイルは保持して競合として報告する。
`.gitignore` は不足行だけ追記する。再実行でも重複コピー・重複追記しない。
`require_safe_destination()` は symlink とディレクトリでない親をコピー前に拒否する。
`tests/test_initialize_workspace.py` で正常コピー・再実行・競合・原本保持・境界拒否を検証する。

競合があれば、社内ルールを優先して必要差分を統合する。
配置できたことだけではクイックスタート完了ではなく、解決後は
[quickstart.md](quickstart.md) の認証・仕様整理・提案へ続行する。

## 管理者権限がなく環境情報を取得できない

環境候補・Dataverse の既存 publisher / solution 取得と、DLP / ACP 等の管理診断を混同しない。
取得不能な情報を創作せず、既存 `.env`・認証済みプロファイルを再利用する。
必要な対象選択は AskUserQuestion で確認し、管理権限が不足する操作は
[権限確認付き復旧](../../admin/references/development-recovery.md) に従って引き継ぐ。
取得できなかった事項を要望確認で示し、ローカル作業の先行に継続回答を得てから、
仕様整理・仮説付きの architecture 提案へ進む。

## 環境候補の一覧取得後にアクティブアカウントが変わる

PAC のプロファイルを横断して `org who` を読むには、一時的なプロファイル選択が発生する。
`scripts/setup_environment.py` の `cmd_list()` は最初のアクティブプロファイルを記録し、
例外時も `finally` で復元する。元のプロファイルが不明なら切り替えず停止し、
復元に失敗した場合も非ゼロ終了で続行を止める（恒久対策済み）。
一部の候補が読めない場合は警告を明示し、権限不足を環境の不存在と扱わない。
`tests/test_setup_environment.py` で正常一覧・一部失敗・復元失敗・例外時の復元を検証する。

## 資料がない・変換が未完了

資料なしはセットアップ完了の理由ではない。フォルダー名からアプリ案を先に提案して方向性だけ確認する。
変換待ちの placeholder を完成した仕様と扱わず、事実・仮説・未確認を区別して提案する。
業務フロー図と構成図は、リンクだけではなくチャットと Markdown の両方へ Mermaid で出す。
入口と引き継ぎ契約は `tests/test_quickstart_contract.py` で検査する。

## 認証準備後、要望確認なしに仕様整理・設計へ進む

配置だけで止めない指示を、本人の要望確認も省略する指示と解釈しない。
[quickstart.md](quickstart.md) Step 4 で、認証準備の完了／未完了と資料候補を示し、
AskUserQuestion の回答を待つ。資料なしならフォルダー名から複数の具体案を先に示す。
継続回答前は資料変換・仕様作成・設計提案を開始しない。
回答後は同じタスクを再開し、選択済みの方向性を聞き直さない。
`tests/test_quickstart_contract.py` で入口の待機指示と、認証検証 → 要望確認 → 資料変換 → 提案の順序を検査する。
これは対話の契約であり、配置スクリプトに本人の回答を代行させない。

## 認証エラー後、次のプロセスでも再サインインになる

以前の `get_token()` は `ClientAuthenticationError` / `TypeError` を一律にキャッシュ破損とみなし、
永続キャッシュを無効にした credential で再認証していた。その結果、認証レコードだけが保存され、
更新トークンが次のプロセスへ引き継がれない経路があった。

**恒久対策済み** — `auth_helper.py` は同じ永続 credential を保持し、サイレント取得を優先する。
`AuthenticationRequiredError` の場合だけ、セットアップの明示的な `allow_interactive=True` により
同じ credential でブラウザ認証し、claims challenge を渡す。権限拒否・通信・型エラーは再認証せず送出する。
認証レコードは一時ファイルから原子的に置換し、中断による破損を防ぐ。
暗号化できない場合は平文保存に切り替えない。壊れたレコード・tenant/client ID 不一致も削除せず停止する。
`tests/test_auth_cache.py` と `verify_auth_cache.py` で回帰・プロセス間再利用を検証する。

条件付きアクセスの再認証要求はキャッシュ障害ではない。device-code やポリシー緩和で迂回しない。

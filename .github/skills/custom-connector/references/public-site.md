# 公開サイト・公開 API を Code Apps から読む（認証なしのコネクタ）

Code Apps の既定の CSP（`connect-src 'none'`）では、ブラウザから外部サイトを `fetch` できない（エラー画面にならず、データが来ないだけ）。
外部のページ・API はカスタム コネクタ（サーバー側）で取得し、Code Apps は生成サービスで呼ぶ。

```
Code Apps（生成サービス） ── 接続（認証なし） ── カスタム コネクタ（ホスト固定・GET だけ） ── 公開サイト
```

## 1. 作る

```powershell
# 定義を生成し、paths を取り込むページの形に書き換える
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/custom-connector/templates/public-site --target <出力先>
# 作成（--secret-file は付けない。題名・https・GET だけを作成前に検査する）
python .github/skills/custom-connector/scripts/deploy_connector.py --connector-dir <出力先>/connector `
  --var API_HOST=<host> --var CONNECTOR_TITLE=<英数字の名前> --var PUBLISHER="<発行元>" --solution <solution>
# 接続（mode は noauth に自動判定。同意・ブラウザは不要）
python .github/skills/custom-connector/scripts/create_connection.py plan --connector <shared_…> --display-name "<表示名>"
python .github/skills/custom-connector/scripts/create_connection.py apply --plan .mcp/connection-plan.json --plan-hash <sha256>
# 1 回呼んで確かめる
python .github/skills/custom-connector/scripts/create_connection.py invoke --connector <shared_…> --connection-name <接続名> --path /items/<id>/
# Code Apps に追加（ALM では接続参照を使う）
python .github/skills/code-apps/scripts/add_data_source.py --connector <shared_…> --connection-ref <論理名> --as action
```

## 2. 設計の約束

| 観点 | 約束 |
|---|---|
| 取得先 | ホストを定義に固定し、パスは固定の部分とパス パラメーターだけにする（任意の URL を取りに行けるコネクタにしない）。アプリ側でも URL を検証してからパラメーターを渡す |
| 操作 | GET だけ（`deploy_connector.py` が検査）。書き込み・ログインの必要なページは対象にしない |
| 取得の単位 | 利用者の操作（ボタン）ごとに 1 ページ。一覧の巡回・画像の一括取得・定期実行はしない |
| 利用規約 | 取得先の利用規約・robots.txt を確かめ、記録に残す。取り込んだ値には取り込み元 URL と取得日を残す |
| 待ち時間 | 20〜30 秒かかることがある（troubleshooting #13）。時限（60 秒）と進み具合を表示する |
| 代わりの入力 | 取得に失敗したとき（掲載終了・構成変更・ホストの外で開いた）に、ページの内容を貼り付けて同じ解析にかけられるようにする |
| 動く場所 | コネクタは Power Apps のホスト経由でしか呼べない。ローカル開発・アプリの URL を直接開いたときは、貼り付けに切り替える旨を表示する |
| 解析 | HTML と貼り付けた文字列の両方から同じ項目を取り出す。貼り付けでは、取り込まない見出しも値の終わりとして扱う（見出しの一覧を持つ） |
| 試験 | 実際のページはリポジトリに入れない。同じ構造の合成ページで試験し、実ページはローカルにあるときだけ動く試験にする |
| DLP | ホストは未分類だと既定のグループに入る（troubleshooting #14）。管理者に分類してもらう |

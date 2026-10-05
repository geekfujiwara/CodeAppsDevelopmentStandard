# 公開サイト・公開 API のカスタム コネクタ定義（テンプレート、認証なし）

Code Apps の既定の CSP（`connect-src 'none'`）では、ブラウザから外部サイトを `fetch` できない。
外部のページ・API はコネクタ（サーバー側）で取得し、Code Apps は生成サービスで呼ぶ。

| ファイル | 役割 |
|---|---|
| `connector/apiDefinition.swagger.json` | OpenAPI 2.0。ホスト固定・GET だけ。パスは固定の部分とパス パラメーターだけにする |
| `connector/apiProperties.json` | `connectionParameters` が空（認証なし）。接続は同意なしで Connected になる |

`{{NAME}}` は [`deploy_connector.py`](../../scripts/deploy_connector.py) が置き換える（`--secret-file` は付けない）。

| 値 | 由来 |
|---|---|
| `API_HOST` | `--var API_HOST=<ホスト名>`（`https://` やパスは付けない） |
| `CONNECTOR_TITLE` | `--var CONNECTOR_TITLE=<英数字・-・_>`。pac がコネクタ名に使う。日本語の説明は `info.description` |
| `PUBLISHER` | `--var PUBLISHER="<発行元>"` |

`deploy_connector.py` は作成前に「題名が英数字」「https だけ」「GET だけ」を確かめ、外れていれば止まる。
設計上の注意（利用規約・取得の単位・失敗時の代わりの入力）は [references/public-site.md](../../references/public-site.md)。

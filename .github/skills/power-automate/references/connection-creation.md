# コネクター接続の作成標準

> 2026-09-07 に `shared_commondataserviceforapps` と `shared_webcontents` で実測した手順。

## 原則

1. Power Apps API で対象環境の Connected 接続を検索する。
2. Connected 接続があれば、その接続 ID を接続参照へ API で設定して再利用する。
3. 接続がなければ、VS Code 統合ブラウザでメーカーポータルの接続作成画面を開く。
4. 接続パラメーターの入力と作成操作はブラウザ自動化で行い、ユーザーは OAuth のアカウント選択・同意だけを行う。
5. Connected を API で確認し、接続 ID を `.env` に保存する。
6. 接続参照、フロー作成、有効化、テストは API で行う。

接続の OAuth 同意以外を手動ポータル作業にしない。接続 ID を固定値としてソースコードへ書かず、
`.env` または Power Apps API の Connected 接続検索から解決する。

**OAuth 完了後はすべて API で実行する。** メーカーポータルを使うのは、Connected 接続が存在しない
場合の接続パラメーター入力と OAuth 同意フローの開始だけとする。

## auth_helper の責務

`auth_helper.py` の既定クライアントが取得する `https://api.powerplatform.com` トークンには、
`Connectivity.Connections.Write` が含まれない。そのため、次のように分担する。

| 操作 | 実行経路 |
|---|---|
| 既存接続の列挙・Connected 確認 | `auth_helper` + Power Apps API |
| 新規接続の仮作成 | 統合ブラウザ上のメーカーポータル（ポータル自身の接続 API） |
| OAuth アカウント選択・同意 | 統合ブラウザの同一コンテキスト子ページ |
| 認可コードの確定 | メーカーポータルの `confirmConsentCode` |
| 接続参照・フローの作成 | `auth_helper` + Dataverse / Flow API |

`auth_helper` の権限不足は `HTTP with Microsoft Entra ID` 固有ではない。
Microsoft Dataverse の OAuth 接続でも、ポータルは同じ接続 API と OAuth フローを使用する。

## Connected 接続を先に検索する

```python
session = get_session(scope="https://service.powerapps.com/.default")
response = session.get(
    f"https://api.powerapps.com/providers/Microsoft.PowerApps/apis/{connector}/connections",
    params={
        "api-version": "2016-11-01",
        "$filter": f"environment eq '{environment_id}'",
    },
    timeout=120,
)
response.raise_for_status()
```

`properties.statuses` に `Connected` がある接続だけを採用する。`Error`、`Unauthenticated`、
異なる Base Resource URL の接続は再利用しない。

## 統合ブラウザで OAuth を完了する

VS Code 統合ブラウザはネイティブの `window.open` をブロックする場合がある。
その場合も外部ブラウザや Playwright 単体を起動せず、次の手順を使う。

1. メーカーポータルの接続ダイアログへ値を入力する。
2. `window.open` に渡される OAuth URL とポップアップ ID を一時的に捕捉する。
3. 同じブラウザコンテキストに子ページを作り、`bringToFront()` でユーザーに表示する。
4. 子ページへ OAuth URL を遷移させる。
5. ユーザーが必要なアカウント選択・同意を行う。パスワード、MFA、同意操作は代行しない。
6. 子ページのリダイレクトが送る次のメッセージを捕捉し、親ページへ同じ origin で転送する。

```json
{
  "id": "connectionConsentFlowRedirectParams",
  "popupId": "{oauth-popup-id}",
  "code": "{one-time-authorization-code}",
  "error": null
}
```

7. 親ポータルが `POST .../connections/{id}/confirmConsentCode?api-version=1` を実行し、
   HTTP 200 になることを確認する。
8. Power Apps API で接続状態が `Connected` になったことを確認する。
9. OAuth 子ページを自動で閉じ、親の接続ダイアログが閉じたことを確認する。

### OAuth 画面の終了処理

OAuth 子ページの `close()` は統合ブラウザで抑止される場合があるため、接続確定後はブラウザツールから
子ページを明示的に閉じる。`サインイン中...`、`接続をテスト中...`、空白のリダイレクトページを
残したまま完了扱いにしない。

ブラウザツールの制約で自動クローズできない場合は、Connected を API で確認した後に、ユーザーへ
「接続は作成済みです。この OAuth 画面は閉じて問題ありません」と明示する。Connected の確認前に
閉じてよいとは案内しない。

### 一時秘密値は保存禁止

認可コード、Bearer token、OAuth URL の `data` パラメーターは一時値としてメモリ内だけで扱う。
チャット、ログ、ファイル、`.env` へ出力・保存しない。

## コネクター別の扱い

| コネクター | 標準 |
|---|---|
| Microsoft Dataverse | 既存 Connected 接続を API 検索。なければ統合ブラウザで OAuth を一度完了 |
| SharePoint / Office 365 系 | 同上。要求されるスコープの同意画面が出た場合だけユーザーが同意 |
| HTTP with Microsoft Entra ID | Base Resource URL と Resource URI を自動入力し、統合ブラウザで OAuth を一度完了 |
| API key / Basic / 証明書 | 秘密値を `.env` からブラウザへ直接入力。チャットへ出力しない |
| サービスプリンシパル対応コネクター | 対話不要の認証を優先できるが、最小権限と秘密情報管理を別途確認 |

## 失敗時のクリーンアップ

OAuth をキャンセルまたは中断して `Error` / `Unauthenticated` の仮接続が残った場合は、
今回作成した接続 ID と表示名が一致することを確認してから削除する。既存の Connected 接続は削除しない。

非公開 API の URL、要求本文、権限の実測値は
[HTTP with Microsoft Entra ID 接続の非公開 API](http-entra-connection-private-api.md) を参照する。
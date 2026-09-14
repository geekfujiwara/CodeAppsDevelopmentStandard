# Power Apps Wrap Entra app registration

## 観測結果

2026-09-14にPower Apps Wrapの`Entra アプリを作成`をnetwork captureした。
登録先はprivate APIではなくMicrosoft Graph v1.0の`POST /applications`だった。
capture時はwriteをabortし、owned registration一覧に同名0件を確認した。

payloadの固定contract:

- `signInAudience`: `AzureADMultipleOrgs`
- public-client redirect URI: native client URIとWrap preview URIの2件
- `requiredResourceAccess`: Microsoft first-party resource 6件、delegated scope 11件
- client secret、token、owner、environment IDはpayloadに含まれない

resource app IDとscope IDはMicrosoftが定義する固定GUIDであり、
`register_wrap_application.py`とskill validator allowlistに用途を明記して保持する。
portal buildで差分が出た場合はcontract versionを更新せず停止し、UIを再captureする。

## 承認とapply

`plan`はtenant ID、display name、Graph target、固定payloadをcanonical JSONにしてSHA-256を出す。
`apply`は次を全て満たす場合だけPOSTする。

1. Graph tokenの`tid`がplan tenantと一致する
2. 同じdisplay nameのapplicationが存在しない
3. plan hashが承認値と一致する
4. POST後のapplicationがredirect URI、audience、全resource/scopeで完全一致する

同じ表示名の既存registrationは再利用・更新せず停止する。OAuth consent、MFA、account selection、
policy acceptanceは自動化しない。Application client IDは公開識別子だが、tokenやclient secretは保存しない。

## Cleanup

apply reportはobject ID、client ID、display name、tenantを固定したcleanup planと別hashを作る。
`cleanup`はDELETE直前に3つのidentity値をGraphから再取得して一致確認し、DELETE後の404まで検証する。
名前だけで検索したregistrationや、別tenantのregistrationを削除しない。

検証済みlive lifecycle:

- disposable registration create: HTTP success
- exact Graph read-back: success
- hash-bound cleanup: success
- object ID read-back after delete: 404

Native Mobile Code AppsはPrivate Previewのため、registration automationが成功してもproduction利用可とはしない。
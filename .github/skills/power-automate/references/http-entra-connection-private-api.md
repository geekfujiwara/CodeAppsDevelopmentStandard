# HTTP with Microsoft Entra ID 接続の非公開 API

> 2026-09-07 に Power Automate メーカーポータルのネットワークから実測した参考情報。
> 公開・サポート対象 API ではないため、スクリプトから直接呼ばず、メーカーポータル自身の
> API 呼び出しとして統合ブラウザ上で利用する。

## 実測した API

Environment ID のハイフンを除いた32文字を30文字と2文字に分けてホストを構成する。

```text
compact = ENV_ID.replace("-", "")
host = https://{compact[:30]}.{compact[30:]}.environment.api.powerplatform.com

PUT {host}/connectivity/connectors/shared_webcontents/connections/{32-hex-id}?api-version=1
DELETE {host}/connectivity/connectors/shared_webcontents/connections/{32-hex-id}?api-version=1
```

作成要求の本文は次の形だった。

```json
{
  "properties": {
    "environment": { "name": "{ENV_ID}" },
    "connectionParametersSet": {
      "name": "EntraAuth",
      "values": {
        "Token": {
          "value": "https://global.consent.azure-apim.net/redirect/webcontents"
        },
        "BaseResourceUrl": {
          "value": "https://{FUNCTION_APP}.azurewebsites.net"
        },
        "Token:ResourceUri": {
          "value": "api://{APPLICATION_ID}"
        },
        "privacySetting": { "value": "None" }
      }
    },
    "displayName": "{DISPLAY_NAME}"
  }
}
```

## 認証

メーカーポータルの要求は次のBearer tokenを使用していた。

| 項目 | 実測値 |
|---|---|
| audience | `https://api.powerplatform.com` |
| client application ID | `{MAKER_PORTAL_CLIENT_ID}` |
| required scope | `Connectivity.Connections.Write` |

通常の `auth_helper.get_token(scope="https://api.powerplatform.com/.default")` で同じPUTを実行すると、
`403 InsufficientDelegatedPermissions` になった。既定クライアントには
`Connectivity.Connections.Write` が付与されていない。

## PUT 後の状態

PUT自体はポータルから `201 Created` になったが、レスポンスは次の状態だった。

```json
{
  "statuses": [
    {
      "status": "Error",
      "target": "Token",
      "error": {
        "code": "Unauthenticated",
        "message": "This connection is not authenticated."
      }
    }
  ]
}
```

その後、ポータルはOAuth同意ポップアップを開く。ポップアップをブロックまたはキャンセルすると、
作成した仮接続へDELETEを送り削除する。したがってPUTだけではConnectedな接続を作れない。

## 採用判断

- **接続の完全な非対話作成は不可**: Power Platform API用の委任権限と、対象リソースへのユーザーOAuth同意が必要。
- **`auth_helper` からの直接 PUT は採用しない**: 既定クライアントに `Connectivity.Connections.Write` がない。
- **正常系**: 統合ブラウザでメーカーポータルに接続パラメーターを自動入力し、ユーザー操作をOAuth同意だけに限定する。
- **一度作成した接続の再利用はAPI化する**: 接続IDを `.env` に保存し、接続参照とフローはDataverse / Flow APIで作成する。
- **CI/CD**: OAuth接続を事前準備として扱い、Connected接続IDをシークレットストアから参照する。非公開APIをCI/CDから直接呼ばない。
- PAC CLI 2.8.1 の `pac connection create` はDataverse接続用で、`shared_webcontents` の接続パラメーターは指定できない。

Microsoft Dataverseでも同じ内部PUT、OAuthリダイレクト、`confirmConsentCode` が使われることを実測した。
統合ブラウザでネイティブポップアップがブロックされる場合の手順は
[接続作成標準](connection-creation.md) を参照する。

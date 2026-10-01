# 認証とロール

## トークンの形式（検証済 2026-10）

| 形式 | 取得 | 寿命 | 使える場所 |
|---|---|---|---|
| STS トークン | Entra ID のアクセス トークン（`https://cognitiveservices.azure.com`）で `POST https://<subdomain>.cognitiveservices.azure.com/sts/v1.0/issueToken` | 10 分 | Speech SDK（`SpeechConfig.fromAuthorizationToken`）、音声合成 REST |
| `aad#<resourceId>#<entraToken>` | Entra ID のアクセス トークンを連結するだけ | Entra トークンと同じ（約 60〜90 分） | Speech SDK、音声合成 REST（どちらも実測で成功） |

- どちらも**カスタム サブドメイン**が必要（`get_speech_token.ps1` が事前に確認する）
- テナントのポリシーでキー認証（`disableLocalAuth=true`）が強制されていても動く
- 本番では Function が STS トークンを発行し、クライアントは失効 60 秒前に再取得して
  `recognizer.authorizationToken` を差し替える（長時間の連続稼働での差し替えは**未検証**）
- `aad#` 形式は診断・検証用。ブラウザに Entra のアクセス トークンを渡すことになるため、本番の配布には使わない

## Managed Identity のロール（トークン発行 Function）

STS トークンの発行（`issueToken`）を Managed Identity から呼んだ結果。

| ロール（Speech リソースの範囲） | 結果 |
|---|---|
| Cognitive Services Speech User | **401**（`lacks the required data action .../SpeechServices/issuetoken/action`） |
| `SpeechServices/issuetoken/action` だけを持つカスタム ロール | **401**（`Principal does not have access to API/Operation`） |
| Cognitive Services User | 200 |
| **Foundry User（標準）** | 200 |

- 標準は **Foundry User** とする（`dataActions: Microsoft.CognitiveServices/*`）
- 付与・削除の反映には数分かかった（実測 2〜6 分）。反映前の 401 を設定ミスと取り違えない
- 付与したら、不要になったロールとカスタム ロールは削除する

## Function が受け付けるトークン

| 検証 | 失敗時 |
|---|---|
| 署名（JWKS、RS256）、audience（`api://<id>` と `<id>` の両方）、発行元（v1 / v2）、`exp` | 401 |
| `scp` に公開スコープ（例 `Speech.Token`） | 401（アプリ専用トークンを拒否） |
| `oid` | 401 |

テスト時は Azure CLI を事前承認しておけば、`az account get-access-token --scope api://<id>/<scope>` で取得できる。

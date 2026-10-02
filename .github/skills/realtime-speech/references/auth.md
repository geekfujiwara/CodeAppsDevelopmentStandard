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

STS トークンの発行（`issueToken`）を Managed Identity から呼んだ結果（2026-10、同じ Speech リソース）。

| ロールと範囲 | 結果 |
|---|---|
| Cognitive Services Speech User（リソース） | **401**（`lacks the required data action .../SpeechServices/issuetoken/action`） |
| `SpeechServices/issuetoken/action` だけのカスタム ロール（リソース） | **401**（`Principal does not have access to API/Operation`） |
| Cognitive Services User（リソース） | 200 |
| Foundry User（**リソース**）のみ | **401**（`Principal does not have access to API/Operation`）。付与から 3 時間以上たっても変わらなかった |
| **Foundry User（リソース グループ）を追加（標準）** | 200（追加から約 2 分） |

切り分けのため、新しいサービス プリンシパルで範囲だけを変えて発行を繰り返した（2026-10、同じ Speech リソース、5 秒間隔）。

| 範囲 | 200 になるまで |
|---|---|
| Foundry User（リソース グループ） | 約 2 秒（最初の試行から 200） |
| Foundry User（リソース） | **約 12 分**（それまで 401 `Principal does not have access to API/Operation`） |

- 標準は **Foundry User** とし、Function の Managed Identity には**リソース グループの範囲**で付ける。
  最小権限にしたい場合は Speech リソースを専用のリソース グループに置く
- **リソース範囲でも効く**。ただし反映に 10 分以上かかることがある。リソース範囲で付けたら 15 分以上待ってから判断する。
  前述の Managed Identity が 3 時間以上 401 のままだった理由は再現できず**未確認**
- Foundry User と Cognitive Services User の `dataActions` は同一（`Microsoft.CognitiveServices/*`）
- 利用者アカウントはサブスクリプション範囲の Foundry User で発行できた
- ロールの付与・削除の反映には数分かかる。削除の反映は遅れることがあり、**削除直後に成功しても、そのロールが不要だとは限らない**
  （実測: Cognitive Services User を外した直後は成功が続き、のちに 401 になった）。判断は付与・削除から 10 分以上あけて行う
- 不要になったロールとカスタム ロールは削除する

## Function が受け付けるトークン

| 検証 | 失敗時 |
|---|---|
| 署名（JWKS、RS256）、audience（`api://<id>` と `<id>` の両方）、発行元（v1 / v2）、`exp` | 401 |
| 委任トークン（`scp` と `oid` がある） | 401（アプリ専用トークンを拒否） |
| `scp` に公開スコープ（例 `Speech.Token`）、**または** `appid`/`azp` が `TRUSTED_CLIENT_IDS`（既定は API アプリ自身） | 401 |

カスタム コネクタが送るトークンは実測で `ver=1.0`、`aud`=`appid`=API アプリ自身、`scp=User.Read`。
コネクタは API アプリ自身をクライアントにして取るため、`scp` に公開スコープが入らない（[custom-connector の異常系](../../custom-connector/references/troubleshooting.md) #2）。

テスト時は Azure CLI を事前承認しておけば、`az account get-access-token --scope api://<id>/<scope>` で取得できる（こちらは `scp` に公開スコープが入る）。
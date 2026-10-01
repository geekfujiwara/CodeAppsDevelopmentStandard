# 短期トークン発行（トークン ブローカー）パターン

ブラウザから Azure のサービスへ**直接**つなぐ必要がある（WebSocket のストリーミングなど、コネクタで中継できない）が、
長期の資格情報はブラウザに渡したくない場合の構成。Function が Managed Identity でサービスの**短期トークン**を発行し、
Code Apps はそれを**カスタム コネクタ**経由で受け取る。

```
Code Apps ──(カスタム コネクタ / 利用者の委任 OAuth)──▶ Function（JWT 検証）──(Managed Identity)──▶ サービスの STS
    │                                                       └─ 短期トークンをキャッシュして返す
    └──(短期トークン)──▶ サービスへ WebSocket 直結（CSP の connect-src に追加）
```

| 判断 | 理由 |
|---|---|
| コネクタ経由でトークンを取る | コネクタ呼び出しは postMessage 経由なので CSP の追加が不要。Code Apps から Function へ直接 `fetch` すると `connect-src` の追加が要る |
| Function の HTTP は公開、認可はコード側の JWT 検証 | コネクタ（SaaS）から到達できる必要がある。関数キーは使わない |
| ストレージは非公開（Private Endpoint） | テナントのポリシーに準拠する。Function は VNet 統合で到達する |

具体的な実装（Azure AI Speech 用の Function テンプレートとコネクタ定義）は
[realtime-speech スキル](../../realtime-speech/SKILL.md) にある。

## 手順

### Step 1: Entra ID に API を公開する

[mcp-server の `configure_entra_api.py`](../../mcp-server/scripts/configure_entra_api.py) を流用する。スコープ名は用途に合わせる。

```powershell
$env:MCP_API_APP_ID = "<api-app-id>"; $env:MCP_API_SCOPE_VALUE = "<Service>.Token"
python .github/skills/mcp-server/scripts/configure_entra_api.py
```

### Step 2: Function の基盤を作る

Flex Consumption + システム割り当て Managed Identity。共有キー禁止・公衆アクセス禁止のストレージでは、
**作成時に** VNet 統合を指定しないと `your app will not start` で作成できない（→ [troubleshooting](troubleshooting.md)）。

1. VNet、Private Endpoint 用サブネット、委任付きサブネット（`Microsoft.App/environments`）を作る
2. ストレージの **blob と queue** に Private Endpoint と Private DNS ゾーン（`privatelink.blob/queue.core.windows.net`）を作る
3. `az functionapp create ... --flexconsumption-location <region> --deployment-storage-auth-type SystemAssignedIdentity --assign-identity '[system]' --vnet <vnet> --subnet <delegated-subnet>`
4. `AzureWebJobsStorage` を ID ベース接続へ切り替える:
   `python .github/skills/mcp-server/scripts/configure_function_storage.py --app <app> --account <storage>`

### Step 3: Managed Identity にデータ ロールを付ける

対象サービスの**トークン発行操作**を含むデータ ロールを付ける。
ロール名だけで判断せず、`az role definition list --name "<role>" --query "[0].permissions[0].dataActions"` で中身を確認する。

- 付与・変更の反映には数分かかる（実測 2〜6 分）。反映前は発行が 401 になる。待ってから再試行する
- **削除の反映も遅れる**。ロールを外した直後に成功しても、そのロールが不要だとは限らない。判断は 10 分以上あけて行う
- 範囲によって効かないことがあった（Speech の実例: リソース範囲の Foundry User だけでは 401 のまま、リソース グループ範囲を追加して 200。
  [realtime-speech の認証とロール](../../realtime-speech/references/auth.md)）

### Step 4: Function を実装する

受信トークンの検証は [mcp-server の認証モデル](../../mcp-server/references/auth-model.md) に加え、次を必ず行う。

| 検証 | 理由 |
|---|---|
| 委任トークン（`scp` と `oid` がある）であること | アプリ専用トークンを拒否し、利用者の委任トークンだけを通す |
| `scp` に公開スコープがある、**または** `appid`/`azp` が信頼するクライアント（既定は API アプリ自身） | カスタム コネクタは API アプリ自身をクライアントにした v1 トークンを送り、`scp` が `User.Read` になる（実測）。`scp` だけで判定するとコネクタ経由が 401 になる |
| 拒否時は `ver` / `aud` / `scp` / `appid` だけをログに出す | トークンの値を出さずに、どのクライアントが何を送ったかを判別できる |
| 応答に `Cache-Control: no-store` | 中継や端末にトークンを残さない |
| 発行済みトークンを寿命の手前までキャッシュし、同時要求は 1 本にまとめる | 発行 API の呼び出し回数と遅延を減らす（実測: キャッシュ応答 73 ms） |
| 応答に残り秒数（`expiresInSeconds`）を含める | 端末の時計がずれていても、クライアントが更新時刻を正しく計算できる |

### Step 5: デプロイして実測する

```powershell
python .github/skills/mcp-server/scripts/deploy_mcp_function.py --project <path> --app <app> --route <route>
```

`deploy_mcp_function.py` はルートを POST で確認するため、ルートは GET と POST の両方を受け付ける。
認証なしで 401、`az account get-access-token --scope api://<api-app-id>/<scope>` のトークンで 200 を確認する。

### Step 6: カスタム コネクタと接続を作る

[custom-connector スキル](../../custom-connector/SKILL.md) の手順で、Entra の OAuth 設定（Graph `User.Read` を含む）→ コネクタ作成
（コネクタ固有のリダイレクト URI も自動登録）→ DLP 分類 → 接続参照 → 接続の作成（plan → 承認 → apply、または所有者による手動作成）まで進める。

### Step 7: Code Apps に追加する

1. `pa app add data-source --connector <shared_...> --connection-ref <logical-name> --solution-id <id>`
2. 生成サービスは遅延読み込みにし、未追加でもビルドできるようにする（[code-apps の業務テンプレートの方式](../../code-apps/SKILL.md)）
3. 初回起動時にプレイヤーが出す「Allow &lt;アプリ&gt; to access your data?」で Allow する（利用者・アプリごとに 1 回）

## 検証状況（2026-10）

| 項目 | 状況 |
|---|---|
| Step 1〜6（Function の 401 / 200、キャッシュ、発行トークンでのサービス利用、接続の作成） | 検証済み |
| Step 7（Power Apps 実機の Code Apps からコネクタ経由で取得） | 検証済み（約 0.8 秒） |
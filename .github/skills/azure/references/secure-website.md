# セキュアな Web サイト × ストレージ構成 (テナントガバナンス準拠)

> **目的**: 組織のセキュリティポリシー（例: `publicNetworkAccess=Disabled` と共有キー認証禁止を強制）
> の下でも、**ブラウザからストレージ上のコンテンツ（動画・画像・ファイル等）を安全に配信**できる
> リファレンスアーキテクチャと構築手順。ストレージは**非公開のまま**、コンピュートが Private Link
> 経由でアクセスし、コンテンツは API プロキシ経由でブラウザへ中継する。
>
> プレースホルダ `<...>` は環境値に置換する（[.env.example](.env.example) 参照）。

---

## 1. 適用シナリオ / 前提となる制約

以下のような**組織ガバナンス（Azure Policy / Conditional Access）**が敷かれた環境を対象とする。

| 制約 | 典型的なポリシー | 影響 |
|---|---|---|
| ストレージの公衆ネットワークアクセス禁止 | `publicNetworkAccess=Disabled` を Modify 効果で強制 | ブラウザ・外部からの直接アクセス不可 |
| 共有キー認証禁止 | `allowSharedKeyAccess=false` を強制 | 接続文字列 / AccountKey / キーベース SAS が使用不可 → **Entra ID (Managed Identity) 認証必須** |
| 匿名 Blob アクセス禁止 | `allowBlobPublicAccess=false` | 匿名公開コンテナ不可 |
| ARM 書込に MFA 必須 | Resource write/delete に MFA を要求 | 構築操作前に MFA 認証が必要 |
| リージョン制限 | 許可リージョンのポリシー | 新規リソースは許可リージョンに作成 |

> これらは自己例外(exemption)できない**組織統制**である場合が多い。ポリシーと戦わず、**準拠する構成**を採る。

### 重要な前提: Private Link はネットワークポリシーの影響を受けない
`publicNetworkAccess=Disabled` でも **Private Endpoint 経由のアクセスは常に成功**する。
Network Security Perimeter (NSP) を使う組織でも Private Link は対象外。これが本アーキテクチャの土台。

---

## 2. 設計判断ツリー (実装前に確定させる)

```
Q1. データ用ストレージは publicNetworkAccess=Disabled が強制されるか？
   └ Yes → Private Endpoint 必須 (本アーキテクチャ)

Q2. コンピュート(App Service/Functions 等 Microsoft.Web)も publicNetworkAccess=Disabled 強制か？
   ├ No  → 【案 A: 推奨・最小】公開フロント + 公開バックエンド(VNet統合) + Private Endpoint
   └ Yes → 【案 B: 追加防御】公開口は Front Door / App Gateway(WAF) → Private Endpoint →
            非公開バックエンド → VNet → ストレージ PE

Q3. ブラウザがストレージコンテンツを直接取得する設計か？
   └ Yes → 直接アクセスは Private 化で不可能になる → 【必須】コンテンツを API プロキシ経由に変更
```

> **Q2 の確認方法**: 強制元ポリシー定義の対象リソース型を確認する。
> ストレージ限定なら Web は公開可(案 A)。Web も対象なら案 B。

---

## 3. リファレンスアーキテクチャ (案 A)

```
[ブラウザ] ──HTTPS──> [公開フロント(静的サイト/CDN)]
                           │ /api/* を linked backend へ委譲
                           ▼
                    [バックエンド API (Functions/App Service)]
                       ├ inbound : 公開 (フロントからのみ許可推奨)
                       ├ 認証     : Managed Identity (共有キー不使用)
                       └ outbound: VNet 統合 ──> [Private Endpoint] ──> [データ用ストレージ(Disabled)]
                       └ コンテンツ配信: API プロキシ (HTTP Range 対応) でブラウザへ中継
```

**キーポイント**
- ストレージは `publicNetworkAccess=Disabled` の**まま**（ポリシー準拠）。
- コンピュートは **VNet 統合(outbound)** で Private Endpoint に到達。VNet 統合は outbound のみ、公開可否は別設定。
- ブラウザは**ストレージに直接触れない**。全コンテンツは API がストリーム中継する。
- Blob 認証は **Managed Identity + RBAC**（`Storage Blob Data Contributor` 等）。SAS/接続文字列は使わない。

---

## 4. 事前確認
[preflight-checklist.md](preflight-checklist.md) を参照（リージョン / ポリシー対象 / プロバイダ登録 / プラン / 権限 / MFA）。

---

## 5. 構築手順 (案 A / CLI)

> すべて `${REGION}`（データストレージと同一リージョン。**VNet 統合はコンピュートとサブネットが同一リージョン必須**）で作成する。PE はクロスリージョン可。
> 一括・段階実行は [scripts/setup_private_endpoint.ps1](../scripts/setup_private_endpoint.ps1) を使う。

### 5.1 VNet + サブネット
```bash
az network vnet create -g ${RG} -n ${VNET} -l ${REGION} --address-prefixes 10.0.0.0/16 \
  --subnet-name ${PE_SUBNET} --subnet-prefixes 10.0.1.0/24
az network vnet subnet update -g ${RG} --vnet-name ${VNET} -n ${PE_SUBNET} \
  --private-endpoint-network-policies Disabled
az network vnet subnet create -g ${RG} --vnet-name ${VNET} -n ${FUNC_SUBNET} \
  --address-prefixes 10.0.2.0/24 --delegations Microsoft.App/environments
```

### 5.2 Private DNS ゾーン + VNet リンク
```bash
az network private-dns zone create -g ${RG} -n privatelink.blob.core.windows.net
az network private-dns link vnet create -g ${RG} -z privatelink.blob.core.windows.net \
  -n ${DNS_LINK} -v ${VNET} -e false
```

### 5.3 データストレージへの Private Endpoint
```bash
DATA_ID=$(az storage account show -n ${DATA_STORAGE} -g ${RG} --query id -o tsv)
az network private-endpoint create -g ${RG} -n pe-${DATA_STORAGE} -l ${REGION} \
  --vnet-name ${VNET} --subnet ${PE_SUBNET} \
  --private-connection-resource-id "$DATA_ID" --group-id blob --connection-name conn-data
az network private-endpoint dns-zone-group create -g ${RG} \
  --endpoint-name pe-${DATA_STORAGE} -n zg-blob \
  --private-dns-zone privatelink.blob.core.windows.net --zone-name blob
```

### 5.4 バックエンド用ストレージ + Private Endpoint (Functions を使う場合)
Functions は稼働用ストレージを必要とし、それも同ポリシーで Disabled 化される。**PE を付与**する。
```bash
az storage account create -n ${FUNC_STORAGE} -g ${RG} -l ${REGION} \
  --sku Standard_LRS --kind StorageV2 --allow-blob-public-access false
FUNC_ID=$(az storage account show -n ${FUNC_STORAGE} -g ${RG} --query id -o tsv)
az network private-endpoint create -g ${RG} -n pe-${FUNC_STORAGE}-blob -l ${REGION} \
  --vnet-name ${VNET} --subnet ${PE_SUBNET} \
  --private-connection-resource-id "$FUNC_ID" --group-id blob --connection-name conn-func-blob
az network private-endpoint dns-zone-group create -g ${RG} \
  --endpoint-name pe-${FUNC_STORAGE}-blob -n zg-blob \
  --private-dns-zone privatelink.blob.core.windows.net --zone-name blob
```

### 5.5 バックエンド(例: Functions Flex Consumption) を作成
> **必須**: 共有キー禁止環境では、deployment ストレージ認証を**作成時に** Managed Identity にする。
> 作成後の変更はデプロイ層(Kudu)に反映されにくく `Key based authentication is not permitted` で失敗する。
```bash
az functionapp create -n ${FUNCTION_APP} -g ${RG} \
  --storage-account ${FUNC_STORAGE} \
  --flexconsumption-location ${REGION} \
  --runtime node --runtime-version 20 \
  --vnet ${VNET} --subnet ${FUNC_SUBNET} \
  --deployment-storage-auth-type SystemAssignedIdentity \
  --assign-identity '[system]'
```

### 5.6 RBAC (Managed Identity にストレージ権限)
```bash
MI=$(az functionapp identity show -n ${FUNCTION_APP} -g ${RG} --query principalId -o tsv)
for S in "$DATA_ID" "$FUNC_ID"; do
  az role assignment create --assignee-object-id "$MI" --assignee-principal-type ServicePrincipal \
    --role "Storage Blob Data Contributor" --scope "$S"
done
```

### 5.7 アプリ設定 (シークレットは env / Key Vault 参照で)
```bash
az functionapp config appsettings set -n ${FUNCTION_APP} -g ${RG} --settings \
  "STORAGE_ACCOUNT_NAME=${DATA_STORAGE}" \
  "AzureWebJobsStorage__accountName=${FUNC_STORAGE}"
# 認証系シークレットは Key Vault 参照を推奨:
#   "APP_SECRET=@Microsoft.KeyVault(SecretUri=https://${KEY_VAULT}.vault.azure.net/secrets/APP-SECRET)"
```

### 5.8 フロントに linked backend を接続
```bash
FUNC_RES=$(az functionapp show -n ${FUNCTION_APP} -g ${RG} --query id -o tsv)
az staticwebapp backends link -n ${FRONTEND} -g ${RG} \
  --backend-resource-id "$FUNC_RES" --backend-region ${REGION}
```

---

## 6. デプロイ
- **企業ネットワークからの大容量 zip デプロイはリセットされることがある** → **CI からデプロイ**する（[scripts/deploy_functionapp.yml](../scripts/deploy_functionapp.yml)）。
- **Flex Consumption + 共有キー禁止**では deployment ストレージ認証が Managed Identity であること（5.5）が前提。

---

## 7. アプリケーションコードのパターン (コンテンツプロキシ)

ブラウザがストレージへ直接アクセスできないため、**API がコンテンツをストリーム中継**する。

- **配信**: `GET /api/content/{id}/stream` — Blob を Managed Identity で読み取り、**HTTP Range 対応**で返す
  （`206 Partial Content` + `Content-Range`）。
- **アップロード**: SAS 直 PUT を廃止し、**API 経由バイナリアップロード**に統一。
- **認証情報**: 接続文字列 / AccountKey / キーベース SAS は使わない。`ManagedIdentityCredential` / `DefaultAzureCredential` で Blob クライアントを生成。
- ユーザー委任 SAS が必要な場合は `getUserDelegationKey`(Entra ベース)。ただしブラウザ直アクセスは Private 化で不可のため基本はプロキシ配信。

擬似コード (Node / TypeScript):
```ts
const props = await blob.getProperties();
const total = props.contentLength;
const { start, end } = parseRange(req.headers.range, total); // 無ければ全体
const dl = await blob.download(start, end - start + 1);
return {
  status: range ? 206 : 200,
  headers: {
    'Content-Type': props.contentType,
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes',
    ...(range && { 'Content-Range': `bytes ${start}-${end}/${total}` }),
  },
  body: Readable.toWeb(dl.readableStreamBody),
};
```

---

## 8. 検証手順
1. バックエンド単体: 未認証で保護エンドポイントが `401`。
2. フロント経由: `/api/*` が linked backend に委譲され `401`。
3. 認証後のデータ取得: `200`（**Private Endpoint 経由の Blob 読取成功**）。
4. コンテンツ配信: Range 要求に `206 Partial Content` + 正しい `Content-Range`。
5. E2E: ログイン→コンテンツ表示を **VS Code 統合ブラウザ**で自動テスト化。

---

## 9. セキュリティのベストプラクティス
- **共有キー / 接続文字列を使わない**。Managed Identity + RBAC のみ。
- シークレットはコードに置かない。環境変数 / **Key Vault 参照**で管理。
- 一時ファイル・診断ダンプ・認証キャッシュを `.gitignore`（`.azure/`, `*.publishsettings`, `tmp_*`, `*_dump.json`, デプロイ zip 等）。
- バックエンド inbound はフロント経由のみに絞る。
- ストレージは `publicNetworkAccess=Disabled` を維持（public 切替の自動化を作らない）。
- 露出したシークレットはローテーションする。

---

## 10. 異常系・落とし穴
[troubleshooting.md](troubleshooting.md) を参照。

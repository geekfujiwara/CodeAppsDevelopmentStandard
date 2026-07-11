# azure スキル — 異常系・トラブルシュート

テナントガバナンス準拠の Azure 構築で頻出する落とし穴と対処。

## ポリシー / ネットワーク

- **`--public-network-access Enabled` が無視される**
  - 症状: エラー無しで実行できるが値が `Disabled` のまま。
  - 原因: `publicNetworkAccess=Disabled` を Modify 効果で強制する Azure Policy が inline 上書き。
  - 対処: enable と戦わない。**Private Endpoint 化**する。応答 JSON の値で必ず確認する。

- **`This request is not authorized to perform this operation` (403)**
  - `publicNetworkAccess=Disabled` では IP 許可も trusted services バイパスも無効。到達は **Private Endpoint のみ**。
  - Private Endpoint と Private DNS ゾーン（A レコード自動登録）が正しいか確認する。

- **`SecuredByPerimeter` かつ NSP 未関連付け = 全 inbound/outbound 拒否**
  - NSP を作成せずにこのモードにすると完全遮断される。NSP を先に作成・関連付けるか、`Disabled` に戻す。

- **強制ポリシーの対象リソース型を見極める**
  - `PublicNetwork_Modify` 系はリソース型ごとに定義されることが多い。
  - ストレージ限定なら **コンピュート(Microsoft.Web)は公開可**（案 A）。Web も対象なら案 B（Front Door 等）。

## 認証 (MFA)

- **`RequestDisallowedByAzure: ... without authenticating through MFA`**
  - 原因: トークンが MFA 未実施（`amr=pwd`）。SSO キャッシュで MFA プロンプトが出ないことがある。
  - 対処: 実際に MFA を完了する。`scripts/ensure_az_mfa.ps1` はトークンの `amr` を判定し、
    MFA 済みならキャッシュ再利用、未 MFA のときのみ claims-challenge で MFA を要求する。

## デプロイ (Functions Flex Consumption)

- **`Key based authentication is not permitted on this storage account`**（デプロイ時）
  - 原因: 共有キー禁止環境で、deployment ストレージ認証がキーベースのまま。
  - 対処: **作成時に** `--deployment-storage-auth-type SystemAssignedIdentity` を指定する。
    作成後の ARM PATCH は Kudu(Legion) に反映されにくいため、**作り直す**のが確実。
    MI に対象ストレージの `Storage Blob Data Contributor` を付与しておく。

- **`your app will not start`（functionapp create 時）**
  - バックエンドストレージが private のため、作成時に `--vnet` / `--subnet` を**同時指定**する必要がある。

- **企業ネットワークからの zip デプロイが接続リセット (10054)**
  - 大容量 POST が企業プロキシで切られる。**CI(GitHub Actions 等)からデプロイ**する。
    Functions の publish エンドポイントは公開のため runner から到達できる（storage には触れない）。

## フロントエンド / 配信

- **動画等で `net::ERR_ABORTED`**
  - video 要素が初回リクエストをキャンセルし Range で再要求する**正常挙動**。
  - サーバが `206 Partial Content` + `Content-Range` を返せていれば問題ない。

## PowerShell スクリプト

- **`$Stage`(パラメータ) と関数引数 `$stage` の衝突**
  - PowerShell は変数名が大文字小文字非区別。関数引数は別名（例 `$target`）にする。
- **az の非0終了で停止しない**
  - `$PSNativeCommandUseErrorActionPreference = $true`（PS 7.3+）を設定する。
- **`$pid` は予約変数**（プロセス ID）。別名を使う。

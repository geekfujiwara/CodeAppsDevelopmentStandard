# ガバナンス設定リファレンス

`scripts/` で自動化していない管理設定の実施場所と要点。**API での自動化を確認できたものだけ**
スクリプト化し、それ以外は管理センターの操作手順として記載している。

## スクリプト化済み

| 設定 | スクリプト |
|---|---|
| マネージド環境の有効化 / 共有制限 / ソリューション チェッカー | [set_managed_environment.py](../scripts/set_managed_environment.py) |
| カスタムコネクタの DLP 分類（URL パターン規則） | [set_dlp_custom_connector.py](../scripts/set_dlp_custom_connector.py) |

`set_managed_environment.py` は BAP の
`PATCH /providers/Microsoft.BusinessAppPlatform/scopes/admin/environments/{env}?api-version=2021-04-01`
に `properties.governanceConfiguration` を送る。既存の `extendedSettings` は読み取ってマージするため、
指定しなかった項目は保持される。

## マネージド環境の主な拡張設定

| キー | 値 | 意味 |
|---|---|---|
| `limitSharingMode` | `noLimit` / `excludeSharingToSecurityGroups` | 共有先をセキュリティ グループ以外に制限するか |
| `maxLimitUserSharing` | 数値（`-1` は無制限） | 個人ユーザーへ共有できる人数の上限 |
| `solutionCheckerMode` | `none` / `warn` / `block` | ソリューション チェッカーの強制レベル |
| `isGroupSharingDisabled` | `true` / `false` | グループ共有の禁止 |

## 管理センターで実施する設定

| 設定 | 場所 | 要点 |
|---|---|---|
| IP ファイアウォール | 環境 > 設定 > プライバシー + セキュリティ | 許可する IP 範囲を CIDR で指定。マネージド環境が前提。監査モードで影響を確認してから有効化する |
| IP アドレスベースの Cookie バインディング | 同上 | セッション トークンの持ち出しを防ぐ。IP が頻繁に変わる環境では影響を確認する |
| テナント分離（クロステナント制限） | テナント設定 | 既定は許可。方向（受信 / 送信）ごとに例外テナントを登録する |
| 環境グループとルール | 環境グループ > ルール | 複数環境へ共通ルールを配布。公開すると各環境でライフサイクル操作が走る |
| Advanced connector policies | セキュリティ > データとプライバシー | 認定コネクタ / MCP コネクタの許可リスト。カスタム・HTTP・仮想コネクタは対象外 |
| 監査ログ（Purview 連携） | Dataverse 設定 + Microsoft Purview | 組織の監査とテーブル単位の監査の**両方**を有効にする必要がある |
| ライセンス / 容量の割り当て | Microsoft 365 管理センター + Power Platform 管理センター | Copilot Credits は環境単位で割り当てる。未割り当てだと生成 AI 機能が動かない |

## 設定変更の進め方

1. **現状を読み取る**: `check_environment.py` で現在値を出力し、変更前の状態を記録する。
2. **dry-run で差分を提示する**: 変更系スクリプトは `--apply` なしで実行し、ユーザーに確認してもらう。
3. **最小範囲で適用する**: テナント全体に効く設定は、対象ホスト・対象環境だけに絞る。
4. **反映を確認する**: 適用後に再度チェックを実行する。DLP は最大 24 時間、環境設定は数分かかる。

## 参考

- [マネージド環境の概要](https://learn.microsoft.com/power-platform/admin/managed-environment-overview)
- [IP ファイアウォール](https://learn.microsoft.com/power-platform/admin/ip-firewall)
- [IP アドレスベースの Cookie バインディング](https://learn.microsoft.com/power-platform/admin/ip-firewall-cookie-binding)
- [テナント分離](https://learn.microsoft.com/power-platform/admin/cross-tenant-restrictions)
- [環境グループ](https://learn.microsoft.com/power-platform/admin/environment-groups)
- [Advanced connector policies](https://learn.microsoft.com/power-platform/admin/advanced-connector-policies)
- [Dataverse の監査](https://learn.microsoft.com/power-platform/admin/manage-dataverse-auditing)

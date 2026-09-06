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
| Advanced connector policies | セキュリティ > データとプライバシー | 認定コネクタ / MCP コネクタの許可リスト。下記の節を参照 |
| 監査ログ（Purview 連携） | Dataverse 設定 + Microsoft Purview | 組織の監査とテーブル単位の監査の**両方**を有効にする必要がある |
| ライセンス / 容量の割り当て | Microsoft 365 管理センター + Power Platform 管理センター | Copilot Credits は環境単位で割り当てる。未割り当てだと生成 AI 機能が動かない |

## Advanced connector policies（ACP）

ACP はクラシック DLP の Business / Non-business / Blocked 分類を置き換える
**default-deny の厳格な許可リスト**。コネクタがブロックされる原因を調べるときは、
クラシック DLP だけでなく ACP も必ず確認する。

| 項目 | 内容 |
|---|---|
| 実施モード | **混成モード（既定）** = クラシック DLP と併用し、**より制限の厳しい方**を適用。ACP 専用モードにするとクラシック DLP を無視する |
| 適用スコープ | 環境グループ > ルール、または単一環境の セキュリティ > データとプライバシー。1 環境に有効な ACP は最大 1 つ |
| 対象コネクタ | 認定コネクタと MCP コネクタ（MCP はサーバー単位でブロック可）。HTTP / 仮想コネクタは対象外 |
| ルールの削除 | グループからルールを削除しても、**継承済みの環境からは消えない**。環境単位で `removeRule` する |
| 設計時の適用 | Power Automate → Copilot Studio → Power Apps の順で展開中 |

環境に割り当てられる `Synced Environment Policy (from Environment Group)` は
環境グループのポリシーの**同期コピー**。恒久的に変えるならグループ側のポリシーを更新する。

```powershell
# 確認（環境とグループの両方）
python .github/skills/admin/scripts/set_acp_connector.py `
  --environment-id $env:ENV_ID --include-group --connector shared_example

# 許可リスト全件を見る
python .github/skills/admin/scripts/set_acp_connector.py --environment-id $env:ENV_ID --list
```

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
- [ACP をプログラムから管理する](https://learn.microsoft.com/power-platform/admin/programmability-tutorial-manage-advanced-connector-policies)
- [Dataverse の監査](https://learn.microsoft.com/power-platform/admin/manage-dataverse-auditing)

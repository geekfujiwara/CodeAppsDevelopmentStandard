---
name: admin
description: "Power Platform のテナント / 環境ガバナンスを確認・設定する管理スキル。開発着手前の環境チェック（既定環境ではないか・マネージド環境・Dataverse / Code Apps / MCP の有効化・セキュリティ ロール・管理 API アクセス）と DLP 事前チェックを非対話スクリプトで実行し、必要ならマネージド環境設定・カスタムコネクタの DLP 分類・ACP（Advanced connector policies）の許可コネクタを dry-run 付きで変更する。クラシック DLP と ACP は既定の混成モードで併用され、より制限の厳しい方が適用されるため両方を確認する。IP 制限・テナント分離・監査ログ・ライセンス配分などの管理設定は references にまとめる。"
category: platform
triggers:
  - "環境チェック"
  - "環境準備"
  - "環境が使えるか"
  - "DLP"
  - "データ ポリシー"
  - "データ損失防止"
  - "ACP"
  - "Advanced connector policies"
  - "コネクタがブロックされる"
  - "ガバナンス"
  - "マネージド環境"
  - "Managed Environment"
  - "環境グループ"
  - "IP 制限"
  - "テナント分離"
  - "監査ログ"
  - "ライセンス"
  - "セキュリティ ロール確認"
  - "管理者権限"
  - "admin"
---

# Power Platform 管理・ガバナンススキル

**開発を始める前に環境が使える状態かを確認し**、必要なガバナンス設定を API で整えるためのスキル。
他スキル（`architecture` / `standard` / `code-apps` / `copilot-studio` / `mcp-server`）から
共通ステップとして呼び出される。

| 原則 | 内容 |
|---|---|
| 実装前に確認 | 設計が固まったら**実装着手前に** Step 1・Step 2 を実行し、結果をユーザーに提示する |
| 読み取り優先 | 既定は読み取り専用。変更系は必ず **dry-run → ユーザー確認 → `--apply`** の順 |
| 非対話 | 認証は `auth_helper.py` のキャッシュを使う。`Add-PowerAppsAccount` / `az login` は使わない |
| 最小変更 | テナント全体に効く設定は、対象ホスト・対象環境だけに絞って変更する |

> 必要なロールは [管理者ロール要件](references/admin-roles.md)、
> 環境チェックの判定基準は [environment-check.md](references/environment-check.md)、
> DLP は [dlp-precheck.md](references/dlp-precheck.md)、
> IP 制限・テナント分離・監査・ライセンスは [governance-settings.md](references/governance-settings.md)、
> 異常系は [troubleshooting.md](references/troubleshooting.md) を参照。

## スキル同梱スクリプト

パラメータは引数または `.env`（[references/.env.example](references/.env.example)）から取得する。

| スクリプト | 用途 | 変更 |
|---|---|---|
| [scripts/check_environment.py](scripts/check_environment.py) | 環境チェック一式（既定環境 / マネージド環境 / Dataverse / Code Apps / MCP / 監査 / セキュリティ ロール / 管理 API / 適用 DLP） | なし |
| [scripts/check_dlp.py](scripts/check_dlp.py) | 使用コネクタが DLP で使えるかの事前チェック | なし |
| [scripts/set_dlp_custom_connector.py](scripts/set_dlp_custom_connector.py) | カスタムコネクタ（自前 MCP Server 等）の DLP 分類を設定 | `--apply` 時のみ |
| [scripts/set_acp_connector.py](scripts/set_acp_connector.py) | ACP（Advanced connector policies）の許可コネクタを確認・追加 | `--apply` 時のみ |
| [scripts/set_managed_environment.py](scripts/set_managed_environment.py) | マネージド環境の有効化・共有制限・ソリューション チェッカー設定 | `--apply` 時のみ |
| [scripts/dlp_helper.py](scripts/dlp_helper.py) | DLP 管理 API の共通ロジック（他スクリプトから import） | なし |

## ワークフロー（正常系）

### Step 1: 環境チェックを実行する

対象環境が開発してよい状態かを一括で確認する。**新しい環境で作業を始める最初のステップ**。

```powershell
python .github/skills/admin/scripts/check_environment.py `
  --environment-id $env:ENV_ID `
  --require-managed --require-code-apps
```

`--require-*` を付けた項目は、満たさないと `NG`（終了コード 1）になる。
判定される項目と基準は [environment-check.md](references/environment-check.md) を参照。

出力例（抜粋）:

```text
[OK  ] 既定環境: 既定環境ではありません
[OK  ] マネージド環境: 有効（共有制限=noLimit / ソリューション チェッカー=warn）
[OK  ] Dataverse: https://<org>.crm.dynamics.com（v9.2.x）
[OK  ] Dataverse MCP: 有効（IsMCPEnabled=true）
[OK  ] Code Apps: 利用可能（この環境に N 件のコード アプリ）
[OK  ] セキュリティ ロール: System Administrator を保持しています
[INFO] 適用される DLP: 1 件: <ポリシー名>
```

### Step 2: DLP 事前チェックを実行する

ソリューションが使うコネクタを列挙して実行する。手順は [dlp-precheck.md](references/dlp-precheck.md)。

```powershell
python .github/skills/admin/scripts/check_dlp.py `
  --environment-id $env:ENV_ID `
  --tenant-id $env:TENANT_ID `
  --connector shared_commondataserviceforapps `
  --custom-host func-example-mcp.azurewebsites.net
```

### Step 3: 結果をユーザーに提示する

Step 1・Step 2 の `NG` / `WARN` を表にして提示し、**実装に入る前に**解消方針を合意する。
権限不足で読み取れない項目があれば、管理者に実行を依頼して結果を共有してもらう。

| 検出 | 典型的な対応 |
|---|---|
| 既定環境である | 開発用の専用環境を作成する |
| マネージド環境が無効 | Step 4 で有効化する（Code Apps のデプロイに必要） |
| Code Apps が確認できない | 管理センターで「コード アプリを許可する」をオンにする |
| Dataverse MCP が無効 | 管理センターの環境設定で MCP を有効化する |
| セキュリティ ロール不足 | 管理者に System Administrator（または必要な最小ロール）の割り当てを依頼 |
| コネクタが Blocked / グループ混在 / 未分類 | Step 5 または設計変更で解消する |
| クラシック DLP は OK なのにブロックされる | Step 6 で ACP の許可リストを確認する |

### Step 4: マネージド環境設定を変更する（必要な場合）

```powershell
# 既定は dry-run。現在値と変更後の値を表示するだけ
python .github/skills/admin/scripts/set_managed_environment.py `
  --environment-id $env:ENV_ID --enable --solution-checker-mode warn

# 出力を確認してもらってから適用する
python .github/skills/admin/scripts/set_managed_environment.py `
  --environment-id $env:ENV_ID --enable --solution-checker-mode warn --apply
```

既存の拡張設定は保持され、指定した項目だけが差し替わる。

### Step 5: カスタムコネクタの DLP 分類を設定する（必要な場合）

```powershell
python .github/skills/admin/scripts/set_dlp_custom_connector.py `
  --tenant-id $env:TENANT_ID --policy "<ポリシーの表示名>" `
  --host func-example-mcp.azurewebsites.net --classification General
# 内容を確認してから --apply
```

**併用する他のコネクタと同じグループ**に揃える。反映は通常 1 時間以内（最大 24 時間）。

### Step 6: ACP の許可リストを確認・追加する（必要な場合）

ACP（Advanced connector policies）は **default-deny の厳格な許可リスト**で、
既定の**混成モード**ではクラシック DLP と併用され**より制限の厳しい方**が適用される。
そのため Step 2 が `OK` でも、ACP の許可リストに無いコネクタはブロックされる。

```powershell
# 環境と環境グループの両方で許可状況を確認（読み取りのみ）
python .github/skills/admin/scripts/set_acp_connector.py `
  --environment-id $env:ENV_ID --include-group `
  --connector shared_example-custom-connector

# 内容を確認してから、環境グループ側の元ポリシーに追加する
python .github/skills/admin/scripts/set_acp_connector.py `
  --policy-id <グループ ポリシー ID> `
  --connector shared_example-custom-connector --apply
```

環境に割り当てられるのは環境グループから同期された写しなので、
**環境グループ側のポリシーを更新**しないと再同期で元に戻る。
適用後は必ず再確認し、許可コネクタ数が増えていることを確認する。

### Step 7: 反映を確認する

変更後に Step 1・Step 2・Step 6 を再実行し、`OK` になったことを確認してからユーザーへ報告する。
DLP は反映に時間がかかるため、直後に解消していなくても再評価まで待って判断する。

## 他スキルからの呼び出し

| 呼び出し元 | タイミング | 実行するもの |
|---|---|---|
| `architecture` | 構成確定後・実装着手前 | Step 1 → Step 2 |
| `standard` | 新しい環境で作業を開始するとき | Step 1 |
| `code-apps` | 初回デプロイ前 | Step 1（`--require-managed --require-code-apps`） |
| `copilot-studio` / `copilot-studio-v2` | エージェント作成前・MCP ツール追加前 | Step 1（`--require-mcp`）→ Step 2 → Step 6 |
| `mcp-server` | カスタムコネクタ登録前後 | Step 2 → Step 5 → Step 6 |

## 参考リンク

- [データ ポリシー（DLP）](https://learn.microsoft.com/power-platform/admin/wp-data-loss-prevention)
- [マネージド環境の概要](https://learn.microsoft.com/power-platform/admin/managed-environment-overview)
- [Advanced connector policies](https://learn.microsoft.com/power-platform/admin/advanced-connector-policies)
- [ACP をプログラムから管理する](https://learn.microsoft.com/power-platform/admin/programmability-tutorial-manage-advanced-connector-policies)
- [Power Platform 管理者ロール](https://learn.microsoft.com/power-platform/admin/use-service-admin-role-manage-tenant)

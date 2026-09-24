# sales-crm-plugin — 営業支援 CRM 用 Cowork プラグイン

Code Apps テンプレート [`code-apps/templates/sales-crm`](../../../code-apps/templates/sales-crm/README.md) と同じ Dataverse を使い、
Microsoft 365 の予定表・メール・Teams チャットと CRM をつなぐ 3 つのスキルを提供する。

| スキル | 利用者 | トリガー例 |
|---|---|---|
| `sales-activity-sync` | 営業 | 「今日の営業報告をして」「今週の商談活動を CRM に反映して」 |
| `target-gap-planner` | 営業 | 「目標達成プランを作って」「今期あといくら足りない？」 |
| `manager-blocker-review` | マネージャー | 「1on1 の準備をして」「メンバーの障害を洗い出して」 |

Cowork の組み込み機能（メール・予定表・チャットの読み取り、下書き作成）と重複する処理は書かず、
**CRM との突き合わせ・差分登録・指標計算**だけをスキルに持たせている。書き込み・送信は必ずユーザー確認後に行う。

## 生成

```powershell
# DATAVERSE_ORIGIN は末尾スラッシュなしの組織 URL。COWORK_PLUGIN_ID は版を上げても変えない GUID
$pluginId = python -c "import uuid; print(uuid.uuid5(uuid.NAMESPACE_URL, 'https://<org>.crm.dynamics.com/sales-crm'))"
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/cowork/templates/sales-crm-plugin --target cowork/sales-crm `
  --var DATAVERSE_ORIGIN=https://<org>.crm.dynamics.com --var COWORK_PLUGIN_ID=$pluginId
```

`.env` に `PUBLISHER_PREFIX` と `COWORK_DEVELOPER_NAME` / `COWORK_DEVELOPER_URL` / `COWORK_PRIVACY_URL` / `COWORK_TERMS_URL` が必要
（[references/.env.example](../../references/.env.example)）。

## 公開

[cowork スキル](../../SKILL.md) の Step 3〜8 に従う（Entra OAuth アプリ → `allowedmcpclients` 登録 → OAuth client registration →
ビルド → 管理センター private API で登録・公開）。既存の Cowork 用 OAuth 登録がある環境では Step 3〜5 を再利用できる。

```powershell
# ビルド（registrationId を manifest に注入）
& .github/skills/cowork/scripts/build_agent_package.ps1 -PluginRoot cowork/sales-crm -OutputName sales-crm -EnvPath .env
# 統合ブラウザで stageCustomApp(DEPLOY) → stage.json を保存したら plan payload を生成
python .github/skills/cowork/scripts/build_cowork_publish_payloads.py --mode new --stage-file stage.json `
  --publish-to <検証ユーザーのオブジェクトID> --install-to <検証ユーザーのオブジェクトID> --out-dir publish-plan
```

版を上げたときは `manifest.json` の `version` を上げて再ビルドし、Step 10（`UPDATEAPP`）で更新する。

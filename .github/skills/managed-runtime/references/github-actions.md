# GitHub Actions による外部成果物デプロイ

`ms app create --repo none`（`repoType: none`）で作ったアプリを、自前の CI でビルドして配備する。
プラットフォームの preview と commit 単位の rollback は使わない。

## 前提

| 項目 | 担当 | 内容 |
|---|---|---|
| 外部成果物デプロイの許可 | 管理者 | M365 管理センター → Apps → Settings → Environment groups で *Allow external artifact deployment* を有効化（既定は無効） |
| CLI | 開発者 | ローカルで `ms app create --repo none` を実行（CLI 0.7.0 以降）。`ms.config.json` をコミットする |
| サービス プリンシパル | 管理者 | 下記の権限を付与 |
| シークレット | リポジトリ管理者 | `PP_SP_CLIENT_ID` / `PP_SP_CLIENT_SECRET` / `PP_SP_TENANT_ID` |

## サービス プリンシパルの権限

1. Microsoft Entra ID でアプリを登録し、クライアント シークレットを発行する。
2. アプリの環境に権限を付与する。
   - Dataverse 環境: Power Platform 管理センター → 環境 → 設定 → アプリケーション ユーザーで追加し、
     System Administrator と System Customizer を割り当てる。
   - Dataverse なしの環境: Business Application Platform API で EnvironmentAdmin を割り当てる。
     principal にはエンタープライズ アプリケーション側のオブジェクト ID を使う（アプリ登録のオブジェクト ID ではない）。
3. シークレットをリポジトリの Actions シークレットに登録する。値はチャットやログに出さない。

## ワークフローを生成する

```powershell
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/managed-runtime/templates/github-actions-deploy `
  --target <アプリのリポジトリ ルート> --force --dry-run
```

`--dry-run` で `.github/workflows/deploy-managed-app.yml` だけが生成されることを確認してから外す。
`MANAGED_APP_WORKDIR`（アプリのパス）と `MANAGED_APPS_ACTIONS_REF`（Actions の不変タグ）は `.env` で指定する。

生成されるワークフローの要点:

- `main` への push と手動実行で起動する。
- `production` Environment を使う。承認者を設定すると、配備前に承認が必要になる。
- `npm install` → `install-ms-cli` → `ms-app-pack` → `ms-app-deploy` の順に、同じ `working-directory` で実行する。
- Actions は `@v1` ではなく不変タグ（`@v1.x.y`）に固定する。`@v1` は最新リリースへ移動する。

## 注意

- 外部で作った成果物の検証とパイプラインの保護は組織の責任になる。
- モノレポで複数アプリを扱うときは、アプリごとにワークフローを分け、`paths:` で起動条件を絞る。

## 出典

- [Deploy apps with GitHub Actions](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/deploy-managed-apps-github-actions?view=o365-worldwide)
- [Governance（External artifact deployment）](https://learn.microsoft.com/en-us/microsoft-365/admin/manage/apps/governance?view=o365-worldwide)
- [microsoft/managed-apps の github-actions](https://github.com/microsoft/managed-apps/tree/main/github-actions)

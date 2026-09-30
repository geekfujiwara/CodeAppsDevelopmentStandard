# リポジトリ方式の選び方

Copilot Managed Runtime のアプリは、作成時にリポジトリ方式を 1 つ選ぶ。
**作成後は変更できない**。変えるときはアプリを作り直す。

## 3 つの方式

| 方式 | `create_app.py --repo-mode` | `ms app create` | ビルド元 | 向いている場面 |
|---|---|---|---|---|
| platform-managed Git（既定） | `platform` | `--repo` なし | プラットフォームが用意する Git | 個人開発・PoC・Copilot から始めたアプリの引き継ぎ |
| 自社 GitHub | `github` | `--repo https://github.com/<org>/<repo>` | 指定した GitHub | PR レビュー・ブランチ保護・CODEOWNERS を開発統制に使う |
| 外部ビルド | `none` | `--repo none` | 自前の CI が作る成果物 | 既存の CI でビルド・署名・検査してから配備する |

- platform-managed Git も通常の Git remote として clone / pull / push できる。GitHub のような Web 画面・PR 機能は無い。
- 自社 GitHub は **既存の空リポジトリ**を指定する。CLI がそこへ clone してテンプレートを重ねる。
- 対応ホストは `github.com` と `*.ghe.com`（GitHub Enterprise Cloud）。GitHub Enterprise Server と Azure DevOps Repos は CLI の `--repo` では非対応（Learn 記載）。
- public リポジトリは既定で禁止（管理者設定 *Allow public GitHub repository*）。
- 対象の organization / repository に GitHub App **Microsoft Managed Apps** を導入する。
- 外部ビルドは既定で禁止（管理者設定 *Allow external artifact deployment*）。preview と commit 単位の rollback は使えない。

## 判断フロー

```
PR レビューやブランチ保護を「本番の統制」に使う？
├─ YES → GitHub.com / GHE.com を使える？
│         ├─ YES → github
│         └─ NO  → 既存 CI で成果物を作る？ → YES: none（管理者の許可が必要） / NO: platform
└─ NO  → platform
```

## Copilot から作る場合

| 作成経路 | リポジトリ | このスキルとの合流 |
|---|---|---|
| Microsoft Copilot の Copilot Code | プロジェクト作成時に GitHub / Azure DevOps / Local を選べる（実機確認） | Step 3 の「既存アプリを引き継ぐ」 |
| Copilot Cowork の App builder / Copilot Studio | platform-managed Git（Learn 記載） | `ms app clone --app <app-id>` |
| GitHub Copilot CLI + Managed Runtime plugin | 公式 `create-app` skill は `--repo` なしで作る → platform-managed Git | 自社 GitHub にしたいなら、先に本スキルの Step 3 で作成する |

> [!NOTE]
> Copilot Code で Azure DevOps / Local を選んだプロジェクトが、Managed Runtime の preview / live までそのまま
> デプロイできるかは未検証。Learn の CLI `--repo` は Azure DevOps 非対応と記載している。
> 採用前に `ms app info` のリポジトリ URL、push 後の preview、`ms app deploy` の成否を実測する。

## GitHub Connector との違い

Microsoft 365 Copilot の GitHub Cloud Knowledge connector は、GitHub の Markdown / テキストを
Copilot の検索対象にする機能で、アプリのリポジトリを指定する手段ではない。

## 出典

- [Build, preview, and deploy](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/dev-inner-loop?view=o365-worldwide)
- [SDK overview（Repository options）](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/?view=o365-worldwide)
- [Collaborate on an app](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/collaborate-on-app?view=o365-worldwide)
- [Governance（public GitHub / external artifacts）](https://learn.microsoft.com/en-us/microsoft-365/admin/manage/apps/governance?view=o365-worldwide)

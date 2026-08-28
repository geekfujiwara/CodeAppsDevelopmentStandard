---
name: sharepoint
description: "AAD アプリ登録を行わずに、Microsoft Graph API 経由で SharePoint を包括的に操作する。リスト（ドキュメントライブラリ）・列・リスト項目の作成、ファイルアップロード、ページ作成、M365 グループ経由のサイト作成に対応。Microsoft Graph PowerShell の well-known パブリッククライアントで委任認証し、auth_helper.py のキャッシュを再利用する。"
category: architecture
triggers:
  - "SharePoint"
  - "SharePoint サイト作成"
  - "SharePoint リスト作成"
  - "SharePoint 列作成"
  - "SharePoint ファイルアップロード"
  - "SharePoint ページ作成"
  - "Graph API SharePoint"
  - "sharepoint provisioning"
  - "AAD アプリ登録なし"
  - "アプリ登録不要"
---

# SharePoint スキル（Graph API・AAD アプリ登録不要）

Microsoft Graph API で SharePoint を操作する。**新規の Entra アプリ登録を行わない。** 組織によっては
一般ユーザーにアプリ登録権限が無いことが多く、そのハードルを避けるため、Microsoft 製の well-known
パブリッククライアント（Microsoft Graph PowerShell）への委任同意だけで完結させる。

## 対応する操作

| 操作 | スクリプト | Graph API |
|---|---|---|
| リスト（ドキュメントライブラリ）・列の作成 | [scripts/create_list.py](scripts/create_list.py) | `POST /sites/{id}/lists`, `POST /sites/{id}/lists/{id}/columns` |
| リスト項目（行）の登録 | [scripts/create_list_item.py](scripts/create_list_item.py) | `POST /sites/{id}/lists/{id}/items` |
| ファイルアップロード（≤250MB） | [scripts/upload_file.py](scripts/upload_file.py) | `PUT /sites/{id}/drive/root:/{path}:/content` |
| サイトページの作成・公開 | [scripts/create_page.py](scripts/create_page.py) | `POST /sites/{id}/pages`, `POST .../pages/{id}/microsoft.graph.sitePage/publish` |
| サイト作成（M365 グループ連携チームサイト・間接） | [scripts/create_site.py](scripts/create_site.py) | `POST /groups` → `GET /groups/{id}/sites/root` |

> **サイトの更新・削除、グループ非連携のコミュニケーションサイト作成は Graph v1.0 に汎用 API が無く未対応。**
> 詳細・回避策は [references/troubleshooting.md](references/troubleshooting.md) を参照。

## 前提

- [standard スキル](../standard/SKILL.md) の `auth_helper.py` が使えること（`.env` に `TENANT_ID` 設定済み）
- 対象 SharePoint サイトの URL（例: `https://{tenant}.sharepoint.com/sites/{site}`）
- 書き込み権限を持つアカウントでサインインできること（`Sites.ReadWrite.All` 等の委任スコープは
  Admin 同意が必要な場合がある。管理者アカウントでの初回同意を推奨）

## なぜ既定の認証クライアントでは失敗するか

`auth_helper.py` の既定クライアント（Azure CLI 互換）には SharePoint 書き込み系スコープ
（`Sites.ReadWrite.All` 等）が事前同意されていないため、書き込み系操作（`POST`/`PUT`）が
**403 Forbidden** になる（読み取り専用の GET は通ることが多く紛らわしい）。

新しい Entra アプリを登録すれば権限を自由に設計できるが、**組織によってはアプリ登録自体が
一般ユーザーに許可されていない**ことが多い。そこで、Microsoft が既に multi-tenant で
公開・運用している **Microsoft Graph PowerShell** のクライアント ID
（`14d82eec-204b-4c2f-b7e8-296a70dab67e`、全スクリプトの既定値）を使う。これは対象テナントに
新規アプリを登録する必要がなく、初回のみそのクライアントへの委任スコープ同意（管理者同意が
必要な場合あり）を行うだけで済む。

> **Work IQ のような一部の Microsoft 製 API は、これでも `AADSTS65002`（第一者アプリ同士の
> 事前承認が必要）で拒否される。** これは認証方式の問題ではなく、API 提供元が個別に許可した
> 第一者クライアントしか受け付けない仕様のため、well-known クライアント ID を変えても解決しない。
> SharePoint / Graph の一般的なリソースにはこの制限は無いため本スキルの方式が使える
> （詳細は [references/troubleshooting.md](references/troubleshooting.md) 参照）。

## 手順

### Step 1: リスト（ドキュメントライブラリ）と列を作成する

列を作りたい場合は [Microsoft Graph `columnDefinition`](https://learn.microsoft.com/graph/api/resources/columndefinition)
形式の JSON 配列を用意する（[references/sample-columns.json](references/sample-columns.json) 参照）。

**列名を決める際の注意（重要）**: SharePoint の非表示システム列と `displayName` が衝突する名前
（`Description` / `Version` / `Title` / `Name` / `Type` 等）は使わない。衝突すると Graph が
内部名を `Xxx0` のように自動リネームし、冪等性チェックが効かず実行のたびに重複作成される。
`SkillDescription` のように接頭辞/接尾辞を付けて回避する。URL を保存する列は `hyperlinkOrPicture`
型ではなく **`text` 型**を使う（後述の理由により `hyperlinkOrPicture` は本スキルの検証環境で
一貫して 400 になった）。

```powershell
# 確認のみ
python .github/skills/sharepoint/scripts/create_list.py `
  --site-url "https://{tenant}.sharepoint.com/sites/{site}" --list-name "SkillCatalog" --columns "path/to/columns.json"

# 実際に作成
python .github/skills/sharepoint/scripts/create_list.py `
  --site-url "https://{tenant}.sharepoint.com/sites/{site}" --list-name "SkillCatalog" --columns "path/to/columns.json" --apply
```

既存のリスト・列はスキップするため再実行しても安全（冪等）。

### Step 2: リストに項目を登録する

> **注意**: `create_list_item.py` はドキュメントライブラリ（`--template documentLibrary`）には使えない
> （Graph が `POST .../items` を拒否する。実機で確認済み。[references/troubleshooting.md](references/troubleshooting.md) #7 参照）。
> 表形式データを行として管理したい場合は `create_list.py --template genericList` で汎用リストを作成すること。

```powershell
python .github/skills/sharepoint/scripts/create_list_item.py `
  --site-url "https://{tenant}.sharepoint.com/sites/{site}" --list-name "MyGenericList" `
  --fields "path/to/fields.json"
```

`--fields` は PowerShell の引用符ネストで壊れやすいため、JSON はファイルに書いて渡すことを推奨する
（例: `{"Title": "Widget", "Color": "Purple"}`）。列名は `create_list.py` で作成した内部名（`name`）を使う。

### Step 3: ファイルをアップロードする

```powershell
python .github/skills/sharepoint/scripts/upload_file.py `
  --site-url "https://{tenant}.sharepoint.com/sites/{site}" `
  --local-path "./skill-image.png" --remote-path "SkillCatalog/skill-image.png"
```

既定ドキュメントライブラリ（サイトの `drive` = 通常 "Documents"）を起点にした相対パスを指定する。
250MB を超えるファイルは分割アップロードセッションが必要で本スキル未対応。

### Step 4: ページを作成する

```powershell
python .github/skills/sharepoint/scripts/create_page.py `
  --site-url "https://{tenant}.sharepoint.com/sites/{site}" `
  --page-name "skill-catalog.aspx" --title "スキルカタログ" --html "<p>紹介文</p>" --publish
```

`--publish` を付けると作成直後に公開する。

### Step 5（間接的・制約あり）: サイトを作成する

Graph v1.0 に「新規 SharePoint サイトを直接作成する」汎用 API は無い。M365 グループを作成し、
その副作用としてプロビジョニングされる連携チームサイトを取得する方式を使う。

```powershell
# 確認のみ
python .github/skills/sharepoint/scripts/create_site.py --display-name "Skill Catalog" --mail-nickname skillcatalogpoc

# 実際に作成（テナントに新しい M365 グループが追加されるため実行前に必ずユーザーに確認する）
python .github/skills/sharepoint/scripts/create_site.py --display-name "Skill Catalog" --mail-nickname skillcatalogpoc --apply
```

> **サイト作成はテナントのディレクトリに新しい M365 グループを追加する操作。** 他の操作（リスト・
> ファイル・ページ）よりも影響範囲が大きいため、`--apply` 実行前に必ずユーザーに確認すること。

## 参照

- [references/troubleshooting.md](references/troubleshooting.md) — 異常系（403 / 400 / 列名衝突 / AADSTS65002 / サイト更新・削除の未対応）
- [references/.env.example](references/.env.example)
- [references/sample-columns.json](references/sample-columns.json) — 列定義サンプル
- [standard スキル](../standard/SKILL.md) — `auth_helper.py` の認証パターン

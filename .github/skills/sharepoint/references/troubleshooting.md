# sharepoint — 異常系・トラブルシュート

## 1. `403 Forbidden` で書き込み系操作（リスト作成・アイテム作成・ファイルアップロード等）だけが失敗する

**症状**: サイト解決（`GET /sites/{host}:{path}`）やリスト一覧取得（`GET .../lists`）は成功するのに、
書き込み系操作（`POST`/`PUT`）だけ `403 Forbidden` になる。

**原因**: `auth_helper.py` の既定クライアント（Azure CLI 互換）には SharePoint 書き込み系スコープ
（`Sites.ReadWrite.All` 等）が事前同意されていない。読み取り系スコープは既定で通ることが多いため、
「読み取りは成功するのに書き込みだけ失敗する」という紛らわしい挙動になる。

**対処**: 本スキルの既定どおり Microsoft Graph PowerShell の well-known ID
（`14d82eec-204b-4c2f-b7e8-296a70dab67e`）を使う（各スクリプトの既定値）。初回のみそのクライアントへの
委任スコープ同意（`Sites.ReadWrite.All` 等、Admin 同意が必要な場合あり）が発生する。

## 2. `AADSTS65002: Consent between first party application ... and first party resource ... must be configured via preauthorization`

**症状**: Work IQ（`fdcc1f02-fc51-4226-8753-f668596af7f7`）のような一部の Microsoft 製 API に対して、
Azure CLI や Microsoft Graph PowerShell 等の well-known クライアントでトークンを要求すると、
デバイスコード認証自体は成功するのにトークン発行段階でこのエラーになる。

**原因**: これは認証方式（ブラウザ / デバイスコード / PAC プロファイル）の問題ではない。
**クライアントとリソースの両方が Microsoft 所有の第一者アプリの場合、リソース側（API 提供元）が
個別に許可した第一者クライアントしか受け付けない**という Entra ID のポリシーによる。
Work IQ はこの制限があり、Azure CLI・Microsoft Graph PowerShell 等の汎用開発者ツールは
許可リストに入っていない。**SharePoint（本スキルが対象とする Graph リソース）にはこの制限は無い。**

**対処（本スキルの対象外 API に遭遇した場合）**:
1. **その API へのアクセスを諦め、範囲を絞る。** 本スキルは SharePoint など、この制限が無い
   一般的な Graph リソースに対象を限定している。
2. **自前の Entra アプリ登録**を作り、対象 API の必要な委任スコープを追加して管理者同意を得る
   （Microsoft 所有ではない自前アプリはこの「第一者同士」の制限を受けない）。ただし組織によっては
   アプリ登録自体に承認が必要で、ハードルが本スキルの目的（アプリ登録不要）と矛盾する。

## 3. 列作成が `400 Bad Request: {"error":{"code":"invalidRequest","message":"Invalid request"}}` になる（`hyperlinkOrPicture` 型）

**症状**: `text` / `choice` / `personOrGroup` / `dateTime` 型の列作成は成功するのに、
`hyperlinkOrPicture` 型（`{"isPicture": false}`）の列だけ、列名を変えても一貫して 400 になる。
リクエストボディは [Microsoft Learn の仕様](https://learn.microsoft.com/graph/api/resources/hyperlinkorpicturecolumn)
どおりで、権限不足（403）ではなく毎回同じ 400。

**原因**: 検証したテナント・サイトでは `hyperlinkOrPicture` 型の列作成が Graph API 側で
一貫して失敗した（テナント/サイトの構成や Graph API 側の既知の制約の可能性がある。恒久的な
Microsoft 側の仕様かは未確認）。

**対処（恒久対策・実装済み）**: URL を保存する列は `hyperlinkOrPicture` ではなく **`text` 型**で作成する。
[references/sample-columns.json](sample-columns.json) は最初から `text` 型を使っている。
クリックしてリンクを開む UX は失うが、値としての URL は問題なく保存・取得できる。

## 4. 同じ列を再実行すると重複作成される（`Description0` / `Version0` のように内部名がリネームされる）

**症状**: 一般的な名前で `Description` や `Version` という列を作ると、1回目は成功するが、
2回目に実行すると（冪等性チェックで「既存」と判定されず）また新しい列が `Description1` のような
内部名で作られてしまう。

**原因**: SharePoint のドキュメントライブラリには、`_ExtendedDescription`（displayName: "Description"）や
`_UIVersionString`（displayName: "Version"）のような**非表示のシステム列**が既定で存在する。
同じ `displayName` の列を作成しようとすると、Graph は内部名（`name`）を自動的に
`Description0` のようにリネームして作成する。`create_list.py` の冪等性チェックは
**内部名（`name`）で既存判定**しているため、意図した名前とは異なる内部名で作られたことに気づけず、
毎回「未作成」と判定して重複作成してしまう。

**対処（恒久対策・実装済み）**:
- `create_list.py` は既知の衝突しやすい名前（`RESERVED_DISPLAY_NAME_COLLISIONS`:
  `Description` / `Version` / `Title` / `Name` / `Type`）を列定義に見つけた場合、実行前に警告を表示する。
- 列名自体を `SkillDescription` / `SkillVersion` のように、システム列と衝突しない名前に変更する
  （[references/sample-columns.json](sample-columns.json) は最初からこの命名を採用済み）。
- 誤って重複作成してしまった場合は、Graph の `DELETE /sites/{id}/lists/{id}/columns/{columnId}`
  で不要な列（`Description0` 等）を削除してから、列名を変更して再実行する。

## 5. サイトの更新・削除、コミュニケーションサイトの直接作成ができない

**症状**: `PATCH /sites/{site-id}` でサイトのプロパティを更新したい、または `DELETE /sites/{site-id}`
でサイト（サイトコレクション）を削除したい、あるいはグループに紐付かないコミュニケーションサイトを
直接作成したいが、対応する汎用エンドポイントが Graph v1.0 に見当たらない。

**原因（仕様上の制約）**: Microsoft Graph v1.0 には、任意の新規 SharePoint サイトを直接作成する
汎用 API・サイトの一般プロパティを更新する汎用 API・サイト（サイトコレクション）を削除する
汎用 API が**存在しない**（2026年時点で確認）。Graph が提供するのはリスト・リスト項目・ドライブ
（ファイル）・ページ等、サイト**内部**のリソース操作が中心。

**対処（回避策）**:
- **サイト作成**: 本スキルの [scripts/create_site.py](create_site.py) のように、M365 グループ
  （`POST /groups`）を作成し、その副作用で自動プロビジョニングされる「グループ連携チームサイト」
  を `GET /groups/{id}/sites/root` で取得する間接的な方法を使う。グループに紐付かない
  コミュニケーションサイトは作成できない。
- **サイトの更新・削除**: SharePoint 管理センター（手動）、PnP PowerShell
  （`Set-PnPSite` / `Remove-PnPTenantSite` 等）、または SharePoint 管理系 REST API
  （`_api/SPSiteManager` 等、Graph とは別の認証・エンドポイント体系）が必要。
  いずれも「AAD アプリ登録なし」という本スキルの前提を超える可能性があるため、対象タスクの
  必須要件かどうかを確認してから着手する。

## 6. PowerShell の `-c` ワンライナーで Graph 呼び出しコードがクォートエラーになる

ネストしたシングル/ダブルクォートや `$` を含む Python コードを `python -c "..."` として
PowerShell に渡すと、エスケープが崩れて `SyntaxError` になりやすい（[standard スキルの
auth-patterns.md](../standard/references/auth-patterns.md) にも同種の注意がある）。

**対処**: デバッグ・一時的な確認コードは `-c` のワンライナーにせず、一時的な `.py` ファイルに
書いて `python <file>.py` で実行する。実行後は忘れずに削除する。**`create_list_item.py` の
`--fields` に JSON を直接渡す場合も同様**で、PowerShell の二重引用符ネストで壊れやすいため、
JSON を一時ファイルに書いて `--fields path/to/fields.json` で渡す方が安全（実機で確認済み）。

## 7. `create_list_item.py` が `"Files and folders should only be added to a DocumentLibrary via the OneDrive API"` で失敗する

**症状**: `--template documentLibrary`（既定）で作成したリスト（ドキュメントライブラリ）に対して
`create_list_item.py` を実行すると 400 エラーになる。

**原因**: ドキュメントライブラリの実体はフォルダ・ファイル（`driveItem`）であり、Graph は
`POST /sites/{id}/lists/{id}/items` によるアイテム直接作成をドキュメントライブラリに対して
拒否する（実機で確認済み）。ファイル・フォルダは **OneDrive API**（`/drive/...`。
[upload_file.py](upload_file.py) 参照）経由で作成する必要がある。

**対処**:
- 表形式のデータを行として管理したい場合は `create_list.py --template genericList` で
  **汎用リスト**を作成し、そちらに `create_list_item.py` で項目を登録する（実機で確認済み）。
- ドキュメントライブラリ内のフォルダにメタデータ列を持たせたい場合（例: 要求書の
  「各スキルにつき1フォルダ、フォルダのメタデータとして列を保持」という設計）は、
  1) OneDrive API でフォルダを作成（`POST /sites/{id}/drive/root:/{path}:/children` に
  `{"name": "...", "folder": {}}`）→ 2) 作成された `driveItem` に対応する `listItem` を
  `GET .../items/{item-id}?$expand=fields` で取得 → 3)
  `PATCH /sites/{id}/lists/{id}/items/{item-id}/fields` でメタデータ列を更新、という3段階の
  手順が必要（本スキルの現バージョンではスクリプト化していない。今後の拡張候補）。


# Cowork プラグイン トラブルシュート（異常系メモ）

正常系は [../SKILL.md](../SKILL.md) を参照。ここでは実際に遭遇したエラーと対処を記録する。

## 1. Azure CLI が PATH に出ない（新規ターミナル）

winget で入れた直後の既存ターミナルでは `az` が解決されないことがある。
各コマンドの先頭で wbin を前置きする。

```powershell
$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;$env:PATH"
```

## 2. `az login` のブラウザフローがハングする

ブラウザが開いたまま戻らない場合はデバイスコードに切り替える。

```powershell
az login --use-device-code --tenant <TENANT_ID> --allow-no-subscriptions --only-show-errors
```

## 3. Graph PATCH: `Invalid property 'oauth2PermissionScopes'`

`oauth2PermissionScopes` を直下に置くと失敗する。必ず `api` でラップする。

```jsonc
// NG
{ "oauth2PermissionScopes": [ ... ] }
// OK
{ "api": { "oauth2PermissionScopes": [ ... ] } }
```

## 4. 事前承認: `delegatedPermissionIds has a Permission Id that cannot be found`

`preAuthorizedApplications` が参照する `delegatedPermissionIds` のスコープが、まだアプリに
登録されていないと失敗する。**スコープ公開を先に PATCH し、別 PATCH で事前承認**を行う（2段階）。

1. PATCH ①: `api.oauth2PermissionScopes`（access_as_user）を設定
2. PATCH ②: `api.preAuthorizedApplications`（Enterprise Token Store `ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b`）を設定

## 5. graph.microsoft.com が `6.6.0.14` に解決され接続不可

`Resolve-DnsName graph.microsoft.com` が `6.6.0.14`（合成IP）を返し、`ConnectTimeout` /
`WinError 10053/10060` が発生する。この環境固有の DNS/IPv6 問題。

対処（順に試す）:
```powershell
ipconfig /flushdns
# それでも 6.6.0.14 なら一時的に IPv4 公開 DNS を併用 / VPN・プロキシを切り替え
# 復旧後にリトライ（Entra 設定 PATCH は冪等なので再実行で問題なし）
```
> Dataverse 側で同様の問題が出た際は hosts に IP を固定して回避した（例: `13.87.216.130 usdevgeek01.crm.dynamics.com`）。
> graph 側も復旧待ち or 別ネットワークで実施するのが確実。

## 6. allowedmcpclient で Cowork 未許可 → 403 / ツールが出ない

環境が Microsoft Cowork クライアントを許可していないと、コネクタが動作しない。
事前に確認・有効化する。

```powershell
python .github/skills/standard/scripts/check_mcp_client.py cowork
```
未許可なら Power Platform 管理センター → 環境 → MCP クライアント許可で `Microsoft Cowork`
(`6ab48b67-cd74-4ad4-81af-5932984589be`) を有効化。

## 7. ZIP 再ビルド時のファイルロック

直前に `ZipFile.OpenRead` などでハンドルが残ると `Compress-Archive` が失敗する。

```powershell
[System.GC]::Collect(); Remove-Item dist\*.zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path manifest.json, color.png, outline.png, skills -DestinationPath dist\<name>.zip -Force
```

## 8. manifest をフォルダごと圧縮してしまう

`manifest.json` は ZIP の**ルート**に置く必要がある。プラグインフォルダ自体を圧縮すると
`<folder>/manifest.json` になり読み込めない。`-Path` に個別ファイル/サブフォルダを列挙する。

## 9. SKILL.md が認識されない

- フォルダ名と frontmatter `name` が不一致 → 完全一致させる（kebab-case）。
- `name` に大文字・アンダースコア・連続/先頭/末尾ハイフンがある → 規約違反（ASKILL-P001..P008）。

## 10. referenceId と allowedmcpclient の混同

- `allowedmcpclient` の「Microsoft Cowork」= 環境がそのクライアントを許可する設定。
- manifest の `referenceId` = Teams 開発者ポータルで作る **SSO/OAuth クライアント登録 ID**。
両者は別物。referenceId は環境設定ではなくポータル登録から取得する。

## 11. アップロード検証: `Required properties are missing: mcpToolDescription`

公式 docs の manifest 例は `mcpToolDescription` を**省略している**が、M365 管理センターの
エージェントアップロード検証（Agent 365 プレビュー）は**必須化**している。
`remoteMcpServer` に `mcpToolDescription` を追加する。

## 12. `Invalid type. Expected Object but got String`（mcpToolDescription）

`mcpToolDescription` を文字列にすると失敗する。**オブジェクト** `{ "file": "<相対パス>" }` で指定する。

```jsonc
// NG
"mcpToolDescription": "dataverse-mcp-tools.json"
// OK
"mcpToolDescription": { "file": "dataverse-mcp-tools.json" }
```

## 13. `File '<x>' is invalid or not found in manifest package`（mcpToolDescription の中身）

ファイルが ZIP 内に確実にあっても出る。原因は**ファイル形式**。
`mcpToolDescription.file` が指すファイルは **JSON 形式の tools 定義**でなければ `invalid` 扱いになる
（`.md` のプレーン説明文は不可）。配置場所（ルート / skills 配下）は無関係。

正解フォーマット（`dataverse-mcp-tools.json`、ルートに配置し ZIP に含める）:
```json
{
  "tools": [
    { "name": "read_query", "description": "...", "annotations": { "readOnlyHint": true, "title": "Read Query" } },
    { "name": "search_data", "description": "...", "annotations": { "readOnlyHint": true, "title": "Search Data" } }
  ]
}
```

> 補足: エラーバーを閉じずに同じファイルを再選択しても再検証されない。
> エラーバー（`Close message bar`）を閉じ、ファイル入力をクリアしてから選び直す。

## 14. Cowork でコネクタ認証が失敗する（SSO 方式は Dataverse で使えない）

**症状**: アップロード・公開は成功し Cowork にプラグインが表示されるが、コネクタ接続で
赤い「！」が出て「再試行」になる。スキルを実行してもデータ取得に至らない。

**原因**: Dataverse MCP は Microsoft ファーストパーティ API で、受け取るトークンの
**audience（aud）が Dataverse 自身**（`https://<org>.crm.dynamics.com`）であることを要求する。
一方 **Entra SSO 方式**（Teams ポータルの「Microsoft Entra SSO client ID registration」）は、
Enterprise Token Store が **自前アプリ（`api://<appId>`）宛て**のトークンを発行する。audience が
Dataverse ではないため Dataverse 側が拒否し、認証が通らない（自前で OBO 交換でもしない限り不可）。

**対処**: **OAuth 2.0 認可コードフロー**に切り替える（→ SKILL.md Step 2〜3）。
- Teams ポータルでは **SSO client registration ではなく「OAuth client registration」**を使う。
- Entra アプリに**クライアントシークレット**を作成し `.env` に保存（Git 非コミット）。
- Scope に `https://<org>.crm.dynamics.com/user_impersonation` を指定 → Enterprise Token Store が
  **Dataverse 宛トークンを直接取得**するので audience が一致して通る。
- OAuth 方式では `Expose an API`・`preAuthorizedApplications`・`identifierUris` は不要。
- referenceId は発行された **registration ID をそのまま**使う（`Base64("tenant##regId")` 変換は SSO 専用）。

> 見分け方: コネクタの「！」にカーソルを合わせ、`AADSTS500011`（リソース未登録）や
> `invalid audience` 系のメッセージが出ていれば audience 不一致 = SSO 方式が原因。


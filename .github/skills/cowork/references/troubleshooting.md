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

## 15. ツール名変更で `dataverse-mcp-tools.json` が古くなる

**症状**: 以前は動いていたスキルが「該当ツールが見つからない」ように振る舞う、または一部の操作だけ
反応しない。エラーメッセージが出ないこともある。

**原因**: Dataverse MCP サーバー側のツール名が変更されている。`describe_table` / `list_tables` / `fetch` は
廃止され `describe` に統合済み。データ検索用の旧 `search` は `search_data` に改称され、現在の `search` は
メタデータ（テーブル/スキル/アプリ）検索専用に変わった。`dataverse-mcp-tools.json` に廃止・旧名のまま
ツールを列挙していると、Cowork 側がそのツールを認識できず該当機能が動かない。

**対処**:
1. [standard/references/dataverse-mcp-setup.md](../standard/references/dataverse-mcp-setup.md#主な-mcpツール) で
   現在の正しいツール名一覧を確認する。
2. `dataverse-mcp-tools.json` を最新のツール名に更新する（廃止済みツール名は削除）。
3. パッケージを再ビルド・再アップロードする（Step 7 と同じ手順）。
4. MCP クライアントの許可/拒否リストをツール名で管理している場合は、そちらも合わせて更新する。
- Scope に `https://<org>.crm.dynamics.com/user_impersonation` を指定 → Enterprise Token Store が
  **Dataverse 宛トークンを直接取得**するので audience が一致して通る。
- OAuth 方式では `Expose an API`・`preAuthorizedApplications`・`identifierUris` は不要。
- referenceId は発行された **registration ID をそのまま**使う（`Base64("tenant##regId")` 変換は SSO 専用）。

> 見分け方: コネクタの「！」にカーソルを合わせ、`AADSTS500011`（リソース未登録）や
> `invalid audience` 系のメッセージが出ていれば audience 不一致 = SSO 方式が原因。

## 15. .env の値を引用符付きで読み込むと referenceId が壊れる

`.env` に `COWORK_OAUTH_REGISTRATION_ID='xxxx'` のように引用符付きで保存していると、
単純な正規表現置換（`$Matches[1]`）では**引用符を含んだ文字列**が manifest.json に注入される。
`referenceId` の値が `'xxxx'`（前後にクォート付き）のまま登録され、アップロード自体は成功するが
Cowork 初回同意時にコネクタ認証が失敗する（症状が出るのがかなり後工程のため気づきにくい）。

対処: ビルドスクリプトで **`.Trim("'", '"')` を必ず適用**してから注入する
（→ [scripts/build_agent_package.ps1](../scripts/build_agent_package.ps1) は対応済み）。
ビルド後は zip を展開して `referenceId` の値にクォートが含まれていないか目視確認するとよい。

## 16. Teams 開発者ポータルの Scope フィールドはカンマ区切り

OAuth client registration の Scope 入力欄は UI のヘルプ文言が
「Enter each resource, separated by a comma.」＝**カンマ区切り**を要求する。
`https://<org>.crm.dynamics.com/.default offline_access`（スペース区切り）ではなく
`https://<org>.crm.dynamics.com/.default,offline_access`（カンマ区切り）で入力する。

## 17. Choose file ボタンはブラウザ自動化では OS ネイティブのファイル選択ダイアログを開く

M365 管理センターの Upload agent ウィザードの「Choose file」ボタンをクリックしても、
ブラウザ操作ツールの `click` だけではファイルを選択できない（OS ダイアログは DOM 外）。
**VS Code 統合ブラウザツールの `handle_dialog`**（`selectFiles` にローカル `.zip` の絶対パスを渡す）を使う。
ボタンクリック後に file chooser ダイアログが発生するので、それを待ってから
`handle_dialog` でパスを渡す実装にする（Playwright を別途インストールする必要はない）。

## 18. Fluent UI の ChoiceGroup（ラジオボタン）を直接クリックするとタイムアウトする

管理センター/開発者ポータルの一部フォーム（Publish to users の Install セクション等）では、
`<input type="radio">` を直接クリックすると、ラベルの `<label>` 要素が pointer-events を奪っていて
`locator.click: Timeout exceeded` になることがある。
`input[id=...]` ではなく **対応する `label[for=<id>]` をクリック**すると成功する。

## 19. admin.cloud.microsoft への遷移で SSO 自動サインインが不安定

Teams 開発者ポータルから M365 管理センターへ遷移する際、自動 SSO サインインが
「Trying to sign you in」でスピナーのまま止まることがある。数秒待っても進まない場合は
アカウント選択画面が裏で待機していることが多いので、アカウントピッカーの表示を確認し、
サインイン済みアカウントを明示的にクリックすると解消する。

## 20. Cowork セッションワークスペースが DLP でブロックされる（EU National ID / TIN 等）

**症状**: Cowork セッション中に作成・共有されたファイル（SharePoint Embedded 上の
`.../contentstorage/CSP_<containerTypeId>/Document Library/cowork/sessions/<sessionId>/workspace`）
を開こうとすると、次のようなメールおよびアクセス拒否が発生する。

> This item is protected by a policy in your organization. Access to this item is blocked
> for everyone except its owner, last modifier, and the site owner.
> Item contains the following sensitive information: EU National Identification Number,
> EU Tax Identification Number (TIN)

**原因**: Cowork のセッションワークスペースは実体として **SharePoint Embedded コンテナ**（通常の
SharePoint サイトと同様に Purview DLP の対象）に保存される。一方、Microsoft Purview の
「Cowork（AI との対話）」向け DLP サポートは現時点で公式に未対応（後述）だが、**その裏で使われている
SharePoint Embedded ストレージ自体は既存のテナント DLP ポリシーの対象から除外されない**。
既定で有効な **`General Data Protection Regulation (GDPR)` テンプレートポリシー**（ルール:
`High volume of EU Sensitive content found` / `Low volume of EU Sensitive content found`。
場所: Exchange メール・**SharePoint サイト（すべて）**・OneDrive アカウント）が、生成された
セッションワークスペース内のファイルに EU 系 SIT（National ID・TIN 等）を検出し、アクセス制限
（オーナー・最終更新者・サイト所有者以外をブロック）を適用する。

**診断方法**（読み取り専用、実際に有効な手順）:

1. まず切り分けとして、共有 URL に対する driveItem 解決を試す
   （[scripts/diagnose_dlp_block.py](../scripts/diagnose_dlp_block.py)）。
   ```powershell
   python .github/skills/cowork/scripts/diagnose_dlp_block.py --url "<ブロックされた共有URL>"
   ```
   `403 accessDenied`（権限不足の定型メッセージではない場合の拒否）が返れば DLP ブロックが実際に有効。
2. [Microsoft Purview ポータル](https://purview.microsoft.com/datalossprevention/policies) →
   左ナビ「データ損失防止」→「ポリシー」を開く（**VS Code 統合ブラウザツール**で操作。サインインは
   ユーザー自身に行ってもらう）。
3. 一覧から該当ポリシー（既定なら `General Data Protection Regulation (GDPR)`）を開く。
   「ルール」→「場所」→「モード」を確認する。「場所」に **SharePoint サイト（すべて）** が含まれていれば
   Cowork の SharePoint Embedded コンテナも対象になる。
4. 参考: 以下の **試したが実際には機能しなかった経路**（同じ調査を繰り返さないための記録）。
   - Microsoft Graph API `security/dataLossPreventionPolicies`（v1.0 / beta 両方）は
     **`400 Resource not found for the segment`** となり、このテナントには存在しない
     （Web 上に見つかる同名エンドポイントの例は不正確 or ごく限定的なプレビュー、GA API ではない）。
   - Microsoft Graph API `security/alerts_v2` は Purview DLP のアラートも集約する仕様だが、
     `auth_helper.py` 等の汎用資格情報には通常 `SecurityAlert.Read.All` 等のセキュリティ系スコープが
     付与されておらず **`403 Forbidden`** になりやすい。
   - → 結論: **DLP ポリシーの診断・変更は Graph API では完結せず、Purview ポータルでの直接確認が必要**。

**対処の選択肢**（テナント全体に影響するため、実施前にユーザーへ選択を仰ぐ）:

1. **Cowork のコンテナのみを対象から除外**（最も影響範囲が小さい・推奨） — ポリシーの「場所」の
   SharePoint サイトの詳細設定で、対象の SharePoint Embedded コンテナ（`CSP_<containerTypeId>`）を
   除外リストに追加する。
2. **ルールを無効化 / アクションを緩和**: 「ポリシーの編集」ウィザード→「詳細な DLP ルール」ステップで
   該当ルール（`High volume of EU Sensitive content found` / `Low volume EU Sensitive content found`）の
   状態トグルを **オフ**にする（最も簡単）、または各ルールの「編集」→「処理」セクションで
   「Microsoft 365 の場所にあるコンテンツへのアクセスを制限する」アクションを削除して監査のみにする。
   **テナント全体に影響する**ため慎重に判断する。
   - ウィザードの「詳細な DLP ルール」ステップ遷移時、バックエンド API
     （`CategoryTrainingModel/ModelMetadata`）が断続的に `500` を返し、「クライアント エラー」ダイアログが
     多重に積み重なって操作をブロックすることがある。都度 OK で閉じて再試行する（既知の不安定）。
     ポリシー自体の設定とは無関係。ダイアログが不安定でクリックが安定しない場合は、
     ルール一覧の**状態トグルをオフにするだけ**の方が操作がシンプルで確実。
3. **現状維持**: 検証用データで GDPR SIT が検出されるのは意図した動作であり、対処不要と判断する。



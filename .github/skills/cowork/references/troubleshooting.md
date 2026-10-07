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
> Dataverse 側で同様の問題が出た際は hosts に IP を固定して回避した（例: `<解決済み IP> <org>.crm.dynamics.com`）。
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
- referenceId は OAuth 方式でも `Base64("tenant##regId")` 変換が**必要**（→ #23。旧版のこの節では
  「SSO 専用」と誤記していたが、実機検証で OAuth でも同形式が必須と判明した）。

> 見分け方: コネクタの「！」にカーソルを合わせ、`AADSTS500011`（リソース未登録）や
> `invalid audience` 系のメッセージが出ていれば audience 不一致 = SSO 方式が原因。

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

> **書き忘れに注意**: `dataverse-mcp-tools.json` は列挙したツールしか Cowork 側に認識されない。
> 読み取り専用ツール（`read_query`/`search_data`/`search`/`describe`）だけを載せたテンプレートのまま、
> 書き込みが必要なスキル（`create_record`/`update_record`/`upsert_skill` 等）を追加した場合、
> 読み取りは動くのに書き込みだけ「反応しない」という一見原因不明の部分故障になる。
> スキルが実際に呼ぶツール名をすべて含めているか、Step 6 のテンプレートと突き合わせて確認する。

## 16. .env の値を引用符付きで読み込むと referenceId が壊れる

`.env` に `COWORK_OAUTH_REGISTRATION_ID='xxxx'` のように引用符付きで保存していると、
単純な正規表現置換（`$Matches[1]`）では**引用符を含んだ文字列**が manifest.json に注入される。
`referenceId` の値が `'xxxx'`（前後にクォート付き）のまま登録され、アップロード自体は成功するが
Cowork 初回同意時にコネクタ認証が失敗する（症状が出るのがかなり後工程のため気づきにくい）。

対処: ビルドスクリプトで **`.Trim("'", '"')` を必ず適用**してから注入する
（→ [scripts/build_agent_package.ps1](../scripts/build_agent_package.ps1) は対応済み）。
ビルド後は zip を展開して `referenceId` の値にクォートが含まれていないか目視確認するとよい。

## 17. Teams 開発者ポータルの Scope フィールドはカンマ区切り

OAuth client registration の Scope 入力欄は UI のヘルプ文言が
「Enter each resource, separated by a comma.」＝**カンマ区切り**を要求する。
`https://<org>.crm.dynamics.com/.default offline_access`（スペース区切り）ではなく
`https://<org>.crm.dynamics.com/.default,offline_access`（カンマ区切り）で入力する。

## 18. Choose file ボタンはブラウザ自動化では OS ネイティブのファイル選択ダイアログを開く

M365 管理センターの Upload agent ウィザードの「Choose file」ボタンをクリックしても、
ブラウザ操作ツールの `click` だけではファイルを選択できない（OS ダイアログは DOM 外）。
**VS Code 統合 Playwright ブラウザの `playwright-browser_handle_dialog`**（`paths` にローカル `.zip` の絶対パスを渡す）を使う。
ボタンクリック後に file chooser ダイアログが発生するので、それを待ってから
`playwright-browser_handle_dialog` でパスを渡す実装にする（Playwright MCP サーバーを別途インストールする必要はない）。

## 19. Fluent UI の ChoiceGroup（ラジオボタン）を直接クリックするとタイムアウトする

管理センター/開発者ポータルの一部フォーム（Publish to users の Install セクション等）では、
`<input type="radio">` を直接クリックすると、ラベルの `<label>` 要素が pointer-events を奪っていて
`locator.click: Timeout exceeded` になることがある。
`input[id=...]` ではなく **対応する `label[for=<id>]` をクリック**すると成功する。

## 20. admin.cloud.microsoft への遷移で SSO 自動サインインが不安定

Teams 開発者ポータルから M365 管理センターへ遷移する際、自動 SSO サインインが
「Trying to sign you in」でスピナーのまま止まることがある。数秒待っても進まない場合は
アカウント選択画面が裏で待機していることが多いので、アカウントピッカーの表示を確認し、
サインイン済みアカウントを明示的にクリックすると解消する。

## 21. Cowork セッションワークスペースが DLP でブロックされる（EU National ID / TIN 等）

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
   ユーザー自身に行ってもらう）。起動前に
   [ブラウザ自動化方針](../../standard/references/browser-automation.md)を適用する。
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

## 22. テナント管理者の事前同意（admin consent）未実施 → Cowork 初回同意がサイレントに失敗する

**症状**: manifest のアップロード・公開は成功し、Cowork の Sources & Skills にプラグインも
表示される。だが実際にスキルを実行すると Dataverse MCP コネクタ経由の操作（`read_query` 等）が
一切完了しない。コネクタの状態アイコンにはっきりしたエラーが出ないことが多く、「同意ダイアログが
一瞬出て消える」「何も起きたように見えない」だけで再現手順も分かりにくい。トラブルシュート #14 の
SSO/OAuth 方式の切り分け（audience 不一致）を確認しても異常が見つからない場合はこちらを疑う。

**原因**: Step 3 で作成した Entra アプリの Dynamics CRM 委任スコープ `mcp.tools` は、既定では
**ユーザーが個別に同意する（user consent）**扱いになる。テナントの同意設定が
「ユーザーはアプリへの同意ができない」（Enterprise ガバナンスで一般的な設定）になっていると、
Cowork 初回利用時に Enterprise Token Store が試みる同意フローがブロックされる。ブロックは
バックエンドで起きるため、Cowork の UI 上はエラーメッセージなしで「コネクタが反応しない」ように
しか見えない。**テナント管理者による事前の管理者同意（admin consent）**が必要。

**診断方法**:

```powershell
# レイヤー1（アプリ登録）/ レイヤー2（admin consent）/ レイヤー3（allowedmcpclients）を一括診断
python .github/skills/cowork/scripts/diagnose_cowork_connector.py
```

レイヤー2（テナント管理者の事前同意）が ❌/❓ の場合が本事象の典型パターン。

**対処**:

1. [scripts/setup_entra_oauth_graph.py](../scripts/setup_entra_oauth_graph.py) を実行すると
   admin consent の状態を自動確認し、未完了なら次の形式の URL を表示する。
   ```
   https://login.microsoftonline.com/<TENANT_ID>/adminconsent?client_id=<COWORK_OAUTH_CLIENT_ID>
   ```
2. この URL に **Global Administrator（または Privileged Role Administrator）権限を持つテナント管理者**
   がアクセスし、表示された権限（Dynamics CRM の `mcp.tools`）に同意する。
3. 同意完了後、`diagnose_cowork_connector.py` を再実行し、レイヤー2 が ✅ になることを確認する。
4. Cowork でスキルを再実行し、初回同意ダイアログが正常に完了することを確認する。

> 開発者自身がテナント管理者を兼ねる場合は、Step 3 の直後に `setup_entra_oauth_graph.py` が表示する
> URL に自分でアクセスするだけで完了する（追加のポータル操作は不要）。

## 23. OAuth 方式でも referenceId は `Base64("tenant##regId")` 変換が必要（旧記載は誤り）

**旧版の本ドキュメントおよび SKILL.md Step 5 の記載**: 「OAuth 方式では発行された registration ID を
そのまま `referenceId` に使う（`Base64("<tenantId>##<regId>")` 変換は SSO 専用）」。

**この記載は誤り**。実際にテナント上で HR サンプルスキル（`hr-employee-directory`）を使い、
`read_query`（検索・取得）と `create_record`（新規登録）の両方を Cowork から実行して検証したところ、
**生の registration ID をそのまま `referenceId` に設定した場合はコネクタ認証が通らず**、
`Base64("<tenantId>##<registrationId>")`（SSO 方式と同一のエンコード）に変換して初めて
Dataverse MCP コネクタが正常に動作した（`describe` → `read_query` → `create_record` まで
すべて成功、Dataverse 側にレコード作成まで確認済み）。

**対処**: [scripts/build_agent_package.ps1](../scripts/build_agent_package.ps1) を改修し、
`.env` の `TENANT_ID` と `COWORK_OAUTH_REGISTRATION_ID`（**生の値**）から
`Base64("<tenantId>##<registrationId>")` を自動計算して manifest に注入するようにした
（手動での Base64 変換は不要。`.env` には生の registration ID を保存するだけでよい）。
既にビルド済みの zip がある場合は、`.env` の値を変更せずに `build_agent_package.ps1` を
再実行すれば自動的に正しい形式に修正される。

## 24. python-dotenv の `set_key()` は既定でクォート付き書き込みになる（troubleshooting #16 の根本原因）

troubleshooting #16 では `.env` に `referenceId` がクォート付き（`'xxxx'`）で保存され
manifest 注入が壊れる症状とその**下流での**対処（`.Trim("'", '"')`）を記載したが、
**根本原因**は [scripts/setup_entra_oauth_graph.py](../scripts/setup_entra_oauth_graph.py) が
`.env` 書き込みに使う `python-dotenv` の `set_key()` 関数の**既定値** `quote_mode="always"` に
あった。この既定値だと、値が引用符を必要としない単純な文字列（GUID・シークレット等）でも
常にクォートで囲んで書き込まれる。`dotenv` 経由で読む分には自動でクォートが除去されるため
気づきにくいが、PowerShell の正規表現 `-match` のような**非 dotenv 経路**で `.env` を読む
後続ツール（`build_agent_package.ps1` 等）ではクォート文字がそのまま値に混入する。

**対処**: `setup_entra_oauth_graph.py` の `set_key()` 呼び出し（`COWORK_OAUTH_CLIENT_ID` /
`COWORK_OAUTH_CLIENT_SECRET`）に明示的に `quote_mode="never"` を指定し、書き込み時点で
クォートが付与されないようにした。#16 の `build_agent_package.ps1` 側の `.Trim("'", '"')` は
防御的多層防御として残しているが、本来はこちらが根本対処であり、`.env` へ機微情報を書き込む
他スクリプト（`standard` スキル配下含む）で `set_key()` を使う場合も同様に
`quote_mode="never"` を指定することを推奨する。

## 25. Developer Portal private API の Device Code 認証が `AADSTS7000218` になる

**症状**: Developer Portal が使用する client ID と `AppDefinitions.ReadWrite` scope を指定しても、
Device Code flow で `client_assertion` または `client_secret` が必要という `AADSTS7000218` が返る。

**原因**: Portal の client はブラウザ内の認証方式を前提とし、汎用 CLI の Device Code flow を
public client として許可していない。scope や auth cache の不具合ではない。

**対処**: token、Cookie、client secret を CLI へ取り出さない。`manage_oauth_registration_api.py` で
payload と `PLAN_HASH` を検証し、`READY_FOR_BROWSER_API` になった plan だけをログイン済み VS Code
統合ブラウザの同一 session から OAuth CRUD API へ送信する。GET で読み戻して一致を確認する。
401/403/404 または schema 不一致の場合だけ、Developer Portal のフォーム操作へ切り替える。

## 26. Graph の組織カタログ作成が成功応答を返すのに実体が残らない

**症状**: `manage_agent_package_graph.py deploy --apply` が `APPLIED` と Teams app id を返すが、
`GET /appCatalogs/teamsApps/{id}` は 404、`list`（`distributionMethod eq 'organization'`）にも
Agent Registry（管理センター）にも表示されない。1 時間待っても変わらない。

**原因**: `agentSkills` / `agentConnectors`（Cowork プラグイン）を含むパッケージは、Graph の受付後に
バックエンド側で取り込まれず破棄されることがある（エラーは返らない）。

**対処**: 作成後 5 分以内に `list` と Registry 検索で読み戻す。どちらにも無ければ、**同じ ZIP**を
SKILL.md Step 8 の管理センター private API（`stageCustomApp` → finalize → allow → deploy）で登録する。
新規の Cowork プラグインは最初から private API で登録するのが正常系。
ウィザード内の `input[type=file]` へ `setInputFiles()` で ZIP を渡すと OS ダイアログなしで検証まで進む。
同じ manifest ID で Graph の残骸は残らないため、重複登録にはならない。

## 27. 統合ブラウザの非表示タブで click / request event が機能しない

**症状**: 管理センターで `click` が `waiting for element to be visible, enabled and stable` でタイムアウトする。
`page.waitForRequest` + `reload` でセッションヘッダーを取ろうとしても request event が届かない。

**原因**: VS Code 統合ブラウザのタブが前面にないと描画フレームが進まず、Playwright の安定判定が完了しない。
また SPA はキャッシュ済みデータで描画し、reload しても `/fd/addins/api/` を呼ばないことがある。

**対処**:

- クリックは `locator.evaluate(el => el.click())`（DOM クリック）で行う。入力は `fill` / `type` で問題ない。
- セッションヘッダーは admin の `m365_portal_browser_runner.mjs` の `captureSessionHeaders()` が
  reload 失敗時にページ内の fetch / XHR をフックし、`#/agents/overview` ⇔ 元のルートの遷移で発生する API 呼び出しから取得する。
  値はブラウザ/Node のメモリ内だけで扱い、出力しない。
- 在庫 API `/fd/addins/api/agents` の並び替えキーは `sortBy=LastUpdatedDate&sortOrder=Desc`
  （`lastModified` 等は 0 件または 400）。`name` 昇順/降順も可。

## 28. Cowork で Connect を自動クリックしても OAuth 画面が開かない

**症状**: Customize → Plugins でプラグインのトグルを ON にすると **Connect** ボタンになるが、
ブラウザ自動化でクリックしても何も起きない（ポップアップが開かない）。

**原因**: OAuth 同意はポップアップで開き、ユーザー操作起点でないクリックはポップアップブロックの対象になる。

**対処**: Connect は**ユーザー自身がクリック**してサインイン・同意する。同意後、Cowork でトリガー語を入力して
`describe` → `read_query` が実行されることを確認する。

## 29. `create_record` が Lookup 指定で失敗し、何度も承認を求められる

**症状**: 書き込みの承認後に `Couldn't complete 'Create_record'` が続き、形式を変えながら再試行するたびに
承認ダイアログが出る。実測で返ったエラーは次のとおり。

| 渡した形式 | エラー |
|---|---|
| `"<lookup>@odata.bind": "/<entityset>(<GUID>)"` | 列 `<lookup>@odata.bind` が存在しない |
| `"<lookup>": "<GUID>"` | Lookup の値を JSON として読めない |
| `"<lookup>": "{\"logicalName\":...,\"id\":...}"` | `relatedTable` が必須 |
| `"<lookup>": "{\"relatedTable\":...,\"id\":...}"` | 有効な `recordId` が必須 |
| `update_record` で `id` を指定 | `id` は認識されない |

**原因**: Dataverse MCP の書き込みツールは Web API の `@odata.bind` を受け付けない。スキルが Web API の書式を指示していると
モデルが試行錯誤し、失敗のたびに承認が発生する。

**対処**: スキル本文と `dataverse-mcp-tools.json` に正しい形式を書く。

```json
{
  "tablename": "<prefix>_crmactivity",
  "item": {
    "<prefix>_name": "...",
    "<prefix>_opportunityid": "{\"relatedTable\":\"<prefix>_crmopportunity\",\"recordId\":\"<GUID>\"}",
    "<prefix>_accountid": "{\"relatedTable\":\"account\",\"recordId\":\"<GUID>\"}"
  }
}
```

`update_record` は `tablename` / `recordId` / `item`。承認ダイアログでは `item` の内容を確認してから Approve する
（形式違いの再試行が連続する場合は Cancel してスキルを直す）。

## 30. 更新版のアップロードが「already been deployed」で拒否される

**症状**: 同じ manifest `id` で `version` を上げた zip を、Agents → All agents → **Add agent** または
Agents → Tools → **Upload** でアップロードすると、検証時に
「The agent you are uploading has already been deployed.」/「The tool you're uploading has already been deployed.」
で止まり Next に進めない。

**原因**: 管理センターのアップロードウィザードは新規登録専用。ウィザードで登録したプラグインは
Graph の `appCatalogs/teamsApps` にも現れないため、`appDefinitions` による更新も使えない。

**対処**:

- Graph で登録・読み戻しできたプラグインは `manage_agent_package_graph.py deploy` で更新できる。
- ウィザードで登録したプラグインは、private API の `uploadCustomApp`（`ActionType=UPDATEAPP`, `ProductId=<titleId>`）→
  `agent-update-app`（`POST /fd/addins/api/apps`, `Command=UPDATEAPP`）で更新できる（SKILL.md Step 10）。
  公開対象と利用者の Connect は維持される。使えない場合だけ Tools → Plugins で **Uninstall** → **Tools → Upload** で登録し直す。
- Cowork プラグインは All agents（Registry）の一覧・検索には出ない。在庫の確認は Tools → Plugins で行う。

## 31. 事前インストール（DEPLOY）が `OperationId is null or empty` で Failed になる

**症状**: 新規登録で finalize（`FINALIZEPACKAGE`）と allow（`ALLOW`）は `Success` なのに、`POST /fd/addins/api/apps` の
`DEPLOY` だけ `deploymentRequestStatus` が `Failed`。`errorReason` は
`Invalid Argument OperationId is null or empty and status code = BadRequest`。

**原因**: 管理センターのウィザードが送る DEPLOY の workload には `MosOperationId` が含まれない（成功応答は返るが
非同期処理で失敗する）。同じ body をそのまま再送すると同じ理由で失敗する。

**対処**: `build_cowork_publish_payloads.py` が生成する `3-deploy.json` は、ステージで得た `MosOperationId` を workload に含める。
送信後は必ず `appsManagementStatus[].status` を poll し、HTTP 200 だけで完了としない。

## 32. 管理センターの request を `page.route()` で捕捉・中断できない

**症状**: private API の観測のため `page.route('**/fd/addins/api/**', ...)` で write request を abort しようとしても、
ハンドラが呼ばれずに request がそのまま送信される（ウィザードが実際に登録まで完了する）。

**原因**: VS Code 統合ブラウザでは管理センターの fetch / XHR が Playwright の route / request event に届かないことがある。

**対処**: 観測はページ内で `window.fetch` / `XMLHttpRequest.prototype.open/send` をフックして method / path / body の
キー名を記録する（ヘッダー値・トークンは記録しない）。**write を止める手段にはならない**ため、観測は
使い捨ての検証用プラグイン（別 manifest ID・公開対象は検証ユーザーだけ）で行う。

## 33. 検証用プラグインを削除できない

**症状**: Agents → Tools → Plugins の詳細パネルには **Uninstall** と **Block** しかなく、削除操作がない。

**対処**: 検証が終わったプラグインは **Uninstall**（利用者から外す）→ **Block**（再インストールを止める）で片付ける。
名前に「Test」等を含めて本番プラグインと区別し、操作前に詳細パネルの名前が対象と一致することを確認する。



## 34. OAuth registration を作るのにブラウザが要る（統合ブラウザが使えない）

- 症状: 統合ブラウザのツールが使えない環境では、Developer Portal の session から API を送れない。
  `auth_helper` の既定（Azure CLI 互換）クライアントのトークンは出るが 401 / 403、PAC CLI は `AADSTS65002`、
  Graph PowerShell は `AADSTS650057`、専用 portal client は `AADSTS7000218`。
- 対処（恒久対策済み）: `manage_oauth_registration_api.py` の既定 `--transport cli` が Agents Toolkit の公開クライアント
  （`7ea7c24c-…`、Device Code。初回だけサインイン）で `https://dev.teams.microsoft.com/api/v1.0/oauthConfigurations` を呼ぶ。
  `AUTH_MODE=interactive` は `AADSTS70007` になるので Device Code のまま使う。
- 個人テストも同じクライアントで `install_agent_package_personal.py`（Title サービス）から行える。

## 35. API の `oAuthConfigId` を `.env` にそのまま入れると、ビルドで警告が出る

- 症状: `build_agent_package.ps1` が「エンコード済みの値でした」と警告する。
- 原因: API は `oAuthConfigId` を `Base64("<tenantId>##<registrationId>")` で返す。画面の「OAuth client registration ID」は生の GUID。
- 対処（恒久対策済み）: `manage_oauth_registration_api.py --write-env` が生の registration ID に戻して保存する。
  ビルドは生の ID から referenceId を作る（二重エンコードしない）。

## 36. 個人インストールを外したあと、launchInfo が 404 ではなく 403 を返す

- 症状: `DELETE /catalog/v1/users/acquisitions/{titleId}` の後、`launchInfo` が `403 Forbidden`「title is not acquired」。
- 対処（恒久対策済み）: `install_agent_package_personal.py` は 404 と「not acquired」の 403 を「インストールされていない」として扱う。
  入れ直すと titleId は新しく払い出される。

## 37. スクリプトが `--client-id` 必須などで止まる（.env に値はある）

- 症状: `manage_oauth_registration_api.py create` が「the following arguments are required: --client-id」で終わる。
- 原因: スクリプトは `.env` を自分では読まず、`COWORK_OAUTH_CLIENT_ID` / `COWORK_OAUTH_CLIENT_SECRET` を環境変数から読む。
- 対処: 実行前に `.env` の `COWORK_*` / `TENANT_ID` / `DATAVERSE_URL` をシェルの環境変数へ読み込む。秘密の値は画面に出さない。

  ```powershell
  Get-Content .env | ? { $_ -match '^(COWORK_|TENANT_ID|DATAVERSE_URL)' } | % { $k, $v = $_.Split('=', 2); Set-Item "env:$k" $v.Trim().Trim("'", '"') }
  ```

## 38. 公開前に、プラグインのスキルが実データで意図どおり動くか確かめたい（Cowork の画面を使わずに）

- 対処: `rehearse_plugin.py` で、プラグインの SKILL.md（指示）と `dataverse-mcp-tools.json`（使えるツール）を、実際の Dataverse MCP と
  Azure OpenAI で通しで動かす。`setup-client` で専用の公開クライアントを作り（Cowork 本体のアプリとは別）、`tools` でツール名の差を、
  `run` で依頼 → 提示 → 利用者の返事（`--reply`）→ 登録を確かめる。既定は書き込みを送らない。会話とツール呼び出しは `--transcript` に残る。
- Azure CLI 互換・PAC CLI のクライアントは allowedmcpclients に無いため MCP が 403 になる。リハーサル専用のクライアントを登録する。
- 実際にこの方法で次の #39〜#44 を見つけた（実データ・1 回の実行で再現）。

## 39. `search_data` / `search` が 0 件で、スキルが「根拠が無い」と判断して止まる

- 原因: Dataverse 検索の対象になっていないテーブルでは、データがあっても 0 件になる。AI は存在しない検索範囲名を推測することもある。
- 対処: スキル本文で、キーワード検索は `read_query` の `LIKE` を使うと明示し、SQL 例を載せる。「0 件でも無いと判断しない」と書く。

## 40. 承認済みのレコードを Cowork から直接更新しようとする

- 症状: 「既存の言い換えに追加」を提案し、利用者の「登録して」で承認済みの行に `update_record` を送る。アプリの承認を経ずに本番の検索が変わる。
- 対処: スキルの必須ルールに「承認済みの行は変更しない。`update_record` はこのスキルで作った下書きだけ」と書き、既存への追加は提案として報告させる。

## 41. 分類などの値が既存と揺れる（「人的資本」と「人的資本・人材」）

- 対処: 先に既存の値を取得し、その一覧から選ばせる。`read_query` は `DISTINCT` でエラーになるため `GROUP BY` を使う。

## 42. 承認された複数件のうち 1 件だけ登録して終わる

- 対処: 「承認された行はすべて 1 件ずつ最後まで登録する」「読み戻した件数が承認件数と一致するか確かめ、足りなければ残りを登録する」をスキルに書く。

## 43. 列名の略記（`_category`）をそのままクエリに使ってエラーになる / `OR` と `AND` の優先順位で無関係な行が混ざる

- 対処: スキルの表は正式な列名で書き、本文の略記は「`<prefix>_xxx` の略」と明示する。`OR` と `AND` を混ぜる SQL 例は括弧を付けて載せる。

## 44. 生成した JSON の文字列（台本の行など）が崩れて保存される / 提示していない内容を登録する

- 症状: 配列の後ろに余分な文字が付き、アプリが読めない。最初の応答で台本を見せずに質問を返し、利用者の「登録して」でそのまま登録した。
- 対処: スキルに「JSON 配列 1 つだけ（`[` で始まり `]` で終わる）」「登録後に読み戻して形を確かめ、崩れていれば下書きを直す」
  「提示していない内容は登録しない」を書く。読む側（アプリ）も、配列の後ろの余分な文字や 1 行 1 オブジェクトの形式を読めるようにしておく。

## 45. `read_query` が 20 行しか返さず、全件を点検したつもりになる

- 原因: `top` を省くと 20 行まで。長い結果を途中で切って AI に渡すと、同じく件数を誤る（リハーサルの仕組み側で実際に起きた）。
- 対処: スキルに「先に `COUNT` で件数を確かめ、`top` に件数以上を指定する」と書く。`rehearse_plugin.py` は結果を切ったときに明示する。
- 補足（実測）: 上限 20 行がかかるのは **`top` 引数を省いたとき**と **SQL の `TOP n`（21 以上はエラー）**。`read_query` の **`top` 引数**（ツールの引数。SQL ではない）に件数を渡すと 20 行を超えて返る
  （実測: `top`=50 / 1,000 / 5,000 で 50 / 1,000 / 全 4,275 行。SQL の `TOP 20` と `top`=50 を併用すると小さい方の 20 行）。
  `OFFSET … FETCH` は**エラーにならず無視され、先頭 20 行がまた返る**（ページングしたつもりで同じ行を読む）。
  スキルには「先に `COUNT` → SQL に `TOP` を書かず `top` 引数に件数以上 → 返った行数を照合 → 足りなければ `WHERE <キー> > '<最後のキー>' ORDER BY <キー>` で続きを読む」を書く。
  キー範囲を決め打ちで分ける書き方は、件数が変わると黙って取りこぼすので使わない。
  引数名は `querytext` と `top`（`describe` は `path`。例 `tables/<prefix>_<table>`）。スキルの SQL を実機で確かめるときは、`top` 引数なしでちょうど 20 行返ったクエリを「切れている可能性あり」として失敗にする。

## 46. Connect は成功しているのに、Cowork の実行時に Dataverse MCP のツールが 0 件になる

- 症状: Customize → Plugins でコネクタが「Disconnect」（接続済み）と表示され、Disconnect → Connect の再認証もできる。
  スキルは読み込まれるが、新しいタスクでも「Dataverse MCP のツールが利用できない」と返り、`describe` が一度も呼ばれない。
  アプリ登録・管理者同意・allowedmcpclients（`diagnose_cowork_connector.py`）、OAuth registration、
  サーバーの `tools/list`（`rehearse_plugin.py tools`）はすべて正常。
- 切り分け済みの非原因: `referenceId` の形式（#23）、OAuth registration の Scope・Base URL、ツール名の不一致（#15）、
  プラグインの無効化 → 有効化、接続トークンの再発行、**manifest の版（1.28 の固定ツール定義 → 1.29 の動的ツール検出でも同じ）**、
  プラグイン固有の設定（OAuth アプリ・登録が別の 2 つ目のプラグインでも同じ）。
- 決め手: **Entra のサインイン ログ**（`check_oauth_signins.py`）。Connect のたびに Cowork のトークン保管庫が
  このアプリで Dataverse 宛てのトークンを取得し、すべて成功（errorCode 0・条件付きアクセス notApplied）していた。
  認証は通っているのに、Cowork がそのコネクタのツールを会話に読み込んでいない＝Cowork 側の問題。
  Microsoft Q&A にも「`OAuthPluginVault` の接続は成功するが、ツール呼び出しにトークンが渡らない」報告がある（公式回答は未確認）。
- 対処:
  1. `check_oauth_signins.py` で判定する。失敗（AADSTS）があればテナント側を直す。記録が無ければ Connect と referenceId を確認する。
  2. すべて成功なら、プラグインやテナントの設定では直らない。会話 ID・トークン発行時刻・再現条件を添えて Microsoft サポートへ上げる。
  3. 業務を止めないため、**同じスキルを Copilot Studio のエージェントで動かす**（copilot-studio-v2 の
     [templates/agm-qa-author](../../copilot-studio-v2/templates/agm-qa-author/README.md)。本人の接続の Dataverse MCP で実データの登録まで確認済み）。
- 版の選び方: manifest 1.29 では `mcpToolDescription` が任意で、省略時は実行時に `tools/list` で取得する（`wiqd plugin create` も 1.29）。
  動的検出ではサーバーの全ツール（削除・テーブル変更を含む）が見えるため、スキルに「使うツール / 呼ばないツール」を明記し、
  利用者の Dataverse ロールで書き込み・削除を絞る。
- 恒久対策済み: `build_agent_package.ps1` が manifest 1.28 で `mcpToolDescription` を省いたパッケージを止め、参照されたツール定義だけを同梱する。
  `rehearse_plugin.py tools` は動的検出なら「スキルが挙げたツールがサーバーにあるか」を確かめ、`run` は読み取り 5 ツール以外を書き込みとして止める。
  `check_oauth_signins.py` がトークン発行の成否から、テナント側か Cowork 側かを判定する。

## 47. OAuth registration を `get` すると 404 になり、削除されたと誤認する

- 症状: `manage_oauth_registration_api.py get --registration-id <.env の COWORK_OAUTH_REGISTRATION_ID>` が
  `404 NotFound`（`Could not retrieve OAuthConfigurationRegistration`）を返すが、`list` には同じ登録が出る。
- 原因: `.env` には**生の** registration ID（GUID）を保存するが、Developer Portal API のパスは
  `oAuthConfigId` = `Base64("<tenantId>##<registrationId>")` を要求する。生の GUID をそのまま渡すと 404 になる。
  404 を「登録が消えた」と読んで、`.env` の差し替えや再作成に進むと遠回りになる。
- 対処: 404 のときは `list` で clientId・Base URL が一致する登録の有無を先に確かめる。
- 恒久対策済み: `api_config_id()`（`manage_oauth_registration_api.py`）が `get` / `update` / `delete` で生の ID を自動で包む
  （既に包まれた値はそのまま）。テスト: `test_manage_oauth_registration_api.py`。

## 48. 自分だけにインストールしたプラグインが、管理センターの Tools → Plugins に出ない

- 症状: Cowork の Customize → Plugins にはあるが、管理センター Agents → Tools → Plugins で名前を検索しても 0 件。
  Cowork の詳細 URL の ID が `U_...` で始まる（組織に公開したものは `T_...`）。
- 原因: `install_agent_package_personal.py`（`atk install --scope Personal` 相当）で入れた個人インストールは、
  組織カタログ（管理センター）に登録されない。
- 対処: 版の更新は同じ manifest `id` のまま version を上げ、`install_agent_package_personal.py install` を再実行する
  （plan → hash 承認 → `--apply`。読み戻しの `titleId` が同じ `U_...` で version が上がったことを確認）。
  管理センターの更新経路（Step 10）は組織に公開したプラグインだけに使う。
- 確認: 更新後に Cowork の詳細の Version を読み戻し、新しいタスクで `describe` を呼ばせて実行時のツールまで確かめる。
  詳細画面の「Disconnect」（接続済み）表示は、実行時にツールが使えることの証明にはならない（#46）。

## 49. `check_mcp_client.py` が判定のあと `UnicodeEncodeError: 'cp932'` で落ちる

- 原因: 日本語 Windows の既定コンソールは cp932 で、結果表示の `✅` / `❌` を出力できない。判定自体は済んでいるが終了コード 1 になる。
- 恒久対策済み: `check_mcp_client.py`（standard スキル）が起動時に標準出力を UTF-8 に切り替える。

## 50. 「コネクタの競合 "dataverse-mcp" を指定できるプラグインは 1 つだけです」で、プラグインの MCP が無効になる

- 症状: 新しいプラグインを有効にすると、Cowork に「コネクタの競合」と、両方のプラグイン名・「<プラグイン> を無効にする」ボタンが出る。
  どちらかを無効にするまで、片方のプラグインのコネクタ（MCP）が使えない。
- 原因: Cowork は **同じ `agentConnectors[].id` を持つプラグインを 1 つしか有効にできない**。同梱テンプレート（AGM・Sales CRM・現場コックピット）と
  SKILL.md の例がすべて `dataverse-mcp` だったため、このテンプレートから作ったプラグイン同士が必ず衝突した
  （実測: 手元の 10 種類のプラグインがすべて `dataverse-mcp`）。接続先 URL が別環境でも、ID が同じなら衝突する。
- 対処: コネクタ ID をプラグイン固有にする（`<プラグインの kebab 名>-<データ源>-mcp`。例 `agm-qa-dataverse-mcp`）。`displayName` にもプラグイン名を入れる。
  version を上げて再ビルド → 再インストール（個人なら `install_agent_package_personal.py install`、組織なら Step 10）→ Cowork で Connect し直す。
- 調べ方: テナントのプラグインのコネクタ ID を一覧する API は無い（Graph の組織カタログは manifest を返さず、MOS の `launchInfo` は取得済みの title だけ）。
  手元の manifest を `check_connector_ids.py --scan <置き場所>` で突き合わせる。
- 恒久対策済み: `build_agent_package.ps1` が汎用 ID（`dataverse-mcp` など）・manifest 内の重複・64 文字超を止め、`COWORK_PLUGIN_SCAN_DIRS` があれば
  `check_connector_ids.py` で手元のほかのプラグインとの衝突も止める。同梱テンプレートの ID はプラグイン固有に変更し、
  `test_check_connector_ids.py` がテンプレートの ID が汎用 ID に戻っていないこと・テンプレート同士で重ならないことを検査する。

## 51. 日付で絞った `read_query` が 0 件になる・`2026-10-30T09:00:00` のように返る

- 症状: `WHERE <prefix>_date = '2026-10-30'` が 0 件。`>= '2026-10-23' AND <= '2026-10-29'` の集計から最終日が抜ける（合計が合わない）。
  値は `2026-10-30T09:00:00`（JST に換算した時刻）で返る。
- 原因: 日付列を `Format=DateOnly` でも `DateTimeBehavior=UserLocal`（既定）で作ると、UTC 0:00 で保存され、比較と表示がタイムゾーン分ずれる。
- 対処: 日付だけの列は `DateTimeBehavior=DateOnly` にする（既存列は `CanChangeDateTimeBehavior` が true なら属性の PUT で変更できる。
  UserLocal で入れた値は UTC 0:00 で保存されているので、変更後はそのまま正しい日付になる）。スキルの SQL は日付を `'YYYY-MM-DD'` で比べる。
- 確かめ方: スキルの SQL を実機の `read_query` で 1 本ずつ流し、集計結果を投入元の合計と照合する（件数だけでなく合計値も見る）。

## 52. スキルに「グラフと HTML レポートを必ず付ける」と書いたのに、Cowork で一度も出ない

- 症状: 必須ルールと Step に「チャットにグラフ（画像）を、最後に HTML レポートを付ける」と書いたスキル（4 本）で、
  Cowork は表だけを返し、グラフも HTML レポートも出さなかった（提案もしなかった）。スキルとひな形（`report-template.html`）はパッケージに入っていた。
- 原因: 書き方。
  1. 表のひな形は具体的なコードブロックで書いたが、グラフとレポートは箇条書きで「作る」と書いただけだった（ひな形に無いものは落ちる）。
  2. 「コードを実行できるなら PNG」「画像を作れないときは文字の横棒」と条件付きで書いた（省いてよい理由になる）。
  3. 3 本のスキルが「作り方は <別のスキル> の「グラフとレポートの作り方」と同じ」と、ほかのスキルの節を参照していた（Cowork は依頼に合うスキルだけを読む）。
  4. 回答の前に 3 点がそろっているかを確かめる節が無かった。
  5. レポートのグラフを JSON + JS で描くひな形だった（プレビューでスクリプトが動かないと、グラフが空になる）。
- 対処: [visual-output.md](visual-output.md) の「省かれない書き方」。各スキルに「結果の出し方（毎回・省略しない）」と「返す前の確認（毎回）」の節を置き、
  回答のひな形の中に文字の棒グラフと `📄 レポート: <ファイル名>.html` の行を入れる。PNG は「追加で」作るものとして分けて書く。
  ひな形はスクリプトを使わず、グラフを CSS の棒（`style="width:NN%"`）で描く。version を上げて再インストールし、**新しいタスク**で試す。
- 恒久対策済み: `check_visual_output.py` を追加し、`build_agent_package.ps1` がビルドのたびに上の 1〜5 を検査して止める（`test_check_visual_output.py`）。
  同梱の [report-template.html](report-template.html) はスクリプトなしに変更。

## 53. チャットにグラフを出したいが、Render UI の仕様・色の選択肢が分からない／グラフ・表・HTML の数字がずれる

- 症状: 提案スキルの結果をチャット内のグラフ（Cowork の組み込みスキル Render UI）で見せたい。公開の Microsoft Learn には Render UI の仕様・色の一覧が無い。
  また、グラフ・表・HTML をモデルが別々に書くと、数字・単位がずれる（実例: 見本のレポートで傘 4 本を個に足して「34 個」と書いていた）。
- 対処（2026-10-07、Cowork のチャットに Render UI のグラフが表示されることを確認）:
  1. 共通ルール [display-rules.md](display-rules.md) を `<!-- include: display-rules.md -->` で各スキルに差し込む。実行時に Render UI の説明を読み、種類・データの形・**正式な色の選択肢だけ**を使う。
     表示を確かめるまで成功と書かない。失敗したら 1 回だけ直して再表示し、駄目なら文字のグラフと表に切り替える。表示できたグラフと同じ文字のグラフは重ねない。
  2. 数字は 1 つの計算結果（`results.json`）にまとめ、[report_builder.py](../scripts/report_builder.py) が Render UI 用の図（単位ごとに分割）・文字のグラフと表・HTML を作り、3 つの数字の一致を確かめる。
  3. 単位はデータの列から読む（無ければデータに単位の列を足す）。単位の違う数は 1 つの図・合計にしない。
  4. 保存用の HTML には内部識別子（GUID・`<接頭辞>_` のテーブル名・列名・コードの列）を入れない。
- 恒久対策済み: `build_agent_package.ps1` が include を差し込み、`report_builder.py` とひな形を `scripts/` に同梱する（Learn の progressive loading: `scripts/` は実行するだけでコンテキストに読み込まれない）。
  `check_visual_output.py` が、description に 提案・助言・打ち手・対策案・推奨 などがあるスキルに Render UI の手順・「このスキルのグラフ」・同梱スクリプトが無ければ止める。
  同梱テンプレートの提案スキル（目標達成プランナー・現場の次アクション助言・安全シグナルレビュー）にも組み込み済み。テスト `test_report_builder.py`・`test_check_visual_output.py`。


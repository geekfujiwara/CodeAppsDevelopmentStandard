# 異常系・詰まりどころ

## 空グループの削除が Conflict、従来ルーティング設定には参照がない

**症状**: 所属環境 0 件、`listTenantSettings` のルーティング先も別グループだが、
公開 DELETE は HTTP 400、本文は `Conflict`。管理センターはルーティング参照を警告する。

**原因**: 新画面の `EnvironmentRouting` は `tenantRuleBasedPolicies` に別途保持される。
従来の `environmentRoutingTargetEnvironmentGroupId` だけでは安全に削除判定できない。

**恒久対策済み**: `delete_environment_group.py` の `preflight()` は新旧両方を読み取り、
`set_environment_routing.py` の `group_references()` で参照があれば DELETE 前に停止する。
読み取りエラー・曖昧なポリシーも安全側で停止する。移行先の承認後に既存ルールだけを変更し、
再チェックする。手順と API は [environment-routing.md](environment-routing.md)。

参照がない空グループでも単純な公開 DELETE が Conflict となることがある。
管理センターでは割り当て DELETE 204 → ポリシー DELETE 204 → テナントホストのグループ DELETE 200 を実測した。
**恒久対策済み**: `delete_via_api()` がこの順序を実装し、`policy_inventory()` と
`require_exclusive_policies()` で共有参照を検査する。正常系は API スクリプトで完結する。
通信結果不明や部分完了時は `operations` を確認し、現状の API 再取得からやり直す。共有ポリシーは削除しない。
API 仕様変更の調査で UI が必要な場合のみ VS Code 統合ブラウザを使う。
Manage > Environment groups の行を選択し Delete group を押すと確認なしで即時実行される場合があるので、
API 失敗の調査だけで削除ボタンを押さない。

## None への解除後に読み戻しが不一致になる

管理センターの None は `EnvironmentGroup` のゼロ GUID であり、ルール削除やルーティング機能の無効化ではない。
PATCH 後、サーバーは ruleSet に `lastModifiedDate` を追加することがある。
**恒久対策済み**: `resolve_target_group()` はゼロ GUID を特別扱いし、
`configuration_payload()` はこの更新日時だけを設定照合から除外する。ポータルや優先順位の差は拒否する。
不一致のエラー後は再送せず実設定を確認する。`Dev` 等の固有名ではなく元グループ ID とルール名を検査する。

## ACP の第一者判定と初期ルール作成

表示名・ID の接頭辞・publisher のどれか 1 つだけでは第一者サービスと判定できない。
レガシー/現行 Dataverse が同じ表示名になるケースもある。
**恒久対策済み**: `resolve_catalog_set()` は ID と publisher を組み合わせ、レガシー共通拒否リストと
カタログの非推奨情報を優先する。Microsoft セットでは Work IQ 9 種と現行 Dataverse を必須検査する。
第一者セットに独自 MCP を自動混入させない。承認済み全許可グループは別プロファイルとする。

`block-all` の許可 0 件とルール未作成は同義ではない。
**恒久対策済み**: `_process()` は `ConnectorManagement` がなければ空のルールも作成対象とする。
既存項目のアクション/接続種別と他ルールを保持し、保存後に読み戻す。
`list_connector_catalog()` はページング、`assigned_policy_id()` は一意性を検査する。

## 新 Workflow の Agent ノードが事前チェックを通過した後にブロックされる

新 Copilot Studio Workflow の Agent ノードは `shared_agentnode` を使う。
Dataverse や `shared_powervirtualagents` の許可だけでは利用可能と判定しない。

**恒久対策済み**: `check_development_environment.py` の `check_commands()` は Dataverse と
`shared_agentnode` をクラシック DLP と環境・グループ ACP の検査へ必ず渡し、失敗時は停止する。
`apply_acp_profile.py` の `resolve_allow_set()` は `microsoft-first-party` の `allowConnectors` を参照し、
カタログ未掲載・初回未許可でも Agent ノードを許可候補に含める。拒否規則は優先し、適用は明示承認後のみ。
回帰テスト: `python -m unittest discover -s .github/skills/admin/tests -p test_agent_node_preflight.py -v`。

環境グループに現在 ACP がない場合でも、環境には最後の設定が残るのが仕様。
`Synced Environment Policy` という名前だけでグループへ ACP を新設しない。
両方のルールを確認し、配下全環境の影響を提示してグループ設定を承認する。個別環境への書き込みはしない。

構成チェックと管理センターの `Applied`、Studio の Review 成功は実行成功の代わりにならない。
外部データ・ツールなしの最小実行が HTTP 442（DLP/ACP）で失敗する場合は、対象コネクタ、実行 ID、
エラーの `Last refresh` とポリシー変更時刻を記録する。古い取得日時だけで原因を断定せず、
反映後に再検証し、継続する場合はサポートへ確認する。ACP 無効化・全許可化で回避しない。

公式資料: [ACP の環境設定と保持仕様](https://learn.microsoft.com/en-us/power-platform/admin/advanced-connector-policies)、
[API によるポリシー更新](https://learn.microsoft.com/en-us/power-platform/admin/programmability-tutorial-manage-advanced-connector-policies)。

## 1. Copilot Studio で「データ損失防止ポリシーによりブロックされています」と出る

**症状**: カスタムコネクタ（自前 MCP Server 等）をツールとして追加すると、DLP でブロックされたと表示される。
ポリシーを見ても、そのコネクタは Blocked に入っていない。

**原因**: テナント ポリシーの URL パターン規則が `Ignore *` だけの場合、カスタムコネクタは
**未分類**のままになる。Copilot Studio の評価では、未分類はブロック相当として扱われることがある。

**対処**: 対象ホストだけに規則を 1 本追加して明示分類する。

```powershell
python .github/skills/admin/scripts/set_dlp_custom_connector.py `
  --tenant-id $env:TENANT_ID --policy "<表示名>" `
  --host <host>.azurewebsites.net --classification General --apply
```

**恒久対策済み**: `check_dlp.py` の `_custom_classification()` が未分類を検出して `NG` にする。

## 1-b. DLP は OK なのに Copilot Studio でブロックが続く（ACP）

**症状**: `check_dlp.py` が `OK` を返し、URL 規則も他コネクタと同じグループに揃えたのに、
Copilot Studio でツールを追加すると「組織のデータ損失防止ポリシーによりブロックされています」が出続ける。

**原因**: **ACP（Advanced connector policies）**が環境または環境グループに適用されている。
ACP は default-deny の厳格な許可リストで、既定の**混成モード**ではクラシック DLP と併用され
**より制限の厳しい方**が適用される。許可リストに無いコネクタはクラシック DLP が OK でもブロックされる。

**確認**:

```powershell
python .github/skills/admin/scripts/set_acp_connector.py `
  --environment-id $env:ENV_ID --include-group --connector <shared_xxx>
```

`[ブロック]` と表示されたら ACP が原因。管理センターでは
**セキュリティ > データとプライバシー > Advanced connector policies** で `Status` を確認できる。

**対処**: グループの適切なプロファイルの差分をレビューし、承認後に適用する。

```powershell
python .github/skills/admin/scripts/apply_acp_profile.py `
  --environment-id $env:ENV_ID --environment-group-id <GROUP_ID> --profile microsoft-first-party
```

## 1-c. ACP に追加したのに許可コネクタ数が増えない

**症状**: 環境ポリシー（`Synced Environment Policy (from Environment Group)`）に PATCH すると
HTTP は成功するのに、読み直すと件数が元のままになる。

**原因**: 環境に割り当てられているのは環境グループからの**同期コピー**。
グループ側のポリシーが正であり、同期でその内容に戻される。

**対処**: `GET /governance/ruleBasedPolicies/environmentGroups/{groupId}/assignments` で
グループの `policyId` を取得し、`apply_acp_profile.py --environment-group-id <GROUP_ID>` で差分を確認する。
`set_acp_connector.py --include-group` は両方を確認するので、差分が出たらグループ側を直す。

## 1-d. ACP の許可セットを `publisher` で作ろうとして 3rd パーティが混ざる

**症状**: 「Microsoft 提供のコネクタだけ許可する」つもりで
`properties.publisher == "Microsoft"` を条件にしたら、Google Drive・YouTube・Mailchimp・
Zendesk などが許可セットに入ってしまう。

**原因**: コネクタの `publisher` は**コネクタの作者**であり、**サービスの提供元ではない**。
サードパーティ サービス向けのコネクタも Microsoft が作成・公開しているため publisher は `Microsoft` になる。
`metadata.stackOwner` も第一者コネクタでは空で、判定に使えない。

**対処**: コネクタ ID（`shared_xxx`）のパターンで判定する。
定義は [acp-profiles.json](acp-profiles.json) にあり、`mustNotAllow` に代表的な
サードパーティ サービスを列挙して、混入したら `apply_acp_profile.py` が中断する。

## 1-e. ACP の許可リストを置き換えて全部ブロックしてしまう

**症状**: 移行やプロファイル適用で `AllowedConnectorList` を上書きした結果、
必要なコネクタまで消えてアプリ・フロー・エージェントが一斉に動かなくなる。

**原因**: `apply_acp_profile.py` と `migrate_dlp_to_acp.py` は許可リストを**置き換える**。
クラシック DLP の「Non-business を全部許可」に相当する状態から移行すると、削除件数が 1,000 件を超えることもある。

**対処**:

- 必ず dry-run の差分（追加 / 削除の件数と一覧）をユーザーに提示してから `--apply` する。
- カスタムコネクタは既定で引き継がれる（`apply_acp_profile.py`）。移行スクリプトでは `--keep-custom` を明示する。
- 許可セットが 0 件になる指定は `migrate_dlp_to_acp.py` が中断する（意図的なら `--allow-empty`）。
- 環境グループ配下の全環境に効くため、まず 1 環境だけに ACP を割り当てて検証する。

## 1-f. 「ACP のみ」モードを切り替えたい

**症状**: クラシック DLP を無視して ACP だけで運用したいが、`listTenantSettings` や
`governance/tenantSettings` に実施モードの項目が見つからない。

**原因**: 実施モードはテナント設定ではなく**環境グループのルール**として保存される。

**対処**: グループ ルール `AdvancedConnectorPoliciesOnly` を設定する。

```bash
python set_environment_group_rules.py --tenant-id <TENANT_ID> --environment-group-id <GROUP_ID> `
  --policy-rule "AdvancedConnectorPoliciesOnly/EnableAdvancedConnectorPoliciesOnly=true" --apply
```

未設定時は**混成モード（既定）**で、クラシック DLP と ACP の**より制限の厳しい方**が適用される。
テナント全体に一括適用するスイッチは無いので、グループごとに設定する。

## 2. `urlPatterns` の POST で既存規則が消えた

**原因**: `POST .../policies/{policy}/urlPatterns` は**全置換**。差分更新ではない。

**対処**: 必ず GET してから、既存規則を含めた完全な配列を送る。

**恒久対策済み**: `set_dlp_custom_connector.py` の `_build_rules()` が既存規則と末尾の `*` を保持し、
`order` を 1 から振り直す。入力の辞書はコピーしてから加工するため、dry-run 表示が壊れることもない。

## 3. dry-run の「現在」表示が変更後と同じになる

**原因**: 規則リストの辞書を破壊的に加工していた（`order` の振り直しが元データにも及んでいた）。

**対処 / 恒久対策済み**: `_build_rules()` で `dict(rule)` によりコピーしてから加工する。

## 4. 環境チェックの Dataverse 項目がスキップされる

**症状**: `WARN Dataverse 接続先: .env の DATAVERSE_URL が環境の instanceUrl と一致しません`。

**原因**: `.env` の `DATAVERSE_URL` と `ENV_ID` が別の環境を指している。

**対処**: `.env` の 2 つを同じ環境に揃える。複数環境を扱う場合は `--environment-id` と
`DATAVERSE_URL` を同時に切り替える。誤った組織を検査しないための意図的な安全策。

## 5. Code Apps が `WARN` になるが、実際は有効

**原因**: Code Apps の許可トグルを読む公開 API が無いため、環境内のコード アプリ件数で代替判定している。
まだ 1 つもデプロイしていない環境では 0 件になる。

**対処**: 管理センター（環境 > 設定 > 製品 > 機能）でトグルを確認する。確認済みなら `WARN` は無視してよい。

## 6. `api.powerplatform.com` が 403 (`InsufficientDelegatedPermissions`) になる

**原因**: `auth_helper` が使う公開クライアントには Power Platform API の委任アクセス許可
（`EnvironmentManagement.Settings.Read` など）が付与されていない。

**対処**: 同等の情報は BAP（`api.bap.microsoft.com`）の管理 API から取得できる。
このスキルのスクリプトはすべて BAP / PowerApps / Dataverse の API だけを使っている。

## 7. ポリシー変更が反映されない

**原因**: DLP の反映には時間がかかる（通常 1 時間以内、最大 24 時間）。

**対処**: 待ってから `check_dlp.py` を再実行する。急ぐ場合でもポリシーを何度も書き換えない
（全置換 API のため、事故のリスクだけが増える）。

## 8. `--policy` で複数のポリシーが一致してエラーになる

**原因**: 表示名の部分一致で複数ヒットした。

**対処**: エラーメッセージに出る候補から、完全一致する表示名または `name`（GUID）を指定する。

## 9. 管理センターでしかできない設定の API を見つけたい

**症状**: 環境グループのルールや Copilot クレジット配分など、公開ドキュメントに API が無い。

**対処**: VS Code の統合ブラウザで管理センターを開き、`fetch` と `XMLHttpRequest` を差し替えて
実際の呼び出しを採取する。操作後に `window.__cap` を読む。

```javascript
window.__cap = [];
const of = window.fetch;
window.fetch = function (input, init) {
  const url = typeof input === 'string' ? input : (input && input.url);
  window.__cap.push({ method: (init && init.method) || 'GET', url, body: init && init.body });
  return of.apply(this, arguments);
};
const oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return oo.apply(this, arguments); };
XMLHttpRequest.prototype.send = function (b) {
  window.__cap.push({ method: this.__m, url: this.__u, body: typeof b === 'string' ? b : undefined });
  return os.apply(this, arguments);
};
```

- ページをフルロードすると差し替えが消えるので、遷移後に再度実行する。
- 読み取りはページを開くだけ、書き込みは実際に保存ボタンを押すと採取できる。
- 見つけた API は [rule-catalog.md](rule-catalog.md) に記録しておく。

## 10. グループ ルールの PATCH が 400 `Expected Boolean but got String` になる

**原因**: `GET .../ruleBasedPolicies` は Boolean も整数も**文字列**で返す（`"False"` / `"1"`）が、
`PATCH` は JSON の型を要求する。GET の結果をそのまま送り返すと失敗する。

**対処**: 送信前に型を戻す（`set_environment_group_rules.py` の `_coerce()`）。
変更しない既存の `inputs` も同じボディに含まれるので、全件を正規化する。
`MakerOnboardingContent` の値だけは常に文字列のままでよい。

## 11. `saveTenantSettings` がどの API バージョンでも 404 になる

**原因**: `saveTenantSettings` は存在しない。`scopes/admin` を付けても 404。

**対処**: 書き込みは
`POST {BAP}/providers/Microsoft.BusinessAppPlatform/scopes/admin/updateTenantSettings?api-version=2021-04-01`。
ボディは**変更する項目の差分だけ**を入れ子のまま送る（全体を送る必要はない）。
読み取りは `POST {BAP}/providers/Microsoft.BusinessAppPlatform/listTenantSettings?api-version=2021-04-01`
（こちらは `scopes/admin` を**付けない**）。

## 12. 既定環境ルーティングの送り先グループを変えられない

**症状**: `PATCH {T}/governance/tenantRuleBasedPolicies/{id}` が 404 `RouteNotFound`。

**原因**: `tenantRuleBasedPolicies` は読み取り専用の射影。

**対処**: テナント設定の
`powerPlatform.governance.environmentRoutingTargetEnvironmentGroupId`（と `enableDefaultEnvironmentRouting`）を
`updateTenantSettings` で更新する。`apply_environment_strategy.py --tenant-settings-only --apply` がこれを行う。

## 13. `api.bap.microsoft.com` で SSL 切断・接続リセットが頻発する

**症状**: `SSLEOFError` や `RemoteDisconnected` でスクリプトが落ちる。

**原因**: BAP の管理 API は長めの応答で接続を切ることがある。

**対処**: 3 秒間隔で 4 回程度リトライする（本スキルの各スクリプトは実装済み）。
タイムアウトは 120〜180 秒を見込む。

## 14. CSP を空に戻そうとして 400 `contentsecuritypolicyconfiguration cannot be NULL` になる

**症状**: `contentsecuritypolicyconfiguration` に `null` を PATCH すると 400 になる。

**原因**: この列は必須項目で `null` を受け付けない。

**対処**: 空の JSON 文字列 `{}` を送る。スクリプトなら次のとおり。

```bash
python set_content_security_policy.py --environment-url <ENV_URL> --reset-directives --disable --apply
```

## 15. CSP を有効にしたらアプリが白画面になった

**症状**: `--enable` した直後からアプリが表示されなくなる。

**原因**: ディレクティブに載っていない読み込み元がブラウザー側でブロックされている。

**対処**: いきなり強制せず、次の順で進める。戻すときは `--disable --apply`。

1. `--report-uri` だけを設定して report-only で違反を集める
2. 違反に出た読み込み元を `--directive` に追加する
3. 違反が出なくなってから `--enable` する

反映まで数分かかるため、ブラウザーのキャッシュも消してから確認する。

## 16. Dataverse 容量を環境ごとに配分できない

**症状**: `PATCH {T}/licensing/environments/{env}/allocations` に `currencyType: "Database"` を渡すと
400 `Error converting value "Database"` になる。

**原因**: Dataverse ストレージは消費ベースでテナント プールから引かれる仕組みで、環境ごとの配分 API は無い。
配分できるのは Copilot クレジットや AI Builder クレジットなどのアドオン容量だけ。

**対処**: `set_environment_capacity.py --storage` で環境ごとの消費量を一覧し、逼迫している場合は
不要な環境の削除・監査ログの保持期間短縮・ファイルの整理で対処する。

## 17. HTML レポートが統合ブラウザで `Forbidden. File does not reside within a trusted folder.` になる

**症状**: `generate_strategy_report.py --output $env:TEMP\report.html` で生成した HTML を
VS Code の統合ブラウザで `file:///...` として開くと、上記エラーで表示されない。

**原因**: 統合ブラウザは信頼されたフォルダー（開いているワークスペース）配下の `file://` しか読み込まない。
一時ディレクトリはワークスペース外なので拒否される。

**対処**: `--output` にワークスペース内のパスを指定する（例: `.\admin-strategy-report.html`）。

**恒久対策済み**: `generate_strategy_report.py` の `assert_openable()` が、出力先が一時ディレクトリ配下なら
生成前に終了コード 1 で中断する。ブラウザで開かないことが確定している場合のみ `--allow-outside-workspace` で回避する。

## 18. 設計合意の待ち合わせでターミナルが止まったように見える

**症状**: レポートを提示した後、コマンド プロンプトで承認を待つと、処理が終わったのか入力待ちなのかが
ユーザーから判別できず、セッションが停滞する。

**原因**: 承認ゲートをターミナル側（`Read-Host` / `pause` / `input()`）で作っていた。

**対処**: 承認ゲートは**チャットで取る**。レポートを開いたらそのターンをチャットの応答で終了し、
確認してほしい点を箇条書きで示してユーザーの返答を待つ。長時間動くコマンドも同じターンに続けない。
スキル同梱スクリプトはすべて非対話で、`--apply` を付けるまで dry-run（SKILL.md「ワークフロー（正常系）」冒頭の注記）。

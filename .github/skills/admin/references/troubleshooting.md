# 異常系・詰まりどころ

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

**対処**: 許可リストに追加する。反映後は許可コネクタ数が増えることを必ず確認する。

```powershell
python .github/skills/admin/scripts/set_acp_connector.py `
  --policy-id <グループ ポリシー ID> --connector <shared_xxx> --apply
```

## 1-c. ACP に追加したのに許可コネクタ数が増えない

**症状**: 環境ポリシー（`Synced Environment Policy (from Environment Group)`）に PATCH すると
HTTP は成功するのに、読み直すと件数が元のままになる。

**原因**: 環境に割り当てられているのは環境グループからの**同期コピー**。
グループ側のポリシーが正であり、同期でその内容に戻される。

**対処**: `GET /governance/ruleBasedPolicies/environmentGroups/{groupId}/assignments` で
グループの `policyId` を取得し、そちらを `--policy-id` に指定して更新する。
`set_acp_connector.py --include-group` は両方を確認するので、差分が出たらグループ側を直す。

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

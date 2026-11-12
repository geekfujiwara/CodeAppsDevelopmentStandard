# 標準 Dataverse プラグインで Cowork を使う

Dataverse 接続は Microsoft 提供の **Microsoft Dataverse プラグイン（プレビュー）**を第一候補にする。
Power Platform の Dataverse コネクタ経由で、利用者本人の権限で動作する。
独自の Entra OAuth アプリ・シークレット・Developer Portal OAuth registration・
`allowedmcpclients` へのカスタム Client ID 追加は不要。標準経路のために既存の OAuth セットアップスクリプトを実行しない。

## 1. 管理者が対象者へインストールする

1. 組織で Cowork の利用が許可され、対象者の Microsoft 365 Copilot ライセンスとプレビュー利用条件を満たすことを確認する。
2. Microsoft 365 管理センター → **Agents → Tools → Plugins → Microsoft Dataverse → Install**。
3. 最初は **Specific users and groups** で検証対象者だけを指定し、Review and install → Install。
4. 完了表示と配布対象を読み戻す。利用者は管理者によるインストール後に Cowork 側で追加・接続する。

管理者はプラグインの発行元・配布可否を管理し、Power Platform のコネクタ制御（ACP）も確認する。
この標準経路では別の MCP クライアント許可登録は不要だが、対象環境の Dataverse MCP の有効化と
組織ポリシーへの適合は必要。ブロックを検出した場合だけ admin スキルへ診断を委譲し、制御を迂回しない。

## 2. 利用者本人が環境へ接続する

1. Power Apps の **Session details** にある **Instance url** で対象環境の URL を確認する。
   Dataverse データベースを持つ環境を使い、アプリ URL や `/api/mcp` 付き URL は入力しない。
2. **Cowork → Customize → Microsoft Dataverse** を開き、Microsoft Dataverse MCP server の **Connect** を選ぶ。
3. 対象環境の URL を入力し、利用者本人がサインイン・同意を完了する。管理者が本人の代わりに接続しない。
4. 接続先が意図した環境か読み戻す。環境を変更した場合は再接続して新しいタスクで確認する。

ポータル操作は [ブラウザ自動化方針](../../standard/references/browser-automation.md)に従い、
最初のブラウザ起動前に AskUserQuestion で使用する Microsoft Edge プロファイルを確認する。
回答前は操作せず、同じタスクでは同一プロファイルを使う。VS Code 統合ブラウザを使用し、
サインイン・本人同意・変更承認は利用者が行う。標準プラグインの未観測 private API を推測して実行しない。

## 3. 新しいタスクで実行確認する

1. 利用可能なツールの説明を読み、実際の名前・引数・対応操作を確認する。
   カスタム MCP 用の `describe`・`read_query`・`create_record` が同名で存在するとは仮定しない。
2. メタデータ取得操作で対象テーブル・列・ルックアップ・選択肢を確認し、承認された範囲の少量のデータを参照する。
3. 書き込みが要件に含まれる場合は、対象環境・対象レコード・変更内容を示し、
   **承認カードで本人が承認した後だけ**変更する。結果を再取得して照合する。削除は明示要件が無ければ試さない。
4. 接続済み表示ではなく、環境・取得結果・承認と読み戻しの結果を完了根拠にする。

利用者には Basic User と業務テーブルだけの専用 Dataverse ロールを割り当てる。
ツールの可視性やスキルの禁止文はアクセス制御の代替にならない。
標準接続に公開されていない操作は、CLI や別接続で黙って代行せず、未対応として報告する。

## 4. 必要な場合だけ業務スキルを配布する

標準プラグインで十分なら独自パッケージは不要。業務固有の判断基準・承認手順・出力形式が必要な場合だけ、
`skills/<skill-name>/SKILL.md` を作り、**`agentSkills` のみ**を持つ業務パッケージとして配布する。
接続は標準プラグインに任せ、業務側に Dataverse コネクタを重複登録しない。

manifest は本文 Step 6 の基本項目（1.29・id・developer・name・description・icons・accentColor）を使い、
`agentSkills` に業務スキルを列挙する。**`agentConnectors` は省略**し、
`__COWORK_OAUTH_REGISTRATION_ID__`・`remoteMcpServer`・`mcpToolDescription` は含めない。
本文 Step 1〜2 のスキーマ確認・作成者・承認・結果の見せ方の契約は引き続き適用する。

この構成では OAuth 用 `.env` は不要。既存の `build_agent_package.ps1` はカスタム接続用で
OAuth 設定を必須とするため使わない。数値・提案を扱う業務スキルはパッケージ作成前に
`<!-- include: display-rules.md -->` を [display-rules.md](display-rules.md) の内容に展開し、
[report_builder.py](../scripts/report_builder.py) と [report-template.html](report-template.html) を
各スキルの `scripts/` に同梱する。`--compose` による一時検査だけで展開済みとは扱わない。

```powershell
# リポジトリのルートから、展開・同梱済みのスキルを検査する
python .github/skills/cowork/scripts/check_visual_output.py --skills <業務スキルのルート>/skills
# 成功後、業務パッケージのルートで実行（ZIP 直下に manifest.json を置く）
python -m zipfile -c <パッケージ名>.zip manifest.json color.png outline.png skills
python -m zipfile -l <パッケージ名>.zip
```

ZIP に OAuth プレースホルダー・未展開 include・`.env` が入っていないことを確認する。
公開・更新は本文 Step 8・10 の承認付き手順を使い、標準 Dataverse プラグインとは別の業務パッケージとして扱う。
本人の Cowork に両方を有効化し、**新しいタスクで業務スキルが標準接続のツールを使えることを実測**する。
直接 MCP を呼ぶ `rehearse_plugin.py` は標準 Cowork の接続を検証するものではない。

既存の sales-crm / agm-qa / store-assist テンプレートは **カスタム接続向けの互換テンプレート**として保持する。
標準経路へ移す場合は生成後の manifest から `agentConnectors` を外し、スキルのツール名・引数・
スキーマ確認操作を標準接続の実測に合わせる。コネクタを外すだけで移行完了にはしない。
既存の公開パッケージは上書き・アンインストールせず、移行対象と利用者への影響を確認してから更新する。

## 根拠

- [公式: Use the Microsoft Dataverse plugin in Cowork (preview)](https://learn.microsoft.com/en-us/copilot/cowork/dataverse-plugin)
- [公式: Microsoft Dataverse Plugin for AI Agents](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/agents-plugin/)
- [公式: Build plugins for Copilot Cowork](https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-plugin-development)
- [利用例: Copilot Cowork で Microsoft 標準の Dataverse プラグインを使う](https://www.geekfujiwara.com/copilot/10004/)

2026-11-12 に公式文書と利用例の検索取得内容を確認。Learn MCP はこのセッションでは利用不可。
プレビューの提供範囲・画面は変更され得るため、実際の利用時に対象テナントで確認する。

# 第1段階: scaffold から実会話の受入まで

## Step 1: 最小の回答を保存する

名前・プロフィール PNG、社外メール送信可否、画像生成可否、社内／社外の
`tone`（`friendly` / `formal`）と `emoji`（boolean）だけを最初に聞く。
回答は [decisions の例](scaffold-decisions.example.json) へエージェントが保存する。
`hosting=foundry-autopilot` / `runtime=copilot-sdk` / `goal=d` は固定。
費用の確認、機能の採否や推奨構成の確認は追加しない。
Azure の格納先は新規 RG／既存 RG のどちらかを必ず確認し、
`resourceGroup: {"mode": "new" または "existing", "name": "<RG名>"}` に保存する。
新規の名前は省略して自動導出できる。既存 RG は対象名を確認する。
RG 以外の Azure リソースは流用せず、全てその1つの RG 内に新規作成する。

メール受信と社外送信は別設定。初回ランナーは受信を既定で有効にする。
社外送信不可のときは全宛先が社内と検証できない送信・転送・返信もコードで拒否する。
共有の同意、外部データの囲み、匿名／社外リンクの禁止は維持する。
初回受入テストの送信先は owner と agent user に限定し、第三者へメールや会議招待を送らない。

## Step 2: 探索から発行まで実行する

```powershell
python .github\skills\foundry-autopilot\scripts\run_first_stage.py `
  --decisions C:\work\answers.json --target C:\work\teammate
```

`--plan` だけはローカルの計画表示。通常実行は以下を順に行う。

1. `provision_foundry.py --execute` で認証プロファイルと共通キャッシュを利用し、
   本人・owner・サブスクリプションを検証して**新規の公開 Foundry 基盤**を作成する。
   未指定の RG / account / project / ACR 名は agent 名・subscription・owner から安定して導出する。
   `AZURE_LOCATION` は未指定なら `japaneast`。API キーと ACR 管理者認証は無効、
   Entra ID / Managed Identity で認証し、VNet / Firewall / Private DNS は作成しない。
   Log Analytics / Application Insights と project MI の image pull・モデル利用・監視用 RBAC も含む。
   ユーザー本人の初回インタラクティブ認証、MFA、必要な追加同意は省略できない。
2. `prepare_first_stage.py --execute --new-foundation` で作成した Foundry・Power Platform・solution・publisher を探索する。
   既存設定を検証して再利用する。未指定で候補が一意なら設定し、曖昧なら候補を示して止める。
   日本の実カタログ候補からモデルを選択し、新規 Foundry 内へデプロイする。
   別アカウントの既存モデル・ACR は利用しない。カタログの提供は容量保証ではない。
3. Autopilot・全標準機能・Agent Skills・評価Hub・回帰テスト・第1段階の Python ランナーと受入ケースを生成する。
   画像生成を断った場合だけ B17 を除き、古い画像モデル設定が残っても画像生成を無効にする。
4. Hub の Dataverse スキーマ・接続参照・データソースを作り、`npm run predeploy` 成功後だけデプロイする。
   `pa app list --json --non-interactive` で対象環境の既存 Hub を照合し、一意なら appId を再利用する。
   一覧の取得失敗・未対応の出力形式・複数候補は停止し、別 Hub を勝手に増やさない。
   `power.config.json` を持ち込んだ場合も対象環境を照合する。
5. 画像生成を許可した場合は画像モデルを準備する。発行前チェック後にコンテナーをビルドし、
   `publish_foundry_autopilot.py` で `digital_worker_type=m365` の hosted agent を発行する。
   通常 Agent・共有 bot・自己ホストへのフォールバックは禁止。

既存 Azure 基盤の流用オプションは設けない。同じ bootstrap が今回作成した資産だけは、
中断からの再実行・コード更新の対象にでき、他の既存資産を取り込まない。
既存 RG を選択してもその中の既存資産は再利用しない。新規 RG と同名の他者所有 RG は拒否する。
同じ所有タグでも非公開化・キー認証有効化などの設定変更は上書きせず停止する。
作成・読戻しに失敗したらエラーと対象工程を報告し、Policy の緩和、別ログイン、別 hosting は試さない。
新規リソース作成と RBAC 割当には対象スコープの権限が必要。Contributor 単独ではロール割当できない。
リソースプロバイダーの未登録や権限不足は担当管理者に依頼する。
この処理はガバナンスの事前診断ではなく、実際の基盤作成と最小限の設定検証である。

モデルが無いときはライブカタログの実値を選び、同じランナーへ転送できる。
基盤作成だけでモデル容量・quota・Frontier の利用可否は保証しない。

```powershell
python .github\skills\foundry-autopilot\scripts\run_first_stage.py `
  --decisions C:\work\answers.json --target C:\work\teammate `
  --model "<candidate name>" --model-version "<candidate version>" --model-sku "<candidate SKU>"
```

ACR のビルドは `build_autopilot_image.py` が共通認証で ARM の ACR Tasks を呼び、
成功状態だけでなく指定タグの image digest を検証する。別の `az login` は増やさない。
画像モデルも第1段階では `--shared-auth` を使う。Code Apps の CLI は別クライアント／キャッシュなので、
既存の `setup_code_app_auth.py` で同じ承認済みアカウント／Edge プロファイルを選択し、必要時だけ本人が初回認証する。
異なるクライアントのトークンを流用したり、将来の再認証が不要と保証したりしない。

ACR Tasks の契約:
[source upload URL](https://learn.microsoft.com/en-us/rest/api/container-registry-tasks/registries/get-build-source-upload-url?view=rest-container-registry-tasks-2019-04-01) /
[schedule run](https://learn.microsoft.com/en-us/rest/api/container-registry-tasks/registries/schedule-run?view=rest-container-registry-tasks-2019-04-01)。
短期の source upload URL は ARM の応答からのみ使用し、保存・ログ出力しない。

初回発行の API 応答は完了ではない。ランナーは終了コード **2** で
`awaiting-approval-and-hire` とし、`autopilot-publication.json` に同じ version の公開識別子を保存する。
この段階で費用や「残りも行うか」を聞き直さない。
既存リソース・権限・接続が不足する場合も非ゼロで停止し、未実施を成功扱いしない。
新規基盤は初回ランナーが準備する。`prepare_first_stage.py` 単体は探索・選択したモデルの準備だけで、
Foundry アカウント／プロジェクト／ACR は作成しない。

## Step 3: 必須の承認・採用を完了する

VS Code 統合ブラウザで、M365 Requests の対象行の **Type = Agent template**、
Publish、Teams **Agents for your team** の採用を確認する。
採用された agent user に **Microsoft 365 Frontier for Autopilot** を割り当てる。
通常 Registry 行や HTTP 200 からこれらを推測しない。private API の二重 hash 承認も維持する。

観測結果を Git 除外の `autopilot-approval.json` に記録する。
次の最初の5値は公開記録と完全一致させる。

```json
{
  "agentName": "<published agent name>",
  "version": "<published version>",
  "blueprintClientId": "<published blueprint client id>",
  "teamsAppId": "<published Teams app id>",
  "titleId": "<published title id>",
  "templateType": "Agent template",
  "hiredUserId": "<observed hired agent user id>",
  "frontierLicenseAssigned": true
}
```

これは API が保証しない UI 状態の**観測記録**であり、ダミーの値や自動生成した true で通してはいけない。
権限不足・ライセンス不足なら担当者に依頼して停止する。

## Step 4: 採用後設定と実環境の受入を続行する

```powershell
python C:\work\teammate\scripts\run_first_stage.py --target C:\work\teammate --resume
```

`--resume` は公開済みのテンプレートを再発行しない。
採用後の委任スコープ、Dataverse ユーザー・ロール、Hub マスター行、写真、Logic App を設定し、
次のケースを **Teams Graph API** で実施する。Bot endpoint への偽 Activity、
Foundry への直接ターン、評価キューだけの実行で代替しない。

| ケース | 合格根拠 |
|---|---|
| 通常会話 | owner と採用済み agent user の1対1チャットに送信し、その agent user から最終返信が届く |
| Work IQ・会議調整 | Calendar で候補を検索し、owner だけを招待するテスト会議を作成。owner の予定表で件名・主催者・開始終了を照合し、会話で取り消した結果まで確認 |
| ニュース・Web 検索 | 実際の検索ツール呼び出しと出典リンク |
| スキル・資料・OneDrive | スキルと作成／配信ツールの呼び出し、共有先が実ファイル、組織内で匿名リンクなし、取得した HTML の今回の識別子・見出し・比較表・CSS・viewport・出典リンク |
| 画像（許可時のみ） | 実際の画像ツール呼び出しと Teams への画像到着 |
| 定期実行 | 1回だけの予定を会話で登録し、Logic App 自身の trigger を実行。成功した run と同じ識別子の schedule ログ・Teams 返信を確認 |
| プレゼンス | agent user の Graph presence が Available / Busy / DoNotDisturb |
| Hub 接続 | 同じ agentkey のマスター行・スキル同期と、**今回の識別子を含む query・response・toolcalls** を照合 |

進捗通知、空の最終返信、過去の会話ログ、Logic App の HTTP 202 だけでは合格にしない。
Graph チャットは通常の委任アクセスを使い、移行専用アプリ権限を流用しない。
必要な Graph 権限がクライアントに無ければ同意／対応する認証クライアントの準備待ちとして止める。
API による agent user 宛てのメッセージが当該テナントで実際の応答を起動しない場合も未測定で止める。

HTML の自動検査は構造・スタイルの存在を確認するもので、ブラウザ表示の美観の実測ではない。
外部参加者との日程交渉や、第三者の承認まではこのテストで代行しない。
HTML の見た目や外部との交渉を試したと報告するには別途その実測が必要。
Foundry の日次評価の構成確認と、将来の実スコア到着も別の事実として扱う。

結果は Git 除外の `regression/first-stage-results.json` に残す。
全必須ケース成功後、不変条件チェックと Foundry 評価の設定チェックが成功して初めて
`first-stage-state.json` が `passed` になる。終了コード2は未測定／未完了で green ではない。
テストで作成する資料と1回限りの配信は owner のチャットに限定し、報告の識別子から追跡できるよう残す。
テスト会議は取り消しまで検証する。途中で失敗した場合は同じ識別子の予定を確認して取り消す。

生成されたランナーは `first-stage.local.json` のスキル配置を参照する。
プロジェクト移動時は同じ版のスキルを配置してこのローカル参照を更新する。

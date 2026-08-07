# 利用実績とコストの内訳（B15）

「誰がどれだけ使っているか」「どの処理にお金が掛かっているか」に答えるための計測。
**B3（頭脳）を入れるのと同じ PR で入れる。後から入れると、それ以前の実績は永久に取れない。**

## 1. なぜ Azure ポータルでは答えられないのか

最初に確認すべき事実。Azure Cost Management で出せるものと出せないものがはっきり分かれる。

| 知りたいこと | Azure ポータルで見えるか | 理由 |
|---|---|---|
| リソース別の料金 | **見える** | Cost analysis のリソース別 |
| モデル別・入出力トークン別の料金 | **見える** | メーター単位で分かれている |
| リクエストごとのトークン数 | 見える（診断ログ） | `AzureDiagnostics` に残せる |
| **誰が使ったか** | **見えない** | 全リクエストが同じマネージド ID から出る。呼び出し元の人は Azure から見えない |
| **何の処理が使ったか**（対話 / 定期配信 / 受信トレイ） | **見えない** | Azure から見ればどれも同じ API 呼び出し |
| **どのツールが高いか** | **見えない** | ツール実行はアプリ内の出来事で、Azure には届かない |
| **1 回の依頼あたりの費用** | **見えない** | ツール ループの往復を 1 依頼にまとめる情報がない |

つまり**アプリ側で記録する以外に手段がない**。そしてトークン数は応答にしか含まれないので、
記録していなかった期間は**さかのぼって復元できない**。

> 依頼者に「Azure のコストで見られる？」と聞かれたら、この表をそのまま示して
> 「リソース単位までは見えるが、人・処理・ツールの内訳は原理的に出ない」と答える。

## 2. 記録の単位は「1 ターン」

**モデル呼び出し単位で記録しない。** ツール ループは 1 つの依頼に対して最大 24 往復する。
呼び出し単位だと行が大量に増えるうえ、「この依頼はいくらだったか」に答えられない。

1 ターン = 依頼を受けてから返信するまで。ここに次を積み上げる。

| 項目 | 用途 |
|---|---|
| `Source`（chat / schedule / mailbox） | 処理の種類別の内訳。**入口ごとに 1 つ渡す** |
| `Actor`（メール アドレス） | 相手別の内訳。定期配信は配信先、受信トレイは不明 |
| 入力 / キャッシュ / 出力 / 推論トークン | 金額換算の材料 |
| `Calls`（モデル往復数） | ツールを使う依頼がなぜ高いかの説明 |
| `Tools[]`（呼んだツール名） | ツール別の内訳 |
| `DurationMs` / `Failed` | 遅い依頼・失敗した依頼の把握 |

実装は 3 つだけ。

1. ツール ループの入口で計測器を作り、`try` / `finally` で囲む。
2. `CompleteChatAsync` の戻り値の `Usage` を毎回足す（`InputTokenDetails.CachedTokenCount` /
   `OutputTokenDetails.ReasoningTokenCount` も取る）。
3. ツール呼び出しのたびにツール名を足す。

```csharp
var meter = new UsageMeter(spentOn, configuration["AzureOpenAI:Deployment"] ?? "unknown");
try
{
    for (int iteration = 0; iteration < MaxToolIterations; iteration++)
    {
        ChatCompletion completion = await chatClient.CompleteChatAsync(messages, options, cancellationToken);
        meter.Add(completion);
        // …ツール ループ。call ごとに meter.AddTool(call.FunctionName);
    }
}
finally
{
    if (meter.Report() is { } spent)
    {
        usage.Record(spent);   // 例外で抜けても記録される
    }
}
```

> **記録の失敗で返信を壊さない。** `UsageStore.Record` は全体を `try` / `catch` で包み、
> 書けなかったら警告ログだけ出して黙って続ける。会計処理が業務を止めてはいけない。

呼び出し側は入口ごとに `UsageContext` を 1 つ渡すだけ。

```csharp
// Teams の対話
spentOn: new UsageContext("chat", userEmail)
// 定期配信
spentOn: new UsageContext("schedule", job.Recipient)
// 受信トレイ監視（差出人ごとにターンを分けてから渡す）
spentOn: new UsageContext("mailbox", sender.Key)
```

> **`Actor` に `null` を渡してよい入口は無い。** 相手が分からないのは実装の都合であって事実ではない。
> 記録されなかった相手は `(不明)` として残り、**後から埋められない**（識別子そのものが残っていない）。
> `null` を渡したくなったら、記録側ではなく**入口の側を直す**。

`MailboxWorker` は 1 回のスイープで複数の未読をまとめて 1 ターンに渡す作りにしがちだが、
**差出人が 2 人いると、そのターンはどちらの利用でもなくなる**。`UsageRecord.Actor` は 1 つしか持てない。
差出人アドレスで `GroupBy` し、**1 差出人 = 1 ターン**にしてから `UsageContext` を渡す
（未読は通常 0〜1 件なので、ターンが増えるのは稀。ついでにインジェクションの影響範囲も差出人ごとに閉じる）。

**`Actor` の形式は入口をまたいで揃える。** `chat` / `schedule` は素のメール アドレスなので、
メール経路も表示名付きの `"名前 <アドレス>"` ではなく `from.emailAddress.address` を使う。
揃えないと、同じ人が `group_by=actor` で 2 行に割れる。

## 3. 単価は「デプロイの SKU」で決まる

金額換算はアプリ設定の `Usage:Pricing:<デプロイ名>` から読む。**推測で入れない。**

```powershell
# 実際の SKU を確認する（GlobalStandard / DataZoneStandard / Batch で単価が違う）
az cognitiveservices account deployment list -g $env:AZURE_RESOURCE_GROUP -n <ai-account> `
  --query "[].{name:name, model:properties.model.name, sku:sku.name}" -o table
```

確認したら [Azure OpenAI Service の価格](https://azure.microsoft.com/ja-jp/pricing/details/cognitive-services/openai-service/)
の該当行を引く。設定は **1000 トークンあたり**（価格表は 1M トークンあたりなので 1000 で割る）。

```json
"Usage": {
  "Enabled": true,
  "Currency": "USD",
  "JpyRate": 150,
  "Admins": [ "${USAGE_ADMIN_UPN}" ],
  "Pricing": {
    "<deployment-name>": { "Input": 0.0025, "CachedInput": 0.00025, "Output": 0.015 }
  }
}
```

- **キャッシュ入力は概ね入力の 1/10。** 同じ会話を続けるとプロンプトの前半がキャッシュに乗る。
  キャッシュ分を入力単価で二重に数えないよう、`CostOf` は「入力 − キャッシュ」に入力単価、
  キャッシュにキャッシュ単価を掛ける。
- **同じモデルでもコンテキスト長で単価が上がる**系列がある。長文を常用するなら高い側を採る。
- **通貨は USD のまま持つ。** Azure のメーターは USD 建てで、円換算は毎月変わるレート
  （前月末 2 営業日前のロンドン市場終値）で行われる。設定ファイルにレートを焼き込むと必ずズレる。
  円は `JpyRate` による固定換算の**併記**に留め、レポートにその旨を出す。
- 単価未設定でも壊れない。`CostOf` が `null` を返し、レポートはトークン数だけを出して
  「単価が未設定」と注記する。

> 1 ターンは数セントの世界。`N2` 固定だと `0.00 USD` に潰れて内訳の意味がなくなるので、
> 1 未満は小数 4 桁、円は 10 未満なら小数 1 桁に切り替える。

## 4. 個人別の利用量は個人情報として扱う

`group_by=actor` は「誰が何回使ったか」の一覧であり、**そのまま出すと勤務実態の可視化になる**。

- `Usage:Admins` に載っている人だけが全員分を見られる。
- それ以外の人には**本人の分だけ**を返し、絞っていることをレポートに明記する。
- `Usage:Admins` が**空だと全員が全員分を見られる**。導入時に必ず決める（既定に頼らない）。

## 5. 会話で引き出せるようにする

レポートは HTTP エンドポイントや別画面を作らず、**ツール 1 つ**で出す。
新しい UI を作らない分、Teams でもメールでも定期配信でも同じ答えが返る。

システム プロンプトに次を書く。

- 「先月いくら掛かった？」「誰が一番使ってる？」「何に時間を使ってる？」を
  `usage_report` の `period` / `group_by` に対応付ける
- **推測で答えず必ずツールを呼ぶ**
- 表を貼るだけで終わらせず、1〜2 文の解釈（偏り・増減・目立つツール）を添える
- **計測を入れた時点からの記録しかない**こと、Azure の請求では人別に分けられないことを正直に言う

## 6. 実装手順

```powershell
Copy-Item .github/skills/agent365/references/templates/UsageStore.template.cs src/<agent-name>-agent/UsageStore.cs
Copy-Item .github/skills/agent365/references/templates/UsageTools.template.cs src/<agent-name>-agent/UsageTools.cs

az webapp config appsettings set -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME --settings `
  Usage__Enabled=true Usage__StorePath=/home/data/usage Usage__Currency=USD Usage__JpyRate=150 `
  Usage__Admins__0=$env:USAGE_ADMIN_UPN
```

```csharp
builder.Services.AddSingleton<UsageStore>();
builder.Services.AddSingleton<UsageTools>();
```

`AgentBrain` 側は §2 の 3 点（`UsageMeter` / `try`-`finally` / `UsageContext`）と、
ツールセット構築時の 1 行。

```csharp
if (usage.Enabled)
{
    toolset.AddLocal(usageTools.CreateTools(userEmail));
}
```

## 7. 検証

- [ ] 何回かやり取りしたあと `%HOME%/data/usage/usage-YYYY-MM.jsonl` に 1 ターン 1 行で積まれている
- [ ] Teams で「今月の利用状況を教えて」と聞くとレポートが返る
- [ ] 「誰が一番使ってる？」で相手別、「どのツールが多い？」でツール別に切り替わる
- [ ] 単価を設定すると金額が出る。未設定ならトークン数だけ出て注記が付く
- [ ] `Usage:Admins` に載っていない人が聞くと**本人の分だけ**に絞られる
- [ ] 記録用ディレクトリを読み取り専用にしても**返信は返る**（警告ログのみ）

## 8. 制約（設計時に依頼者へ伝える）

- 記録は**計測を入れた時点から**。それ以前はさかのぼれない。
- 出るのは**モデルのトークン費用だけ**。App Service（定額）とコード実行サンドボックス
  （セッション時間課金）は含まれない。
- 円は固定レートの概算。**請求書の金額とは一致しない。**
- スケールアウトすると**インスタンスごとにファイルが分かれて集計が割れる**。
  `numberOfWorkers=1` を維持するか、保存先を共有ストアへ移す（B11 と同じ制約）。

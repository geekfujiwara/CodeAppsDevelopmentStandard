# 定期実行と定期配信（B11）

エージェントを「呼ばれたら答える人」から「決まった時間に自分から動く人」にするブロック。
**登録は会話の中で行い、実行は対話なしで完結し、成果物は本人が選んだ経路に届く。**

| 節 | 内容 |
|---|---|
| 1 | 何を解くブロックなのか |
| 2 | 実装（3 ファイル + 配線） |
| 3 | ホスティングの前提（Always On） |
| 4 | 登録の会話設計（頻度をこちらから提案する） |
| 5 | 実行時コンテキスト（人がいない場での書き方） |
| 6 | 配信経路（チャット / メール）の選び方 |
| 7 | 永続化と再起動時の取りこぼし |
| 8 | 切り分け |

---

## 1. 何を解くブロックなのか

R3 ウォッチャーと R4 まとめ役は「定期実行」を前提にしているが、これを
`BackgroundService` に**ハードコードすると運用で必ず詰まる**。

| ハードコードした場合 | B11 で解く |
|---|---|
| 頻度を変えるたびに再デプロイ | 会話で「平日 8 時に変えて」と言えば変わる |
| 配信先がコードに埋まる | 宛先とチャネルは登録時に決まる |
| 「一旦止めて」ができない | `delete_schedule` で止まる |
| 何が動いているか誰も分からない | `list_schedules` で本人が一覧できる |
| 動作確認のたびに翌朝まで待つ | `run_schedule_now` で 1 回流せる |

B11 は**スケジュールをデータとして持つ**。エージェントは自分の仕事を自分で登録・変更・削除する。

### ブロックの構成

| ファイル | 役割 |
|---|---|
| `ScheduleStore.cs` | 定期実行の永続化と次回実行時刻の算出。JST 固定 |
| `ScheduleTools.cs` | `list_schedules` / `create_schedule` / `delete_schedule` / `run_schedule_now` をローカル ツールとして公開 |
| `ScheduleWorker.cs` | 60 秒ごとに期限を見て、来たものを `AgentBrain` に流し、配信させる |

依存は **B2（ターン外のトークン）＋ B3（共有の頭脳）**。配信にチャットを使うなら **B9**、
メールを使うなら **B4** が要る。

---

## 2. 実装

```powershell
Copy-Item .github/skills/agent365/references/templates/ScheduleStore.template.cs  src/<agent>-agent/ScheduleStore.cs
Copy-Item .github/skills/agent365/references/templates/ScheduleTools.template.cs  src/<agent>-agent/ScheduleTools.cs
Copy-Item .github/skills/agent365/references/templates/ScheduleWorker.template.cs src/<agent>-agent/ScheduleWorker.cs
```

`Program.cs`:

```csharp
builder.Services.AddSingleton<ScheduleStore>();
builder.Services.AddSingleton<ScheduleTools>();
builder.Services.AddHostedService<ScheduleWorker>();
```

`AgentBrain.ConnectToolsAsync` の戻り値の直前:

```csharp
if (configuration.GetValue("Schedule:Enabled", true))
{
    toolset.AddLocal(schedules.CreateTools());
}
```

アプリ設定（`__` が階層区切り）:

```powershell
az webapp config appsettings set -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME --settings `
  Schedule__Enabled=true Schedule__TickSeconds=60 Schedule__CatchUpMinutes=180
```

| 設定 | 既定 | 意味 |
|---|---|---|
| `Schedule__Enabled` | `true` | ワーカーとツールの両方を止める |
| `Schedule__TickSeconds` | `60` | 期限判定の間隔（15〜900 秒で丸める） |
| `Schedule__CatchUpMinutes` | `180` | 停止中に過ぎた実行を、復帰後どこまで遡って流すか |
| `Schedule__StorePath` | `%HOME%/data/schedules.json` | 保存先。App Service では `%HOME%` が永続領域 |

**B11 は `MailboxWorker` と同じ型**（`BackgroundService` ＋ `AgenticTokenSource` ＋ `AgentBrain`）
なので、B6 を入れてあるなら追加の概念はほぼ無い。

---

## 3. ホスティングの前提

**この節を飛ばすと、コードが完壁でも一度も配信されない。**

B11 は `BackgroundService`、つまり**アプリのプロセスが生きている間だけ動く**。
App Service の Free / Shared（F1・D1）は **Always On 非対応**で、HTTP リクエストが
約 20 分来ないとアプリがアンロードされる。

| プラン | 8:00 の定期配信 |
|---|---|
| F1 / D1（Free / Shared） | **発火しない。** その時刻に誰かが話しかけていない限りプロセスが存在しない |
| B1 以上 + Always On | 常駐するので 60 秒ごとの期限判定が回る |

```powershell
az webapp config show -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME --query alwaysOn
# false なら
az appservice plan update -g $env:AZURE_RESOURCE_GROUP -n <plan> --sku B1
az webapp config set -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME --always-on true
```

これは **B6（受信トレイ監視）と B12（在席同期）にもそのまま当てはまる**。
ただし B6 は Teams のメッセージ受信が HTTP でアプリを起こすため、**時々動いてしまう**。
「メール処理は動いているのに定期配信だけ届かない」は、この差で説明がつく。
Always On が無いことに気づくのが遅れる典型例。

> `scripts/provision_selfhost.py` は F1/D1 を指定するとエラーで止まり、
> 作成時に Always On を自動で有効化する。既存環境は上のコマンドで確認する。

---

## 4. 登録の会話設計

### 頻度は聞かずに提案する

これが B11 の要。「どのくらいの頻度がいいですか？」と聞くと、依頼者は決められない。
**仕事の内容から自然な頻度を推定し、1 案として出して可否だけ取る。**

| 依頼者の言葉 | 出す案 |
|---|---|
| 「毎朝まとめて」 | 平日 8:00 / Teams チャット |
| 「競合の動きを追いたい」 | 平日 8:00 / Teams チャット（Web 検索を伴うので B10 も要る） |
| 「週次で報告して」 | 毎週月曜 9:00 / メール（転送されやすいので） |
| 「月初に締めて」 | 毎月 1 日 9:00 / メール |
| 「止まってる案件を見つけて」 | 平日 17:00 / Teams チャット（その日のうちに動ける時間） |

言い方の型:

> 平日 8:00 に、前日からの動きをまとめて Teams チャットへお送りする形でいかがでしょう。
> 頻度や時間、メールでの受け取りにも変更できます。

**選択肢を並べて丸投げしない。** 「毎日/平日/毎週のどれにしますか、時間は、宛先は、経路は」と
4 問続けて聞くのは、秘書の仕事の投げ返しになる。

### 確定させるのは 4 点だけ

| 項目 | 値 | 既定 |
|---|---|---|
| 頻度 | `daily` / `weekdays` / `weekly` + 曜日 / `monthly` + 日 | `weekdays` |
| 時刻 | JST の `HH:mm` | `08:00` |
| 配信方法 | `chat` / `mail` | `chat` |
| 宛先 | メール アドレス | 依頼した本人 |

宛先は実行時コンテキストに入っている依頼者のアドレスをそのまま使う。改めて聞かない。

### `instruction` は会話から切り離して書く

登録した内容は**翌朝この会話が無い状態で読まれる**。ここを外すと、数日後に中身の薄い配信が届く。

```
✗ さっき話していた件を調べてまとめて
✓ Dataverse の商談テーブルから、最終更新が 7 日以上前で、かつ状態が「進行中」の
  レコードを検索する。各件について、案件名・担当者・最終更新日・止まっている理由の推定を
  1 行ずつ書く。0 件なら「止まっている案件はありません」とだけ書く。
```

`create_schedule` の説明文で「その会話を読まなくても分かる指示文で書く」と明示しておくと、
モデルはこの形で書いてくる。

### 承認とテスト実行

- 「お願い」「それで」等の短い承認は**そのターンで `create_schedule` を呼ぶ**合図。聞き直さない。
- 登録できたら「平日 8:00 / Teams チャット / ◯◯さん宛」と 1 行で復唱する。一覧を貼らない。
- `run_schedule_now` は**実際に配信が飛ぶ**。使う前に必ずそう伝える。

---

## 5. 実行時コンテキスト（人がいない）

`ScheduleWorker` が組み立てるコンテキストで、外すと壊れる要素。

| 要素 | 理由 |
|---|---|
| 「画面の前に人はいない。確認しても誰も答えない」 | これが無いと「〇〇でよろしいですか？」でターンが終わり、何も届かない |
| 配信先とツールの**具体名**（`send_teams_chat_message` / `do_action /me/sendMail`） | 「送ってください」だけだと送らずに終える |
| 1 行目の見出し形式（`【件名】M/d (曜)`） | 受け手が定期配信だと即座に分かる |
| 分量の指定（10 行程度） | 指定しないと毎回長さが揺れる |
| 「取得できなかったものは想像で埋めない」 | 定期配信は検証されにくく、捏造が最も残りやすい |
| 「結果が空でも『該当なし』で配信する」 | 無言だと、動いているのか壊れているのか分からない |

`MailboxWorker` の実行時コンテキストと**同じ書き方**にすること。入口ごとに口調や判断が変わると、
受け手はすぐ気付く。

---

## 6. 配信経路

| 経路 | 向いている用途 | 実装 | 制約 |
|---|---|---|---|
| Teams チャット | 毎日読むもの、その場で反応してほしいもの | B9（`create_teams_chat` → `send_teams_chat_message`） | プレーン テキスト。取り消せない |
| メール | 週次・月次、転送・保管されるもの、社外に近い内容 | B4（`do_action` `/me/sendMail`） | 画像を貼れない。件名が要る |

- チャットは既存の 1 対 1 チャットがあればそこに続けて投稿される。毎回新しい会話にはならない。
- メールは `saveToSentItems: true` にして、送信済みに残す。「送ったはず」の調査コストが下がる。
- **同じ内容を複数人に一斉配信しない。** 宛先ごとに登録を分ける。誤爆時の影響範囲を切るため。

---

## 7. 永続化と取りこぼし

### 保存先

App Service の `%HOME%` は永続領域なので、`%HOME%/data/schedules.json` に置けば
**再起動でも再デプロイでも消えない**。データベースを 1 つ増やす価値が出るのは、
定期実行が数百件になるか、複数インスタンスで動かす段階から。

> **スケールアウトすると二重配信する。** インスタンスごとにファイルを持つため。
> B11 を入れるアプリは `numberOfWorkers=1` を維持するか、保存先を共有ストアへ移す。

### 取りこぼしの扱い

```
起動 → 各ジョブの次回実行を「今 - CatchUpMinutes」から算出
     → 最終実行より前になったら、最終実行から算出し直す
```

- 停止が `CatchUpMinutes`（既定 180 分）以内なら、過ぎた回は復帰後に配信される。
  `LastRunAt` との比較で同じ回の二重配信は防がれるので、この窓を広げても安全。
  朝のダイジェストが午後に届くのを避けたいので、180 分を上限の目安にする。
- それより長い停止では**その回は飛ぶ**。復旧後に `run_schedule_now` で補う。
- 期限が来たジョブは**取り出した瞬間に次回時刻へ進める**。実行が失敗しても、
  次の 60 秒で同じ配信が再送されることはない（＝ 二重配信より欠落を選ぶ）。

この選択は依頼者に先に伝える。「毎朝必ず届く」と期待されると、停止が事故になる。

---

## 8. 切り分け

| 症状 | 見るところ |
|---|---|
| 時間になっても何も届かない | **まず `az webapp config show --query alwaysOn`**。`false` なら §3。コードを疑う前にここ |
| 同上（Always On は true） | 起動ログの `Schedule worker checking every 60s` と `Schedule <id> ... next run ...`。後者が無ければ**そもそも登録されていない**（`list_schedules` で確認） |
| ワーカーは動くが実行されない | `Agentic identity unknown` の警告ログ。`Agentic__TenantId` / `InstanceId` / `UserId` を確認 |
| メール処理は動くのに定期配信だけ届かない | Always On が無い典型症状。B6 は受信がアプリを起こすが、定期実行を起こすものは無い |
| 実行はされたが届かない | ログの `Scheduled job … Result:` に理由が入る。多くは配信ツール未接続（B9 の同意漏れ） |
| 再起動のたびに登録が消える | `Schedule__StorePath` が一時領域を指している。`%HOME%` 配下か確認 |
| 同じ内容が 2 通届く | インスタンスが 2 つ以上動いている。`numberOfWorkers` を確認 |
| 時刻が 9 時間ずれる | JST 変換を通していない。ストア側は JST 固定、保存は UTC |
| 中身が薄い・毎回違う | `instruction` が会話依存になっている。`list_schedules` で本文を読み、書き直して登録し直す |

---

## 関連

- [digital-colleague-design.md](digital-colleague-design.md) §3（ブロック一覧）、§4（提案条件）、§7（L5）
- [assistant-agent-pattern.md](assistant-agent-pattern.md)（承認の解釈と品質基準）
- [web-grounding.md](web-grounding.md)（定期配信で社外情報を扱う場合）
- [agent-brain.md](agent-brain.md) §7-5（`BackgroundService` とターン外トークン）

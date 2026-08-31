// 登録された定期実行（B11）を時刻どおりに流し、結果を配信させるワーカー。
//
// MailboxWorker と同じ型（BackgroundService ＋ AgenticTokenSource ＋ AgentBrain）なので、
// B6 を入れてあるなら新しい概念はない。違いは実行時コンテキストだけ。
//
// このコンテキストから外せないのは次の 3 点（→ references/scheduled-delivery.md §4）:
//   - 「画面の前に人はいない。確認しても誰も答えない」
//   - 配信に使うツールの具体名（send_teams_chat_message / do_action /me/sendMail）
//   - 「結果が空でも『該当なし』として配信する」
//
// 前提となるプロジェクト側の型:
//   AgentBrain          … ConnectToolsAsync / CompleteAsync / Truncate
//   AgenticTokenSource  … ターン外でエージェンティック ユーザーのトークンを取る（B2）
//   ChatTurn / McpToolset
//
// Program.cs:
//   builder.Services.AddHostedService<ScheduleWorker>();
//
// アプリ設定（__ が階層区切り）:
//   Schedule__Enabled     = true
//   Schedule__TickSeconds = 60（15〜900 で丸められる）
//
// 配信に Teams チャットを使うなら B9、メールを使うなら B4 が先に入っていること。

using System.Text;

/// <summary>
/// Runs the schedules the agent set up for itself. Nobody is waiting on the other side, so the
/// brain is told to finish the work and deliver it in the same turn instead of asking anything.
/// </summary>
public sealed class ScheduleWorker(
    AgentBrain brain,
    AgenticTokenSource tokens,
    ScheduleStore store,
    IConfiguration configuration,
    ILogger<ScheduleWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Schedule:Enabled", true))
        {
            logger.LogInformation("Schedule worker disabled by configuration");
            return;
        }

        var interval = TimeSpan.FromSeconds(Math.Clamp(configuration.GetValue("Schedule:TickSeconds", 60), 15, 900));
        logger.LogInformation("Schedule worker checking every {Seconds}s", interval.TotalSeconds);

        // 登録内容と次回実行時刻を起動ログに残す。「届かない」の切り分けはここが起点になる。
        foreach (ScheduledJob job in store.All())
        {
            logger.LogInformation(
                "Schedule {Id} '{Title}' {Recurrence} → {Channel} {Recipient}; next run {Next}{State}",
                job.Id,
                job.Title,
                job.Recurrence,
                job.Channel,
                job.Recipient,
                ScheduleStore.ToLocalText(job.NextRunAt),
                job.Enabled ? string.Empty : " (disabled)");
        }

        using var timer = new PeriodicTimer(interval);
        do
        {
            try
            {
                await TickAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Schedule tick failed");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task TickAsync(CancellationToken cancellationToken)
    {
        if (tokens.Identity is null)
        {
            logger.LogWarning("Agentic identity unknown; scheduled jobs cannot run. Check the Agentic:* settings.");
            return;
        }

        List<ScheduledJob> due = store.ClaimDue(DateTimeOffset.UtcNow);
        if (due.Count == 0)
        {
            return;
        }

        logger.LogInformation("Running {Count} scheduled job(s)", due.Count);

        using McpToolset toolset = await brain.ConnectToolsAsync(tokens.GetTokenAsync, cancellationToken);
        foreach (ScheduledJob job in due)
        {
            try
            {
                await RunAsync(job, toolset, cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Scheduled job {Id} '{Title}' failed", job.Id, job.Title);
            }
        }
    }

    private async Task RunAsync(ScheduledJob job, McpToolset toolset, CancellationToken cancellationToken)
    {
        List<ChatTurn> history =
        [
            new ChatTurn { Role = "user", Text = $"定期実行「{job.Title}」の時間です。\n\n{job.Instruction}" },
        ];

        string summary = await brain.CompleteAsync(history, BuildContext(job, toolset), toolset, cancellationToken);
        logger.LogInformation(
            "Scheduled job {Id} '{Title}' delivered via {Channel} to {Recipient}. Next run {Next}. Result: {Summary}",
            job.Id,
            job.Title,
            job.Channel,
            job.Recipient,
            ScheduleStore.ToLocalText(job.NextRunAt),
            AgentBrain.Truncate(summary, 1500));
    }

    private static string BuildContext(ScheduledJob job, McpToolset toolset)
    {
        DateTimeOffset now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, ScheduleStore.Zone);
        string servers = toolset.Sessions.Count == 0
            ? "なし"
            : string.Join(" / ", toolset.Sessions.Select(s => s.ServerName));

        var delivery = new StringBuilder();
        if (job.Channel == "mail")
        {
            delivery.AppendLine($"   `do_action` `/me/sendMail` を使う。件名は「{job.Subject ?? job.Title}」、");
            delivery.AppendLine($"   宛先は `{job.Recipient}`。本文は");
            delivery.AppendLine("""
                   `{"message":{"subject":"…","body":{"contentType":"Text","content":"…"},"toRecipients":[{"emailAddress":{"address":"…"}}]},"saveToSentItems":true}`。
                   メールに画像は貼れないので `![…](…)` は書かない。改行は `<br>` ではなく通常の改行で書く。
                """);
        }
        else
        {
            delivery.AppendLine($"   `list_teams_chats` で `{job.Recipient}` との 1 対 1 チャットを探す。");
            delivery.AppendLine($"   無ければ `create_teams_chat`（members: [\"{job.Recipient}\"]）で作る。");
            delivery.AppendLine("   そのうえで `send_teams_chat_message` に本文を渡して送る。プレーン テキスト。");
        }

        return $$"""
            # 実行時コンテキスト（定期実行モード）
            - 現在日時: {{now:yyyy-MM-dd (ddd) HH:mm}} (JST)
            - これは登録済みの定期実行「{{job.Title}}」（{{job.Recurrence}}）の自動実行。
              **画面の前に人はいない**。確認や承認を求めても誰も答えない。自分で判断して最後までやりきる。
            - 接続中のデータ ソース: {{servers}}
            - ツールが動く資格情報: あなた自身（エージェント用アカウント）。`/me/…` はあなたのもの。
              他人の予定表を直接読む経路はテナント ポリシーで塞がれている。空き時間は `ask` に自然言語で聞く。

            # このターンの指示
            1. 依頼された内容をツールで調べ、配信する本文を日本語で書き上げる。
               - Web の情報が要るなら `web_search` を使い、出典のタイトルと URL を本文に残す。
               - 調べられなかった項目は、想像で埋めずに「取得できなかった」と書く。
            2. 本文の 1 行目は `【{{job.Title}}】{{now:M/d (ddd)}}` にする。そのあとに要点を箇条書きで並べる。
               長さは 10 行程度。読む人が朝いちで 30 秒で読み切れる分量にする。
            3. 書き上げた本文を **{{job.ChannelLabel}}で `{{job.Recipient}}` に必ず届ける**。
            {{delivery}}
            4. 送信できたら、何をどこへ送ったかを 1 行で報告する（この報告は人には届かないログ）。
               送信に失敗した場合は、失敗したことと理由を報告に書く。成功したように書かない。

            調べた結果が空でも配信は行い、「該当なし」と書いて送る。黙って終わらせない。
            """;
    }
}


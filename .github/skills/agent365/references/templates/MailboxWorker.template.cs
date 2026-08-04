// エージェント自身の受信トレイを監視し、Teams と同じ頭脳でメールに返信する。
//
// Agent 365 はエージェンティック ユーザー宛のメールをメッセージング エンドポイントへ
// 配送しない（Teams だけが push される）。そのため自分から見に行く。
//
// 前提となるプロジェクト側の型:
//   AgentBrain   … LLM + MCP ツール ループ。Teams のターン ハンドラーと共用する
//   McpClient    … CallToolRawAsync で生の結果（structuredContent 込み）を返せること
//   McpToolset   … ツール名からセッションを引ける SessionFor(name)
//   ChatTurn     … { Role, Text }
//
// 必要なアプリ設定:
//   Mailbox__Enabled     = true
//   Mailbox__PollSeconds = 60      （下限 30）
//   Agentic__*           … AgenticIdentity.template.cs を参照
//
// Program.cs:
//   builder.Services.AddHostedService<MailboxWorker>();

using System.Text.Json;

public sealed class MailboxWorker(
    AgentBrain brain,
    AgenticTokenSource tokens,
    McpClient mcp,
    IConfiguration configuration,
    ILogger<MailboxWorker> logger) : BackgroundService
{
    private const string InboxQuery =
        "/me/mailFolders/inbox/messages?$filter=isRead eq false and receivedDateTime ge {0}" +
        "&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,conversationId" +
        "&$top=5&$orderby=receivedDateTime desc";

    private static readonly TimeZoneInfo LocalZone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Tokyo");

    // Work IQ cannot mark mail as read (PATCH /me/messages is not in the policy allowlist),
    // so "already answered" is tracked here and mail older than this process is left alone.
    private readonly DateTimeOffset _startedAt = DateTimeOffset.UtcNow;
    private readonly HashSet<string> _handled = [];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Mailbox:Enabled", true))
        {
            logger.LogInformation("Mailbox worker disabled by configuration");
            return;
        }

        var interval = TimeSpan.FromSeconds(Math.Max(30, configuration.GetValue("Mailbox:PollSeconds", 120)));
        logger.LogInformation("Mailbox worker polling every {Seconds}s", interval.TotalSeconds);

        using var timer = new PeriodicTimer(interval);
        do
        {
            try
            {
                await SweepAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Mailbox sweep failed");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task SweepAsync(CancellationToken cancellationToken)
    {
        if (tokens.Identity is null)
        {
            logger.LogDebug("Agentic identity unknown; skipping sweep");
            return;
        }

        using McpToolset toolset = await brain.ConnectToolsAsync(tokens.GetTokenAsync, cancellationToken);
        McpSession session;
        try
        {
            session = toolset.SessionFor("fetch");
        }
        catch (InvalidOperationException)
        {
            logger.LogWarning("Work IQ 'fetch' unavailable; skipping sweep");
            return;
        }

        string query = string.Format(InboxQuery, _startedAt.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ"));
        string arguments = JsonSerializer.Serialize(new { entityUrls = new[] { query } });
        JsonElement raw = await mcp.CallToolRawAsync(session, "fetch", arguments, cancellationToken);

        List<MailHeader> fresh = ExtractMessages(raw).Where(m => !_handled.Contains(m.Id)).ToList();
        if (fresh.Count == 0)
        {
            return;
        }

        logger.LogInformation("Handling {Count} unread message(s)", fresh.Count);

        // Claim the messages up front: a failed sweep must not re-reply on the next tick.
        foreach (MailHeader message in fresh)
        {
            _handled.Add(message.Id);
        }
        if (_handled.Count > 500)
        {
            _handled.Clear();
        }

        string inbox = string.Join("\n", fresh.Select(m =>
            $"- id: {m.Id}\n  差出人: {m.From}\n  件名: {m.Subject}\n  受信: {m.Received}\n  冒頭: {m.Preview}"));

        List<ChatTurn> history =
        [
            new ChatTurn { Role = "user", Text = $"未読メールが {fresh.Count} 件あります。\n\n{inbox}\n\n1 件ずつ処理してください。" },
        ];

        string summary = await brain.CompleteAsync(history, BuildContext(toolset), toolset, cancellationToken);
        logger.LogInformation("Mail sweep result: {Summary}", AgentBrain.Truncate(summary, 1500));
    }

    // $$""" を使う。$""" の中では {{ がエスケープにならず CS9006 になる。
    private static string BuildContext(McpToolset toolset)
    {
        DateTimeOffset now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, LocalZone);
        string servers = toolset.Sessions.Count == 0
            ? "なし"
            : string.Join(" / ", toolset.Sessions.Select(s => s.ServerName));

        return $$"""
            # 実行時コンテキスト（メール処理モード）
            - 現在日時: {{now:yyyy-MM-dd (ddd) HH:mm}} (JST)
            - 場所: **あなた自身の受信トレイ**。相手は Teams ではなくメールで待っている。
            - 接続中のデータ ソース: {{servers}}
            - ツールが動く資格情報: あなた自身（エージェント用アカウント）。`/me/…` はあなたのもの。
              他人の予定表を直接読む経路（`getSchedule` / `findMeetingTimes` /
              `/users/<メール>/calendarView`）はテナント ポリシーで塞がれている。試さない。
              他人の空き時間は `ask` に自然言語で聞く。

            # このターンの指示
            渡された未読メールを 1 件ずつ、**ツールを使って最後まで処理しきる**。
            人間の承認を待てないので、確認を求めるだけで終わらせない。

            1. `fetch` `/me/messages/{id}?$select=subject,from,toRecipients,body` で本文を読む。
            2. 何を求められているか判断する。
               - **日程調整の依頼** → 参加者の空きは `ask` で調べ、候補を最大 3 つ出す。
                 日時・目的・所要時間が十分に決まっているなら `create_entity` `/me/events` で
                 会議を作り、その旨を返信する。足りない情報があるなら、**候補を添えたうえで**
                 その 1 点だけを返信で尋ねる。
               - **質問・依頼** → 分かる範囲で答える。調べられることはツールで調べてから答える。
               - **通知・広告・自動配信メールなど返信が不要なもの** → 何もしない。既読にもしない。
            3. 返信は `do_action` `/me/messages/{id}/reply`、本文は `{"comment":"…"}`。
               日本語の丁寧なビジネス メール。宛名 → 用件 → 候補や結論 → 結び、で 200 字程度。
               HTML タグは書かず、改行は `<br>` を使う。
            4. **メールを既読にはできない**（テナント ポリシーで `/me/messages` の PATCH が塞がれている）。
               `update_entity` を試さない。未読のままで正しい。
            5. 全件終えたら、何をしたかを 1 件 1 行で日本語で報告する（この報告は人に届かないログ）。

            返信せずに終える場合も、その理由を報告に含める。
            """;
    }

    // Work IQ は書き込み結果を structuredContent に入れる。content[].text しか見ないと取りこぼす。
    private static List<MailHeader> ExtractMessages(JsonElement result)
    {
        var found = new List<MailHeader>();

        if (result.TryGetProperty("structuredContent", out JsonElement structured))
        {
            Walk(structured, found, 0);
        }

        if (found.Count == 0 && result.TryGetProperty("content", out JsonElement content))
        {
            foreach (JsonElement part in content.EnumerateArray())
            {
                if (!part.TryGetProperty("text", out JsonElement text) || text.GetString() is not { } payload)
                {
                    continue;
                }

                try
                {
                    using JsonDocument document = JsonDocument.Parse(payload);
                    Walk(document.RootElement, found, 0);
                }
                catch (JsonException)
                {
                    // Work IQ sometimes answers in prose; nothing to claim from it.
                }
            }
        }

        return found;
    }

    private static void Walk(JsonElement element, List<MailHeader> found, int depth)
    {
        if (depth > 8)
        {
            return;
        }

        switch (element.ValueKind)
        {
            case JsonValueKind.Array:
                foreach (JsonElement item in element.EnumerateArray())
                {
                    Walk(item, found, depth + 1);
                }
                break;

            case JsonValueKind.Object:
                if (element.TryGetProperty("id", out JsonElement id)
                    && id.ValueKind == JsonValueKind.String
                    && element.TryGetProperty("subject", out JsonElement subject))
                {
                    found.Add(new MailHeader(
                        id.GetString()!,
                        subject.GetString() ?? "(件名なし)",
                        ReadSender(element),
                        Read(element, "receivedDateTime"),
                        Read(element, "bodyPreview")));
                    return;
                }

                foreach (JsonProperty property in element.EnumerateObject())
                {
                    Walk(property.Value, found, depth + 1);
                }
                break;
        }
    }

    private static string ReadSender(JsonElement message) =>
        message.TryGetProperty("from", out JsonElement from)
        && from.TryGetProperty("emailAddress", out JsonElement address)
            ? $"{Read(address, "name")} <{Read(address, "address")}>"
            : "(不明)";

    private static string Read(JsonElement element, string name) =>
        element.TryGetProperty(name, out JsonElement value) ? value.ToString() : string.Empty;

    private sealed record MailHeader(string Id, string Subject, string From, string Received, string Preview);
}

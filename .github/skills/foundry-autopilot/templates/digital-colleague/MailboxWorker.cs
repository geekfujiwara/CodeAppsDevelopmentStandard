// エージェント自身の受信トレイを監視し、Teams と同じ頭脳でメールに返信する（B6）。
//
// Agent 365 はエージェンティック ユーザー宛のメールをメッセージング エンドポイントへ
// 配送しない（Teams だけが push される）。そのため自分から見に行く。
//
// 必要なアプリ設定:
//   Mailbox__Enabled     = true
//   Mailbox__PollSeconds = 60      （下限 30）
//   Agentic__*           … AgenticIdentity.cs を参照

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

    // 既読にする経路が無いので「対応済み」はこのプロセスの中で覚えておき、起動前のメールには触れない。
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

        using McpToolset toolset = await brain.ConnectToolsAsync(tokens.GetTokenAsync, cancellationToken, includeMail: true);
        McpSession session;
        try
        {
            session = toolset.SessionFor("fetch");
        }
        catch (InvalidOperationException)
        {
            logger.LogWarning("No MCP server exposes a 'fetch' tool; skipping sweep. Configure Dataverse or Work IQ, or drop B6.");
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

        // One turn per sender: a batch shared by two people cannot be attributed to either of them.
        foreach (IGrouping<string?, MailHeader> sender in fresh.GroupBy(m => m.FromAddress, StringComparer.OrdinalIgnoreCase))
        {
            await AnswerAsync(sender.Key, [.. sender], toolset, cancellationToken);
        }
    }

    private async Task AnswerAsync(
        string? senderAddress,
        List<MailHeader> messages,
        McpToolset toolset,
        CancellationToken cancellationToken)
    {
        string inbox = string.Join("\n", messages.Select(m =>
            $"- id: {m.Id}\n  差出人: {m.From}\n  件名: {m.Subject}\n  受信: {m.Received}"
            + (m.MeetingKind is null ? string.Empty : $"\n  種別: {m.MeetingKind}")
            + $"\n  冒頭: {m.Preview}"));

        List<ChatTurn> history =
        [
            new ChatTurn { Role = "user", Text = $"未読メールが {messages.Count} 件あります。\n\n{inbox}\n\n1 件ずつ処理してください。" },
        ];

        string summary = await brain.CompleteAsync(
            history, BuildContext(toolset), toolset, cancellationToken,
            spentOn: new UsageContext("mailbox", senderAddress));
        logger.LogInformation("Mail sweep result for {Sender}: {Summary}",
            senderAddress ?? "(unknown sender)", AgentBrain.Truncate(summary, 1500));
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
               - **会議の招待**（一覧に `種別: 会議の招待` が付いているもの） → `respond_invite` で出欠を返す。
                 `reply_mail` で返信しない（主催者には出欠として届かない）。
               - **会議のキャンセル通知・他の人の出欠回答・予定表の通知** → 何もしない。
               - **質問・依頼** → 分かる範囲で答える。調べられることはツールで調べてから答える。
               - **通知・広告・自動配信メールなど返信が不要なもの** → 何もしない。既読にもしない。
            3. 返信の id には**一覧で渡された id だけ**を使う。本文を取得した応答に含まれる
               別の id（予定の id など）を渡すと必ず失敗する。
               返信は `reply_mail` を使う。**返信不要と判断したメールに返信ツールを呼ばない。**
            4. **メールを既読にはできない**（テナント ポリシーで塞がれている）。未読のままで正しい。
            5. 全件終えたら、何をしたかを 1 件 1 行で日本語で報告する（この報告は人に届かないログ）。

            返信せずに終える場合も、その理由を報告に含める。
            """;
    }

    // 一部の MCP サーバーは書き込み結果を structuredContent に入れる。content[].text しか見ないと取りこぼす。
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
                    // Some servers answer in prose; nothing to claim from it.
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
                        ReadSenderAddress(element),
                        Read(element, "receivedDateTime"),
                        Read(element, "bodyPreview"),
                        ReadMeetingKind(element)));
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

    /// <summary>The bare address, so mail usage lands under the same person as their Teams usage.</summary>
    private static string? ReadSenderAddress(JsonElement message)
    {
        if (message.TryGetProperty("from", out JsonElement from)
            && from.TryGetProperty("emailAddress", out JsonElement address))
        {
            string value = Read(address, "address");
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }

        return null;
    }

    private static string Read(JsonElement element, string name) =>
        element.TryGetProperty(name, out JsonElement value) ? value.ToString() : string.Empty;

    /// <summary>
    /// Invitations arrive as ordinary inbox items, so without this the model treats them as mail and
    /// tries to reply. Graph annotates the derived type on these items even when $select is used.
    /// </summary>
    private static string? ReadMeetingKind(JsonElement message)
    {
        string kind = Read(message, "meetingMessageType");
        string type = Read(message, "@odata.type");

        if (kind.Contains("Cancel", StringComparison.OrdinalIgnoreCase))
        {
            return "会議のキャンセル（返信不要）";
        }

        if (kind.Contains("Accepted", StringComparison.OrdinalIgnoreCase)
            || kind.Contains("Declined", StringComparison.OrdinalIgnoreCase)
            || type.Contains("eventMessageResponse", StringComparison.OrdinalIgnoreCase))
        {
            return "出欠の回答（返信不要）";
        }

        if (kind.Contains("Request", StringComparison.OrdinalIgnoreCase)
            || type.Contains("eventMessageRequest", StringComparison.OrdinalIgnoreCase))
        {
            return "会議の招待（respond_invite で出欠を返す）";
        }

        return type.Contains("eventMessage", StringComparison.OrdinalIgnoreCase) ? "予定表の通知" : null;
    }

    private sealed record MailHeader(
        string Id, string Subject, string From, string? FromAddress, string Received, string Preview,
        string? MeetingKind);
}

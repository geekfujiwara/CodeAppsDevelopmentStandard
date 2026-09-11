using System.Text.Json.Serialization;
using Azure.AI.OpenAI;
using Microsoft.Agents.Authentication;
using Microsoft.Agents.Builder;
using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Builder.State;
using Microsoft.Agents.Core.Models;
using Microsoft.Agents.Extensions.Teams.Connector;
using Microsoft.Agents.Extensions.Teams.Models;
using OpenAI.Chat;

/// <summary>The Teams turn handler (B1). Shares the brain (B3) with every other entry point.</summary>
public class Agent : AgentApplication
{
    private static readonly TimeZoneInfo JapanTimeZone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Tokyo");

    private readonly AgentBrain _brain;
    private readonly IConnections _connections;
    private readonly AgenticIdentityStore _identities;
    private readonly ConversationMemory _memory;
    private readonly Audience _audience;
    // GEEK:BLOCK:B14:START
    private readonly DocumentLedger _ledger;
    // GEEK:BLOCK:B14:END
    // GEEK:BLOCK:B16:START
    private readonly IncomingFiles _files;
    // GEEK:BLOCK:B16:END
    private readonly IConfiguration _configuration;
    private readonly ILogger<Agent> _logger;

    public Agent(
        AgentApplicationOptions options,
        AgentBrain brain,
        IConnections connections,
        AgenticIdentityStore identities,
        ConversationMemory memory,
        Audience audience,
        // GEEK:BLOCK:B14:START
        DocumentLedger ledger,
        // GEEK:BLOCK:B14:END
        // GEEK:BLOCK:B16:START
        IncomingFiles files,
        // GEEK:BLOCK:B16:END
        IConfiguration configuration,
        ILogger<Agent> logger) : base(options)
    {
        _brain = brain;
        _connections = connections;
        _identities = identities;
        _memory = memory;
        _audience = audience;
        // GEEK:BLOCK:B14:START
        _ledger = ledger;
        // GEEK:BLOCK:B14:END
        // GEEK:BLOCK:B16:START
        _files = files;
        // GEEK:BLOCK:B16:END
        _configuration = configuration;
        _logger = logger;

        OnConversationUpdate(ConversationUpdateEvents.MembersAdded, WelcomeAsync);
        OnActivity(ActivityTypes.Message, OnMessageAsync, rank: RouteRank.Last);
    }

    private async Task WelcomeAsync(ITurnContext turnContext, ITurnState turnState, CancellationToken cancellationToken)
    {
        foreach (ChannelAccount member in turnContext.Activity.MembersAdded ?? [])
        {
            if (member.Id != turnContext.Activity.Recipient?.Id)
            {
                await turnContext.SendActivityAsync(
                    MessageFactory.Text(_brain.Prompt.Greeting),
                    cancellationToken);
            }
        }
    }

    private async Task OnMessageAsync(ITurnContext turnContext, ITurnState turnState, CancellationToken cancellationToken)
    {
        _identities.Observe(turnContext.Activity);

        // GEEK:BLOCK:B16:START
        IReadOnlyList<IncomingFile> attached = await _files.CollectAsync(turnContext, cancellationToken);
        // GEEK:BLOCK:B16:END

        string userText = (turnContext.Activity.RemoveRecipientMention() ?? string.Empty).Trim();
        if (userText.Length == 0)
        {
            // GEEK:BLOCK:B16:START
            if (attached.Count == 0)
            {
            // GEEK:BLOCK:B16:END
                await turnContext.SendActivityAsync(
                    "テキストが読み取れませんでした。お手数ですが本文でご依頼ください。",
                    cancellationToken: cancellationToken);
                return;
            // GEEK:BLOCK:B16:START
            }

            userText = "添付したファイルを見てください。";
            // GEEK:BLOCK:B16:END
        }

        if (userText.StartsWith("/dv", StringComparison.OrdinalIgnoreCase))
        {
            await ReportToolsAsync(turnContext, cancellationToken);
            return;
        }

        if (userText.StartsWith("/schema", StringComparison.OrdinalIgnoreCase))
        {
            await ReportSchemaAsync(turnContext, userText["/schema".Length..].Trim(), cancellationToken);
            return;
        }

        if (userText.StartsWith("/call", StringComparison.OrdinalIgnoreCase))
        {
            await CallToolRawAsync(turnContext, userText["/call".Length..].Trim(), cancellationToken);
            return;
        }

        string conversationId = turnContext.Activity.Conversation?.Id ?? "unknown";
        List<ChatTurn> history = await _memory.LoadAsync(conversationId, cancellationToken);
        var turn = new ChatTurn { Role = "user", Text = userText };
        // GEEK:BLOCK:B16:START
        if (attached.Count > 0)
        {
            turn.Text += "\n\n" + await _files.StageAsync(conversationId, attached, cancellationToken);
            turn.Images = [.. attached.Where(file => file.IsImage)];
        }
        // GEEK:BLOCK:B16:END

        history.Add(turn);

        await using AgentProgress? progress = AgentProgress.ForTurn(turnContext, _configuration, _logger);
        progress?.Start(cancellationToken);

        // Resolved first: the document sharing tools refuse a consent decision unless they know
        // the speaker is the person who asked for the file.
        string? userEmail = await ResolveUserEmailAsync(turnContext, cancellationToken);
        McpToolset toolset = await ConnectToolsAsync(turnContext, cancellationToken, progress, userEmail);

        // The Graph lookup above can fail (throttling, missing permission, group chat quirks) even
        // though the activity itself always carries the sender's display name from the Teams channel.
        // Usage/eval labeling only needs something a human can recognize, not a verified identity,
        // so it falls back to that name instead of leaving the row unattributed.
        string? actorLabel = userEmail ?? turnContext.Activity.From?.Name;

        string reply;
        try
        {
            reply = await _brain.CompleteAsync(
                RecentTurns(history), BuildContext(turnContext, toolset, userEmail), toolset, cancellationToken, progress,
                spentOn: new UsageContext("chat", actorLabel));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Chat completion failed");
            reply = $"申し訳ありません。応答の生成に失敗しました。({ex.GetType().Name}: {ex.Message})";
            history.RemoveAt(history.Count - 1);
            if (progress is not null)
            {
                await progress.StopAsync();
            }

            await turnContext.SendActivityAsync(reply, cancellationToken: cancellationToken);
            await _memory.SaveAsync(conversationId, history, cancellationToken);
            return;
        }
        finally
        {
            toolset.Dispose();
            if (progress is not null)
            {
                await progress.StopAsync();
            }
        }

        history.Add(new ChatTurn { Role = "assistant", Text = reply });
        await _memory.SaveAsync(conversationId, history, cancellationToken);

        await SendReplyAsync(turnContext, reply, cancellationToken);
    }

    /// <summary>Image links in the reply are re-sent as attachments so Teams shows them inline.</summary>
    private static async Task SendReplyAsync(ITurnContext turnContext, string reply, CancellationToken cancellationToken)
    {
        (string text, List<Attachment> images) = ReplyImages.Split(reply);
        if (images.Count == 0)
        {
            await turnContext.SendActivityAsync(text, cancellationToken: cancellationToken);
            return;
        }

        IActivity activity = MessageFactory.Text(text);
        activity.Attachments = images;
        await turnContext.SendActivityAsync(activity, cancellationToken);
    }

    private List<ChatTurn> RecentTurns(List<ChatTurn> history) =>
        history.Count <= _memory.MaxPromptMessages
            ? history
            : history.GetRange(history.Count - _memory.MaxPromptMessages, _memory.MaxPromptMessages);

    /// <summary>Opens a session against every configured MCP server, as the agentic user.</summary>
    private Task<McpToolset> ConnectToolsAsync(
        ITurnContext turnContext,
        CancellationToken cancellationToken,
        AgentProgress? progress = null,
        string? userEmail = null)
    {
        var authorization = new AgenticAuthorization(_connections);
        return _brain.ConnectToolsAsync(
            async (scope, ct) => await authorization.GetAgenticUserTokenAsync(turnContext, [scope], ct),
            cancellationToken,
            sessionKey: turnContext.Activity.Conversation?.Id,
            progress: progress,
            userEmail: userEmail);
    }

    /// <summary>Diagnostics: shows which servers connected and what tools they offer.</summary>
    private async Task ReportToolsAsync(ITurnContext turnContext, CancellationToken cancellationToken)
    {
        using McpToolset toolset = await ConnectToolsAsync(turnContext, cancellationToken);
        if (toolset.Tools.Count == 0)
        {
            await turnContext.SendActivityAsync("どの MCP サーバーにも接続できませんでした。", cancellationToken: cancellationToken);
            return;
        }

        string report = string.Join("\n", toolset.Sessions.Select(s =>
            $"**{s.ServerName}**\n" + string.Join("\n", toolset.ToolsOf(s).Select(t => $"- {t.Name}"))));

        if (toolset.LocalTools.Any())
        {
            report += "\n**ローカル ツール**\n"
                + string.Join("\n", toolset.LocalTools.Select(t => $"- {t.Name}"));
        }

        await turnContext.SendActivityAsync($"接続済み ({toolset.Tools.Count} tools)\n\n{report}",
            cancellationToken: cancellationToken);
    }

    /// <summary>Diagnostics: dumps a tool's declared input schema so prompts can be written against it.</summary>
    private async Task ReportSchemaAsync(ITurnContext turnContext, string toolName, CancellationToken cancellationToken)
    {
        using McpToolset toolset = await ConnectToolsAsync(turnContext, cancellationToken);

        if (toolName.Length == 0)
        {
            await turnContext.SendActivityAsync(
                "ツール名を指定してください。例: `/schema do_action`\n\n" +
                string.Join(", ", toolset.Tools.Select(t => t.Name)),
                cancellationToken: cancellationToken);
            return;
        }

        McpToolDefinition? tool = toolset.Tools.FirstOrDefault(
            t => string.Equals(t.Name, toolName, StringComparison.OrdinalIgnoreCase));

        if (tool is null)
        {
            await turnContext.SendActivityAsync($"ツール `{toolName}` は見つかりません。", cancellationToken: cancellationToken);
            return;
        }

        string schema = Truncate(tool.InputSchema.GetRawText(), 5000);
        await turnContext.SendActivityAsync(
            $"**{tool.Name}**\n{Truncate(tool.Description, 1500)}\n\n```json\n{schema}\n```",
            cancellationToken: cancellationToken);
    }

    /// <summary>Diagnostics: invokes a tool with raw JSON so the unfiltered server error is visible.</summary>
    private async Task CallToolRawAsync(ITurnContext turnContext, string argument, CancellationToken cancellationToken)
    {
        int split = argument.IndexOf(' ');
        if (split <= 0)
        {
            await turnContext.SendActivityAsync(
                "使い方: `/call <tool> <json>`\n例: `/call fetch {\"url\":\"/me/events?$top=1\"}`",
                cancellationToken: cancellationToken);
            return;
        }

        string toolName = argument[..split];
        string argumentsJson = argument[split..].Trim();

        using McpToolset toolset = await ConnectToolsAsync(turnContext, cancellationToken);

        string result;
        try
        {
            result = await _brain.CallToolAsync(toolset, toolName, argumentsJson, cancellationToken);
        }
        catch (Exception ex)
        {
            result = $"{ex.GetType().Name}: {ex.Message}";
        }

        await turnContext.SendActivityAsync(
            $"**{toolName}**\n\n```\n{Truncate(result, 5000)}\n```",
            cancellationToken: cancellationToken);
    }

    /// <summary>Teams is the only channel that can resolve the requester's SMTP address.</summary>
    private async Task<string?> ResolveUserEmailAsync(ITurnContext turnContext, CancellationToken cancellationToken)
    {
        string? userId = turnContext.Activity.From?.Id;
        if (string.IsNullOrEmpty(userId))
        {
            return null;
        }

        try
        {
            TeamsChannelAccount member = await TeamsInfo.GetMemberAsync(turnContext, userId, cancellationToken);
            return string.IsNullOrEmpty(member?.Email) ? member?.UserPrincipalName : member.Email;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not resolve requester email");
            return null;
        }
    }

    /// <summary>Per-turn facts the model cannot infer from the static prompt.</summary>
    private string BuildContext(ITurnContext turnContext, McpToolset toolset, string? userEmail)
    {
        DateTimeOffset now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, JapanTimeZone);
        string userName = turnContext.Activity.From?.Name ?? "不明";
        List<string> sources = toolset.Sessions.Select(s => s.ServerName).ToList();
        if (toolset.LocalTools.Any())
        {
            sources.Add("ローカル ツール");
        }
        string servers = sources.Count == 0
            ? "なし（この会話では社内データを参照できない）"
            : string.Join(" / ", sources);
        string mail = string.IsNullOrEmpty(userEmail)
            ? "不明（必要なら本人に尋ねる）"
            : userEmail;

        string approvals = string.Empty;
        // GEEK:BLOCK:B14:START
        // A file waiting on this person's word is easy to forget once the chat moves on.
        IReadOnlyList<ShareRequest> pending = _ledger.PendingFor(userEmail);
        approvals = pending.Count == 0
            ? string.Empty
            : "\n\n            # この人の返事を待っている共有申請\n"
              + string.Join("\n", pending.Select(r => "            " + r.Describe().Replace("\n", "\n            ")))
              + "\n            この話題に触れられたら decide_share で記録する。"
              + "用件が別なら、返事の最後に一言添える程度にとどめる。";
        // GEEK:BLOCK:B14:END

        return $"""
            # 実行時コンテキスト
            - 現在日時: {now:yyyy-MM-dd (ddd) HH:mm} (JST)
            - 話しかけている人: {userName}
            - その人のメール アドレス: {mail}
            - 相手の区分: {_audience.Label(userEmail)}
            - 文体: {_audience.ToneRules(userEmail)}
            - 場所: Microsoft Teams のチャット
            - 接続中のデータ ソース: {servers}
            - ツールが動く資格情報: あなた自身（エージェント用アカウント）。
              他人の予定表を直接読む経路（`getSchedule` / `findMeetingTimes` /
              `/users/<メール>/calendarView`）はテナント ポリシーで塞がれている。試さない。
              他人の空き時間は `ask` に自然言語で聞く。例:「{userName}さんの明日の空き時間を教えて」。

            この情報は日時や相手の呼び方、できることの判断に使う。ユーザーへそのまま列挙しない。{approvals}
            """;
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max] + "\n…(以下省略)";
}

public sealed record McpServerConfig(
    string Name,
    string Endpoint,
    string Scope,
    IReadOnlySet<string> BlockedTools,
    string? ApiKey = null,
    string? ApiKeyHeader = null,
    bool AppOnly = false);

/// <summary>A tool the agent runs in-process instead of over MCP.</summary>
public sealed record LocalTool(
    McpToolDefinition Definition,
    Func<System.Text.Json.JsonElement, CancellationToken, Task<string>> Invoke);

/// <summary>The MCP sessions open for one turn, plus the tool-name to session routing.</summary>
public sealed class McpToolset : IDisposable
{
    private readonly List<McpSession> _sessions = [];
    private readonly List<McpToolDefinition> _tools = [];
    private readonly Dictionary<string, McpSession> _routing = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, LocalTool> _local = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _localProvider = new(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyList<McpSession> Sessions => _sessions;
    public IReadOnlyList<McpToolDefinition> Tools => _tools;
    public IEnumerable<McpToolDefinition> LocalTools => _local.Values.Select(t => t.Definition);

    public void Add(McpSession session, IReadOnlyList<McpToolDefinition> tools)
    {
        _sessions.Add(session);
        foreach (McpToolDefinition tool in tools)
        {
            // First server wins: the model can only see one tool per name.
            if (_routing.TryAdd(tool.Name, session))
            {
                _tools.Add(tool);
            }
        }
    }

    public void AddLocal(string provider, IEnumerable<LocalTool> tools)
    {
        foreach (LocalTool tool in tools)
        {
            if (_routing.ContainsKey(tool.Definition.Name) || !_local.TryAdd(tool.Definition.Name, tool))
            {
                continue;
            }

            _localProvider[tool.Definition.Name] = provider;
            _tools.Add(tool.Definition);
        }
    }

    public bool TryGetLocal(string toolName, out LocalTool tool) =>
        _local.TryGetValue(toolName, out tool!);

    public IEnumerable<McpToolDefinition> ToolsOf(McpSession session) =>
        _tools.Where(t => _routing.TryGetValue(t.Name, out McpSession? owner) && owner == session);

    /// <summary>Where a tool came from, for reporting. Never throws: unknown names still need a label.</summary>
    public string ServerOf(string toolName) =>
        _routing.TryGetValue(toolName, out McpSession? session) ? session.ServerName
        : _localProvider.TryGetValue(toolName, out string? provider) ? provider
        : "不明";

    public McpSession SessionFor(string toolName) =>
        _routing.TryGetValue(toolName, out McpSession? session)
            ? session
            : throw new InvalidOperationException($"未知のツール: {toolName}");

    public void Dispose()
    {
        foreach (McpSession session in _sessions)
        {
            session.Dispose();
        }
    }
}

public class ChatTurn
{
    public string Role { get; set; } = "user";
    public string Text { get; set; } = string.Empty;

    /// <summary>Only ever set on the turn being sent now: image bytes are far too big to keep in the transcript.</summary>
    [JsonIgnore]
    public IReadOnlyList<IncomingFile> Images { get; set; } = [];
}

/// <summary>
/// A file the user put on their message. Kept as a base type (independent of B16's fetch/stage
/// logic) because <see cref="ChatTurn.Images"/> needs it to exist even when B16 is not selected.
/// </summary>
public sealed record IncomingFile(string Name, string ContentType, byte[] Bytes)
{
    private static readonly string[] Viewable = ["image/png", "image/jpeg", "image/gif", "image/webp"];

    /// <summary>Only the formats the model can actually look at; anything else would fail the whole turn.</summary>
    public bool IsImage => Viewable.Contains(ContentType, StringComparer.OrdinalIgnoreCase);
}

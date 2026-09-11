using System.Diagnostics;
using System.Text.Json;
using Azure.AI.OpenAI;
using Azure.Core;
using OpenAI.Chat;

/// <summary>
/// The model + MCP tool loop, shared by the Teams turn handler and every background worker.
/// The only difference between callers is how they obtain the agentic user token.
/// </summary>
public sealed class AgentBrain(
    ChatClient chatClient,
    AgentPrompt prompt,
    McpClient mcp,
    // GEEK:BLOCK:B9:START
    TeamsChatTools teamsChat,
    // GEEK:BLOCK:B9:END
    // GEEK:BLOCK:B10:START
    WebSearchTools webSearch,
    // GEEK:BLOCK:B10:END
    // GEEK:BLOCK:B17:START
    ImageGenerationTools imageGeneration,
    // GEEK:BLOCK:B17:END
    // GEEK:BLOCK:B14:START
    DocumentShareTools documentShare,
    // GEEK:BLOCK:B14:END
    // GEEK:BLOCK:B6:START
    MailTools mail,
    // GEEK:BLOCK:B6:END
    // GEEK:BLOCK:B11:START
    ScheduleTools schedules,
    // GEEK:BLOCK:B11:END
    // GEEK:BLOCK:B12:START
    SandboxTools sandbox,
    // GEEK:BLOCK:B12:END
    TokenCredential appCredential,
    UsageStore usage,
    UsageTools usageTools,
    EvaluationLog evaluation,
    IConfiguration configuration,
    ILogger<AgentBrain> logger)
{
    private const int MaxToolResultLength = 8000;
    private const string GraphScope = "https://graph.microsoft.com/.default";

    private int MaxToolIterations => configuration.GetValue("Agent:MaxToolIterations", 24);

    public AgentPrompt Prompt { get; } = prompt;

    public IEnumerable<McpServerConfig> ConfiguredServers()
    {
        string? dataverseUrl = configuration["Dataverse:Url"]?.TrimEnd('/');
        if (!string.IsNullOrEmpty(dataverseUrl))
        {
            yield return new McpServerConfig(
                "Dataverse",
                $"{dataverseUrl}/api/mcp",
                $"{dataverseUrl}/.default",
                new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                {
                    "create_table", "update_table", "delete_table",
                    "delete_record", "upsert_skill", "delete_skill",
                    "init_file_upload", "commit_file_upload", "file_download",
                });
        }

        string? workIqEndpoint = configuration["WorkIQ:Endpoint"];
        if (!string.IsNullOrEmpty(workIqEndpoint))
        {
            yield return new McpServerConfig(
                "Work IQ",
                workIqEndpoint,
                configuration["WorkIQ:Scope"] ?? "api://workiq.svc.cloud.microsoft/.default",
                new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "delete_entity" });
        }

        // Web IQ takes either an account API key or an Entra app-only token; without one it stays offline.
        string? webIqKey = configuration["WebIQ:ApiKey"];
        string? webIqScope = configuration["WebIQ:Scope"];
        if (!string.IsNullOrEmpty(webIqKey) || !string.IsNullOrEmpty(webIqScope))
        {
            yield return new McpServerConfig(
                "Web IQ",
                configuration["WebIQ:Endpoint"] ?? "https://api.microsoft.ai/v3/mcp",
                webIqScope ?? "https://api.microsoft.ai/.default",
                new HashSet<string>(StringComparer.OrdinalIgnoreCase),
                ApiKey: webIqKey,
                ApiKeyHeader: string.IsNullOrEmpty(webIqKey) ? null : "x-apikey",
                AppOnly: true);
        }
    }

    /// <summary>Opens a session against every configured MCP server, as the agentic user.</summary>
    public async Task<McpToolset> ConnectToolsAsync(
        Func<string, CancellationToken, Task<string?>> tokenForScope,
        CancellationToken cancellationToken,
        bool includeTeamsChat = true,
        string? sessionKey = null,
        AgentProgress? progress = null,
        bool includeMail = false,
        string? userEmail = null,
        bool includeImageGeneration = true)
    {
        var toolset = new McpToolset();

        foreach (McpServerConfig server in ConfiguredServers())
        {
            try
            {
                string? token = server.ApiKey is { Length: > 0 }
                    ? server.ApiKey
                    : server.AppOnly
                        ? await AppTokenAsync(server.Scope, cancellationToken)
                        : await tokenForScope(server.Scope, cancellationToken);
                if (string.IsNullOrEmpty(token))
                {
                    logger.LogWarning("No agentic user token for {Server}", server.Name);
                    continue;
                }

                McpSession session = await mcp.ConnectAsync(
                    server.Name, server.Endpoint, token, cancellationToken, server.ApiKeyHeader);
                toolset.Add(session, await mcp.ListToolsAsync(session, server.BlockedTools, cancellationToken));
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "MCP connect failed for {Server}", server.Name);
            }
        }

        bool wantsTeamsChat = false;
        bool wantsDocumentShare = false;
        bool wantsSandbox = false;
        bool wantsMail = false;
        bool wantsImageGeneration = false;

        // GEEK:BLOCK:B9:START
        wantsTeamsChat = includeTeamsChat && configuration.GetValue("TeamsChat:Enabled", true);
        // GEEK:BLOCK:B9:END
        // GEEK:BLOCK:B14:START
        wantsDocumentShare = configuration.GetValue("Documents:Enabled", true);
        // GEEK:BLOCK:B14:END
        // GEEK:BLOCK:B12:START
        wantsSandbox = configuration.GetValue("Sandbox:Enabled", true) && sandbox.IsConfigured;
        // GEEK:BLOCK:B12:END
        // GEEK:BLOCK:B6:START
        wantsMail = includeMail && configuration.GetValue("Mail:Enabled", true);
        // GEEK:BLOCK:B6:END
        // GEEK:BLOCK:B17:START
        wantsImageGeneration = includeImageGeneration
            && configuration.GetValue("ImageGeneration:Enabled", false)
            && imageGeneration.IsConfigured;
        // GEEK:BLOCK:B17:END

        if (wantsTeamsChat || wantsDocumentShare || wantsSandbox || wantsMail || wantsImageGeneration)
        {
            try
            {
                string? graphToken = await tokenForScope(GraphScope, cancellationToken);
                if (string.IsNullOrEmpty(graphToken))
                {
                    logger.LogWarning("No agentic user token for Microsoft Graph; Graph-backed tools unavailable");
                }
                else
                {
                    // GEEK:BLOCK:B9:START
                    if (wantsTeamsChat)
                    {
                        toolset.AddLocal("Teams チャット", teamsChat.CreateTools(graphToken));
                    }
                    // GEEK:BLOCK:B9:END

                    // GEEK:BLOCK:B14:START
                    if (wantsDocumentShare)
                    {
                        // The consent gate needs to know who is speaking, so it can refuse a decision
                        // made by anyone other than the person who asked for the file.
                        toolset.AddLocal("ファイル共有", documentShare.CreateTools(graphToken, userEmail));
                    }
                    // GEEK:BLOCK:B14:END

                    // GEEK:BLOCK:B17:START
                    if (wantsImageGeneration)
                    {
                        toolset.AddLocal("画像生成", imageGeneration.CreateTools(graphToken, userEmail));
                    }
                    // GEEK:BLOCK:B17:END

                    // GEEK:BLOCK:B6:START
                    if (wantsMail)
                    {
                        toolset.AddLocal("メール", mail.CreateTools(graphToken));
                    }
                    // GEEK:BLOCK:B6:END
                }

                // GEEK:BLOCK:B12:START
                if (wantsSandbox)
                {
                    toolset.AddLocal("サンドボックス", sandbox.CreateTools(graphToken, sessionKey));
                }
                // GEEK:BLOCK:B12:END
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Graph token acquisition failed; Graph-backed tools unavailable");
            }
        }

        if (configuration.GetValue("WebSearch:Enabled", true))
        {
            // GEEK:BLOCK:B10:START
            if (webSearch.IsConfigured)
            {
                toolset.AddLocal("Web 検索", webSearch.CreateTools());
            }
            // GEEK:BLOCK:B10:END
        }

        // GEEK:BLOCK:B11:START
        if (configuration.GetValue("Schedule:Enabled", true))
        {
            toolset.AddLocal("定期実行", schedules.CreateTools());
        }
        // GEEK:BLOCK:B11:END

        if (usage.Enabled)
        {
            toolset.AddLocal("使用状況", usageTools.CreateTools(userEmail));
        }

        if (progress is not null)
        {
            toolset.AddLocal("進捗報告", progress.CreateTools());
        }

        return toolset;
    }

    /// <summary>Web IQ authenticates the application itself, not the agentic user.</summary>
    private async Task<string> AppTokenAsync(string scope, CancellationToken cancellationToken) =>
        (await appCredential.GetTokenAsync(new TokenRequestContext([scope]), cancellationToken)).Token;

    public async Task<string> CallToolAsync(McpToolset toolset, string toolName, string argumentsJson, CancellationToken cancellationToken)
    {
        if (toolset.TryGetLocal(toolName, out LocalTool? local))
        {
            JsonElement arguments = JsonSerializer.Deserialize<JsonElement>(
                string.IsNullOrWhiteSpace(argumentsJson) ? "{}" : argumentsJson);
            return await local.Invoke(arguments, cancellationToken);
        }

        return await mcp.CallToolAsync(toolset.SessionFor(toolName), toolName, argumentsJson, cancellationToken);
    }

    public async Task<string> CompleteAsync(
        IReadOnlyList<ChatTurn> history,
        string context,
        McpToolset toolset,
        CancellationToken cancellationToken,
        AgentProgress? progress = null,
        UntrustedContent? untrusted = null,
        UsageContext? spentOn = null)
    {
        UntrustedContent fence = untrusted ?? new UntrustedContent();

        List<ChatMessage> messages =
        [
            new SystemChatMessage(Prompt.SystemPrompt),
            new SystemChatMessage(fence.Briefing),
            new SystemChatMessage(context),
        ];

        foreach (ChatTurn turn in history)
        {
            messages.Add(turn.Role == "assistant"
                ? new AssistantChatMessage(turn.Text)
                : UserMessage(turn));
        }

        var options = new ChatCompletionOptions();
        foreach (McpToolDefinition tool in toolset.Tools)
        {
            options.Tools.Add(ChatTool.CreateFunctionTool(
                tool.Name,
                tool.Description,
                BinaryData.FromString(tool.InputSchema.GetRawText())));
        }

        var meter = new UsageMeter(spentOn, configuration["AzureOpenAI:Deployment"] ?? "unknown");
        List<EvaluationToolCall> attempted = [];
        string reply = "データの照会が規定回数を超えました。条件を絞ってもう一度お試しください。";
        try
        {
            for (int iteration = 0; iteration < MaxToolIterations; iteration++)
            {
                ChatCompletion completion = await chatClient.CompleteChatAsync(messages, options, cancellationToken);
                meter.Add(completion);
                if (completion.FinishReason != ChatFinishReason.ToolCalls || completion.ToolCalls.Count == 0)
                {
                    reply = string.Concat(completion.Content.Select(part => part.Text)).Trim();
                    break;
                }

                messages.Add(new AssistantChatMessage(completion));
                if (progress is not null)
                {
                    await progress.StepAsync(completion.ToolCalls.Select(call => call.FunctionName), cancellationToken);
                }

                foreach (ChatToolCall call in completion.ToolCalls)
                {
                    meter.AddTool(call.FunctionName);
                    attempted.Add(new EvaluationToolCall(
                        call.Id, call.FunctionName, toolset.ServerOf(call.FunctionName), call.FunctionArguments.ToString()));
                    string result;
                    try
                    {
                        result = await CallToolAsync(toolset, call.FunctionName, call.FunctionArguments.ToString(), cancellationToken);
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "MCP tool {Tool} failed", call.FunctionName);
                        result = $"ツール呼び出しに失敗しました: {ex.Message}";
                    }

                    if (result.StartsWith("ツールがエラーを返しました", StringComparison.Ordinal))
                    {
                        logger.LogWarning("Tool {Tool} rejected. args={Args} result={Result}",
                            call.FunctionName,
                            Truncate(call.FunctionArguments.ToString(), 600),
                            Truncate(result, 600));
                    }

                    string payload = fence.WrapToolResult(
                        call.FunctionName, Truncate(result, MaxToolResultLength), out string? suspicious);
                    if (suspicious is not null)
                    {
                        logger.LogWarning(
                            "Possible prompt injection in {Tool} output: {Phrase}", call.FunctionName, suspicious);
                    }

                    messages.Add(new ToolChatMessage(call.Id, payload));
                }
            }

            meter.Succeeded = true;
        }
        finally
        {
            if (meter.Report() is { } spent)
            {
                usage.Record(spent);
            }
        }

        await evaluation.RecordAsync(
            history.LastOrDefault(turn => turn.Role != "assistant")?.Text,
            reply,
            attempted,
            toolset.Tools,
            spentOn,
            cancellationToken);

        return reply;
    }

    /// <summary>Images ride along with the text of the turn they arrived on.</summary>
    private static UserChatMessage UserMessage(ChatTurn turn)
    {
        if (turn.Images.Count == 0)
        {
            return new UserChatMessage(turn.Text);
        }

        List<ChatMessageContentPart> parts = [ChatMessageContentPart.CreateTextPart(turn.Text)];
        parts.AddRange(turn.Images.Select(image =>
            ChatMessageContentPart.CreateImagePart(BinaryData.FromBytes(image.Bytes), image.ContentType)));
        return new UserChatMessage(parts);
    }

    /// <summary>Accumulates one turn's spend across every round trip the tool loop makes.</summary>
    private sealed class UsageMeter(UsageContext? spentOn, string model)
    {
        private readonly long _startedAt = Stopwatch.GetTimestamp();
        private readonly List<string> _tools = [];
        private int _input;
        private int _cached;
        private int _output;
        private int _reasoning;
        private int _calls;

        public bool Succeeded { get; set; }

        public void Add(ChatCompletion completion)
        {
            _calls++;
            if (completion.Usage is not { } used)
            {
                return;
            }

            _input += used.InputTokenCount;
            _output += used.OutputTokenCount;
            _cached += used.InputTokenDetails?.CachedTokenCount ?? 0;
            _reasoning += used.OutputTokenDetails?.ReasoningTokenCount ?? 0;
        }

        public void AddTool(string name) => _tools.Add(name);

        public UsageRecord? Report() => spentOn is null ? null : new UsageRecord
        {
            At = DateTimeOffset.UtcNow,
            Source = spentOn.Source,
            Actor = spentOn.Actor,
            Model = model,
            InputTokens = _input,
            CachedTokens = _cached,
            OutputTokens = _output,
            ReasoningTokens = _reasoning,
            Calls = _calls,
            Tools = [.. _tools],
            DurationMs = (int)Stopwatch.GetElapsedTime(_startedAt).TotalMilliseconds,
            Failed = !Succeeded,
        };
    }

    public static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max] + "\n…(以下省略)";
}

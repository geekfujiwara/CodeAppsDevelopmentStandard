using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Azure.Core;
using GitHub.Copilot;
using GitHub.Copilot.Rpc;
using Microsoft.Extensions.AI;

/// <summary>
/// The model + MCP tool loop, shared by the Teams turn handler and every background worker.
/// The loop itself lives in the Copilot runtime (BYOK); this class owns what the runtime cannot:
/// per-turn delegated tokens for MCP, the untrusted-content fence, usage accounting and evaluation.
/// </summary>
public sealed class AgentBrain(
    CopilotRuntime copilot,
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

    /// <summary>The tool loop runs inside the runtime, so a turn is bounded by wall clock only.</summary>
    private TimeSpan TurnTimeout => TimeSpan.FromSeconds(configuration.GetValue("Agent:TurnTimeoutSeconds", 1200));

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

    /// <summary>
    /// Runs one turn. The tool loop itself belongs to the Copilot runtime: every MCP / local tool is
    /// handed over as a proxy function so the delegated (short-lived) tokens never leave this process.
    /// </summary>
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
        var meter = new UsageMeter(spentOn, copilot.Model);
        List<EvaluationToolCall> attempted = [];

        int index = history.Count - 1;
        while (index >= 0 && history[index].Role == "assistant")
        {
            index--;
        }

        string question = index >= 0 ? history[index].Text : string.Empty;
        string earlier = HistoryBlock(history.Take(Math.Max(index, 0)).ToList());

        List<AIFunctionDeclaration> tools =
        [
            .. toolset.Tools.Select(tool => new McpProxyFunction(
                tool,
                (name, arguments, toolCancellation) =>
                    RunToolAsync(name, arguments, toolset, fence, meter, attempted, progress, toolCancellation))),
        ];

        string reply = "回答を組み立てられませんでした。お手数ですが、もう一度お試しください。";
        try
        {
            await using CopilotSession session = await copilot.CreateSessionAsync(new SessionConfig
            {
                Model = copilot.Model,
                Provider = copilot.CreateProvider(),
                // Built-in shell / editing tools would run on the agent host itself.
                ExcludedTools = copilot.ExcludedTools,
                Tools = tools,
                // Nothing on the host is part of the agent's job: no skills, no repo instructions.
                EnableSkills = false,
                EnableConfigDiscovery = false,
                SkipCustomInstructions = true,
                SystemMessage = new SystemMessageConfig
                {
                    // Customize keeps the runtime's safety guardrails; Replace would drop them.
                    Mode = SystemMessageMode.Customize,
                    Sections = new Dictionary<SystemMessageSection, SectionOverride>
                    {
                        [SystemMessageSection.CodeChangeRules] = new() { Action = SectionOverrideAction.Remove },
                    },
                    Content = string.Join(
                        "\n\n",
                        new[] { Prompt.SystemPrompt, fence.Briefing, context, earlier }
                            .Where(part => !string.IsNullOrWhiteSpace(part))),
                },
                OnPermissionRequest = (request, _) => Task.FromResult(
                    // Managed settings win, and there is no human at the other end of a runtime prompt:
                    // the agent's own tools already ran under the delegated identity.
                    request.ManagedApprovalRequired is true
                        ? PermissionDecision.NoResult()
                        : PermissionDecision.ApproveOnce()),
                OnEvent = sessionEvent =>
                {
                    switch (sessionEvent)
                    {
                        case AssistantUsageEvent usage:
                            meter.Add(usage.Data);
                            break;
                        case SessionErrorEvent error:
                            logger.LogError("Copilot session error: {Error}", error.Data?.Message);
                            break;
                    }
                },
            }, cancellationToken);

            AssistantMessageEvent? response = await session.SendAndWaitAsync(
                new MessageOptions { Prompt = question },
                TurnTimeout,
                cancellationToken);

            if (response?.Data.Content is { Length: > 0 } content)
            {
                reply = content.Trim();
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
            question,
            reply,
            attempted,
            toolset.Tools,
            spentOn,
            cancellationToken);

        return reply;
    }

    private async Task<string> RunToolAsync(
        string name,
        string argumentsJson,
        McpToolset toolset,
        UntrustedContent fence,
        UsageMeter meter,
        List<EvaluationToolCall> attempted,
        AgentProgress? progress,
        CancellationToken cancellationToken)
    {
        meter.AddTool(name);
        attempted.Add(new EvaluationToolCall(
            Guid.NewGuid().ToString("n"), name, toolset.ServerOf(name), argumentsJson));

        if (progress is not null)
        {
            await progress.StepAsync([name], cancellationToken);
        }

        string result;
        try
        {
            result = await CallToolAsync(toolset, name, argumentsJson, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "MCP tool {Tool} failed", name);
            return $"ツール呼び出しに失敗しました: {ex.Message}";
        }

        if (result.StartsWith("ツールがエラーを返しました", StringComparison.Ordinal))
        {
            logger.LogWarning("Tool {Tool} rejected. args={Args} result={Result}",
                name, Truncate(argumentsJson, 600), Truncate(result, 600));
        }

        string payload = fence.WrapToolResult(name, Truncate(result, MaxToolResultLength), out string? suspicious);
        if (suspicious is not null)
        {
            logger.LogWarning("Possible prompt injection in {Tool} output: {Phrase}", name, suspicious);
        }

        return payload;
    }

    /// <summary>Earlier turns travel as context: the runtime session lives for one turn only.</summary>
    private static string HistoryBlock(IReadOnlyList<ChatTurn> history)
    {
        if (history.Count == 0)
        {
            return string.Empty;
        }

        var text = new StringBuilder("## これまでのやり取り\n");
        foreach (ChatTurn turn in history)
        {
            text.Append(turn.Role == "assistant" ? "あなた: " : "相手: ").AppendLine(turn.Text);
            if (turn.Images.Count > 0)
            {
                text.AppendLine("（画像が添付されましたが、この会話では読み取れません）");
            }
        }

        return text.ToString();
    }

    /// <summary>
    /// Exposes one MCP / local tool to the runtime with its original JSON schema, and keeps the call
    /// itself in-process so the per-turn delegated token is never handed to the runtime.
    /// </summary>
    private sealed class McpProxyFunction(
        McpToolDefinition definition,
        Func<string, string, CancellationToken, Task<string>> invoke) : AIFunction
    {
        private static readonly JsonElement EmptySchema =
            JsonDocument.Parse("""{"type":"object","properties":{}}""").RootElement;

        public override string Name => definition.Name;

        public override string Description => definition.Description;

        public override JsonElement JsonSchema =>
            definition.InputSchema.ValueKind == JsonValueKind.Object ? definition.InputSchema : EmptySchema;

        public override IReadOnlyDictionary<string, object?> AdditionalProperties { get; } =
            // These tools authorize every call themselves; a runtime prompt would have no one to ask.
            // The SDK's key constant is internal, so the wire value is spelled out here.
            new Dictionary<string, object?> { ["skip_permission"] = true };

        protected override async ValueTask<object?> InvokeCoreAsync(
            AIFunctionArguments arguments, CancellationToken cancellationToken)
        {
            string json = JsonSerializer.Serialize(new Dictionary<string, object?>(arguments));
            return await invoke(Name, json, cancellationToken);
        }
    }

    /// <summary>Accumulates one turn's spend across every round trip the runtime makes.</summary>
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

        public void Add(AssistantUsageData? used)
        {
            _calls++;
            if (used is null)
            {
                return;
            }

            _input += (int)(used.InputTokens ?? 0);
            _output += (int)(used.OutputTokens ?? 0);
            _cached += (int)(used.CacheReadTokens ?? 0);
            _reasoning += (int)(used.ReasoningTokens ?? 0);
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

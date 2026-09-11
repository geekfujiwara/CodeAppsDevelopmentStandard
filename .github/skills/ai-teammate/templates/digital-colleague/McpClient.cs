using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

public sealed record McpToolDefinition(string Name, string Description, JsonElement InputSchema);

public sealed class McpSession(HttpClient http, string serverName, string endpoint) : IDisposable
{
    public HttpClient Http { get; } = http;
    public string ServerName { get; } = serverName;
    public string Endpoint { get; } = endpoint;
    public string? SessionId { get; set; }

    public void Dispose() => Http.Dispose();
}

/// <summary>
/// Minimal streamable-HTTP MCP client, shared by every remote MCP server this agent talks to
/// (Dataverse / Work IQ, when configured).
/// </summary>
public class McpClient(IHttpClientFactory httpClientFactory, ILogger<McpClient> logger)
{
    private const string ProtocolVersion = "2025-06-18";

    private int _requestId;

    public async Task<McpSession> ConnectAsync(string serverName, string endpoint, string credential, CancellationToken cancellationToken, string? apiKeyHeader = null)
    {
        HttpClient http = httpClientFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(100);
        if (string.IsNullOrEmpty(apiKeyHeader))
        {
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", credential);
        }
        else
        {
            http.DefaultRequestHeaders.Add(apiKeyHeader, credential);
        }

        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));

        var session = new McpSession(http, serverName, endpoint);

        await SendRequestAsync(session, "initialize", new
        {
            protocolVersion = ProtocolVersion,
            capabilities = new { },
            clientInfo = new { name = "${AGENT_NAME}", version = "1.0" },
        }, cancellationToken);

        await SendNotificationAsync(session, "notifications/initialized", cancellationToken);
        return session;
    }

    public async Task<IReadOnlyList<McpToolDefinition>> ListToolsAsync(
        McpSession session,
        IReadOnlySet<string> blockedTools,
        CancellationToken cancellationToken)
    {
        JsonElement result = await SendRequestAsync(session, "tools/list", new { }, cancellationToken);
        var tools = new List<McpToolDefinition>();

        if (result.TryGetProperty("tools", out JsonElement array))
        {
            foreach (JsonElement tool in array.EnumerateArray())
            {
                string name = tool.GetProperty("name").GetString() ?? string.Empty;
                if (name.Length == 0 || blockedTools.Contains(name))
                {
                    continue;
                }

                string description = tool.TryGetProperty("description", out JsonElement d) ? d.GetString() ?? string.Empty : string.Empty;
                JsonElement schema = tool.TryGetProperty("inputSchema", out JsonElement s)
                    ? s.Clone()
                    : JsonDocument.Parse("""{"type":"object","properties":{}}""").RootElement.Clone();

                tools.Add(new McpToolDefinition(name, description, schema));
            }
        }

        logger.LogInformation("{Server} exposed {Count} usable tools", session.ServerName, tools.Count);
        return tools;
    }

    public async Task<string> CallToolAsync(McpSession session, string name, string argumentsJson, CancellationToken cancellationToken) =>
        FlattenContent(await CallToolRawAsync(session, name, argumentsJson, cancellationToken));

    /// <summary>The unflattened result, for callers that need to walk the payload themselves.</summary>
    public async Task<JsonElement> CallToolRawAsync(McpSession session, string name, string argumentsJson, CancellationToken cancellationToken)
    {
        using JsonDocument arguments = JsonDocument.Parse(
            string.IsNullOrWhiteSpace(argumentsJson) ? "{}" : argumentsJson);

        return await SendRequestAsync(session, "tools/call", new
        {
            name,
            arguments = arguments.RootElement,
        }, cancellationToken);
    }

    /// <summary>MCP tool results are a content-part array; the model only needs the text.</summary>
    private static string FlattenContent(JsonElement result)
    {
        if (!result.TryGetProperty("content", out JsonElement content))
        {
            return result.GetRawText();
        }

        var builder = new StringBuilder();
        foreach (JsonElement part in content.EnumerateArray())
        {
            if (part.TryGetProperty("text", out JsonElement text))
            {
                builder.AppendLine(text.GetString());
            }
            else
            {
                builder.AppendLine(part.GetRawText());
            }
        }

        string flattened = builder.ToString().Trim();

        // Some servers return write results only in structuredContent, leaving content empty.
        if (flattened.Length == 0 && result.TryGetProperty("structuredContent", out JsonElement structured))
        {
            flattened = structured.GetRawText();
        }

        if (result.TryGetProperty("isError", out JsonElement isError) && isError.ValueKind == JsonValueKind.True)
        {
            // Some servers signal isError with no text part; the raw payload is the only clue.
            return $"ツールがエラーを返しました: {(flattened.Length == 0 ? result.GetRawText() : flattened)}";
        }

        return flattened.Length == 0 ? "(空の結果)" : flattened;
    }

    private async Task<JsonElement> SendRequestAsync(McpSession session, string method, object parameters, CancellationToken cancellationToken)
    {
        int id = Interlocked.Increment(ref _requestId);
        string payload = JsonSerializer.Serialize(new { jsonrpc = "2.0", id, method, @params = parameters });

        using HttpResponseMessage response = await PostAsync(session, payload, cancellationToken);
        string body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"{session.ServerName} の {method} が HTTP {(int)response.StatusCode} を返しました: {Truncate(body, 500)}");
        }

        if (response.Headers.TryGetValues("Mcp-Session-Id", out IEnumerable<string>? ids))
        {
            session.SessionId = ids.FirstOrDefault() ?? session.SessionId;
        }

        using JsonDocument document = JsonDocument.Parse(ExtractJson(body));
        if (document.RootElement.TryGetProperty("error", out JsonElement error))
        {
            throw new InvalidOperationException($"{session.ServerName} の {method} エラー: {error.GetRawText()}");
        }

        return document.RootElement.TryGetProperty("result", out JsonElement result)
            ? result.Clone()
            : document.RootElement.Clone();
    }

    private async Task SendNotificationAsync(McpSession session, string method, CancellationToken cancellationToken)
    {
        string payload = JsonSerializer.Serialize(new { jsonrpc = "2.0", method });
        using HttpResponseMessage response = await PostAsync(session, payload, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("{Server} notification {Method} returned {Status}",
                session.ServerName, method, (int)response.StatusCode);
        }
    }

    private static async Task<HttpResponseMessage> PostAsync(McpSession session, string payload, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, session.Endpoint)
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("MCP-Protocol-Version", ProtocolVersion);
        if (!string.IsNullOrEmpty(session.SessionId))
        {
            request.Headers.Add("Mcp-Session-Id", session.SessionId);
        }

        return await session.Http.SendAsync(request, cancellationToken);
    }

    /// <summary>The server may answer either as plain JSON or as a single SSE event.</summary>
    private static string ExtractJson(string body)
    {
        string trimmed = body.TrimStart();
        if (trimmed.StartsWith('{') || trimmed.StartsWith('['))
        {
            return trimmed;
        }

        var builder = new StringBuilder();
        foreach (string line in body.Split('\n'))
        {
            if (line.StartsWith("data:", StringComparison.Ordinal))
            {
                builder.Append(line[5..].Trim());
            }
        }

        string data = builder.ToString();
        return data.Length == 0 ? body : data;
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max] + "…";
}

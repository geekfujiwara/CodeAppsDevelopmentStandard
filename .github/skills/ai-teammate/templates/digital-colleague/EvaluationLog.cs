using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

/// <summary>
/// One JSONL row per turn, shaped for azure-ai-evaluation (ToolCallAccuracy / TaskAdherence).
/// The transcript only keeps role and text, so which tools a turn actually called is lost unless it is captured here.
/// </summary>
public sealed class EvaluationLog
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly ILogger<EvaluationLog> _logger;
    private readonly EvaluationDataverse _dataverse;
    private readonly string _root;
    private readonly long _maxBytes;

    public EvaluationLog(IConfiguration configuration, EvaluationDataverse dataverse, ILogger<EvaluationLog> logger)
    {
        _logger = logger;
        _dataverse = dataverse;
        Enabled = configuration.GetValue("Evaluation:Enabled", true);
        _maxBytes = configuration.GetValue("Evaluation:MaxFileBytes", 32L * 1024 * 1024);

        string home = configuration["Conversation:StatePath"]
            ?? Path.Combine(Environment.GetEnvironmentVariable("HOME") ?? AppContext.BaseDirectory, "data");
        _root = Path.Combine(home, "evaluation");

        if (Enabled)
        {
            Directory.CreateDirectory(_root);
            logger.LogInformation("Evaluation log at {Root} (cap {Bytes} bytes/day)", _root, _maxBytes);
        }
    }

    public bool Enabled { get; }

    public async Task RecordAsync(
        string? query,
        string response,
        IReadOnlyList<EvaluationToolCall> toolCalls,
        IReadOnlyList<McpToolDefinition> toolDefinitions,
        UsageContext? spentOn,
        CancellationToken cancellationToken)
    {
        if (!Enabled || string.IsNullOrWhiteSpace(query))
        {
            return;
        }

        var row = new EvaluationRow(
            DateTimeOffset.UtcNow,
            spentOn?.Actor,
            spentOn?.Source,
            query,
            response,
            [.. toolCalls.Select(call => new EvaluationRow.Call(call.Id, call.Name, call.Server, Parse(call.ArgumentsJson)))],
            [.. toolDefinitions.Select(tool => new EvaluationRow.Definition(tool.Name, tool.Description, tool.InputSchema))]);

        await AppendAsync(row, cancellationToken);

        // The evaluator builds its row id the same way, so the nightly run updates this row
        // in place rather than adding a second one.
        await _dataverse.UpsertAsync(
            new EvaluationDataverseRow(
                "turn-" + JsonSerializer.Serialize(row.Timestamp, SerializerOptions).Trim('"'),
                row.Timestamp,
                row.Actor,
                row.Source,
                row.Query,
                row.Response,
                JsonSerializer.Serialize(row.ToolCalls, SerializerOptions),
                row.ToolCalls.Count),
            cancellationToken);
    }

    private async Task AppendAsync(EvaluationRow row, CancellationToken cancellationToken)
    {
        string path = Path.Combine(_root, $"eval-{DateTime.UtcNow:yyyyMMdd}.jsonl");
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (new FileInfo(path) is { Exists: true } existing && existing.Length >= _maxBytes)
            {
                return;
            }

            await File.AppendAllTextAsync(
                path, JsonSerializer.Serialize(row, SerializerOptions) + Environment.NewLine, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not append to the evaluation log");
        }
        finally
        {
            _gate.Release();
        }
    }

    private static JsonElement Parse(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<JsonElement>(string.IsNullOrWhiteSpace(json) ? "{}" : json);
        }
        catch (JsonException)
        {
            return JsonSerializer.Deserialize<JsonElement>("{}");
        }
    }

    private sealed record EvaluationRow(
        [property: JsonPropertyName("timestamp")] DateTimeOffset Timestamp,
        [property: JsonPropertyName("actor")] string? Actor,
        [property: JsonPropertyName("source")] string? Source,
        [property: JsonPropertyName("query")] string Query,
        [property: JsonPropertyName("response")] string Response,
        [property: JsonPropertyName("tool_calls")] IReadOnlyList<EvaluationRow.Call> ToolCalls,
        [property: JsonPropertyName("tool_definitions")] IReadOnlyList<EvaluationRow.Definition> ToolDefinitions)
    {
        public sealed record Call(
            [property: JsonPropertyName("tool_call_id")] string Id,
            [property: JsonPropertyName("name")] string Name,
            [property: JsonPropertyName("server")] string Server,
            [property: JsonPropertyName("arguments")] JsonElement Arguments)
        {
            [JsonPropertyName("type")]
            public string Type => "tool_call";
        }

        public sealed record Definition(
            [property: JsonPropertyName("name")] string Name,
            [property: JsonPropertyName("description")] string Description,
            [property: JsonPropertyName("parameters")] JsonElement Parameters);
    }
}

public readonly record struct EvaluationToolCall(string Id, string Name, string Server, string ArgumentsJson);

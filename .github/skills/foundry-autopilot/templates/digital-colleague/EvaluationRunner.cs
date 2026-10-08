using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Azure.AI.OpenAI;
using Azure.Core;
using OpenAI.Chat;

/// <summary>
/// Runs the evaluation the review app (AI チームメイト評価Hub) queues, so scoring no longer depends on
/// a laptop running a scheduled task. Rules, jobs and results all live in Dataverse; this class only
/// turns a rule row into a judge call and writes the answer back.
/// </summary>
public sealed partial class EvaluationRunner
{
    private const int StatusPending = 1;
    private const int StatusRunning = 2;
    private const int StatusDone = 3;
    private const int StatusFailed = 4;

    private const int ScopeUnevaluated = 1;
    private const int ScopeAll = 2;
    private const int ScopePeriod = 3;

    private const string SystemPrompt = """
        あなたは AI エージェントの応答品質を審査する評価者です。
        与えられた「評価ルール」だけに従って、1 つのターンを 1〜5 の整数で採点します。
        ルールに書かれていない観点で減点してはいけません。

        出力はすべて日本語で書いてください。英語で書いてはいけません。

        reason には、なぜその点数にしたのかを 2〜4 文で書きます。

        evidence には、判断の決め手になった箇所を原文からそのまま抜き出して入れます。
        要約・言い換え・省略記号の付与をしてはいけません。抜き出した文字列は対象の原文に
        一字一句含まれている必要があります。画面上でその箇所をハイライトするために使います。
        引用は 1 文以内、長くても 60 文字程度に収めてください。長く採るほど原文と食い違い、
        ハイライトできなくなります。
        良い点は polarity を positive、問題点は negative にしてください。

        suggestions には、次に何を変えれば点数が上がるかを書きます。
        「丁寧に書く」のような一般論は禁止です。エージェントのスキル定義やシステムプロンプトを
        どう書き換えればよいかが分かる粒度まで具体化し、example には実際に貼り付けられる
        文面や差分を書いてください。
        target は変更すべき対象を表し、
          skill=エージェントのスキル定義 / system_prompt=システムプロンプト /
          tool=ツール自体の実装や説明文 / other=それ以外
        のいずれかにしてください。
        指摘すべき改善点が無い場合は空配列にしてください。
        """;

    private const string Schema = """
        {
          "type": "object",
          "properties": {
            "score": { "type": "integer" },
            "reason": { "type": "string" },
            "evidence": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "kind": { "type": "string", "enum": ["query", "response", "tool_call"] },
                  "quote": { "type": "string" },
                  "note": { "type": "string" },
                  "polarity": { "type": "string", "enum": ["positive", "negative"] }
                },
                "required": ["kind", "quote", "note", "polarity"],
                "additionalProperties": false
              }
            },
            "suggestions": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "title": { "type": "string" },
                  "target": { "type": "string", "enum": ["skill", "system_prompt", "tool", "other"] },
                  "detail": { "type": "string" },
                  "example": { "type": "string" }
                },
                "required": ["title", "target", "detail", "example"],
                "additionalProperties": false
              }
            }
          },
          "required": ["score", "reason", "evidence", "suggestions"],
          "additionalProperties": false
        }
        """;

    // The turn keeps a copy of these two so the pages that predate the rule master still work.
    private static readonly Dictionary<string, (string Score, string Reason)> Mirror = new()
    {
        ["tool_call_accuracy"] = ("${PUBLISHER_PREFIX}_toolcallaccuracy", "${PUBLISHER_PREFIX}_toolcallaccuracyreason"),
        ["task_adherence"] = ("${PUBLISHER_PREFIX}_taskadherence", "${PUBLISHER_PREFIX}_taskadherencereason"),
    };

    private static readonly JsonSerializerOptions Json = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly TokenCredential _credential;
    private readonly IHttpClientFactory _factory;
    private readonly ILogger<EvaluationRunner> _logger;
    private readonly ChatClient? _judge;
    private readonly string _api;
    private readonly string _scope;
    private readonly int _parallel;
    private readonly int _staleMinutes;

    public EvaluationRunner(
        IConfiguration configuration,
        TokenCredential credential,
        IHttpClientFactory factory,
        ILogger<EvaluationRunner> logger)
    {
        _credential = credential;
        _factory = factory;
        _logger = logger;

        string org = (configuration["Dataverse:Url"] ?? "").TrimEnd('/');
        string endpoint = configuration["AzureOpenAI:Endpoint"] ?? "";
        // A small model is enough here and keeps a full re-run affordable.
        string deployment = configuration["Evaluation:JudgeDeployment"] ?? "gpt-4.1-mini";
        _parallel = Math.Max(1, configuration.GetValue("Evaluation:Parallel", 4));
        _staleMinutes = Math.Max(5, configuration.GetValue("Evaluation:StaleMinutes", 15));
        _api = $"{org}/api/data/v9.2";
        _scope = $"{org}/.default";

        Enabled = configuration.GetValue("Evaluation:RunJobs", true) && org.Length > 0 && endpoint.Length > 0;
        if (Enabled)
        {
            _judge = new AzureOpenAIClient(new Uri(endpoint), credential).GetChatClient(deployment);
            logger.LogInformation("Evaluation jobs are judged by {Deployment}", deployment);
        }
    }

    public bool Enabled { get; }

    /// <summary>Picks up the oldest queued job and evaluates it. Returns false when nothing waits.</summary>
    public async Task<bool> RunOnceAsync(CancellationToken cancellationToken)
    {
        if (!Enabled || _judge is null)
        {
            return false;
        }

        AccessToken token = await _credential.GetTokenAsync(new TokenRequestContext([_scope]), cancellationToken);
        using HttpClient http = _factory.CreateClient();
        http.Timeout = TimeSpan.FromMinutes(5);
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);
        http.DefaultRequestHeaders.Add("OData-Version", "4.0");
        http.DefaultRequestHeaders.Add("OData-MaxVersion", "4.0");
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        JsonNode? job = (await GetAllAsync(http, $"${PUBLISHER_PREFIX}_evaljobs?$filter=${PUBLISHER_PREFIX}_status eq {StatusPending}&$orderby=${PUBLISHER_PREFIX}_requestedon asc", cancellationToken))
            .FirstOrDefault();
        if (job is null)
        {
            await ReclaimStaleAsync(http, cancellationToken);
            return false;
        }

        string jobId = job["${PUBLISHER_PREFIX}_evaljobid"]!.GetValue<string>();
        try
        {
            await RunJobAsync(http, jobId, job, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Evaluation job {JobId} failed", jobId);
            await PatchAsync(http, "${PUBLISHER_PREFIX}_evaljobs", jobId, new Dictionary<string, object?>
            {
                ["${PUBLISHER_PREFIX}_status"] = StatusFailed,
                ["${PUBLISHER_PREFIX}_completedon"] = DateTimeOffset.UtcNow,
                ["${PUBLISHER_PREFIX}_message"] = Cap(ex.Message, 2000),
            }, cancellationToken);
        }

        return true;
    }

    /// <summary>
    /// A job left running by a restart would sit there forever, which looks exactly like
    /// "履歴が更新されない". Every progress write touches modifiedon, so a stale one is a dead one.
    /// </summary>
    private async Task ReclaimStaleAsync(HttpClient http, CancellationToken cancellationToken)
    {
        string since = DateTimeOffset.UtcNow.AddMinutes(-_staleMinutes).UtcDateTime.ToString("o");
        List<JsonNode> stale = await GetAllAsync(
            http,
            $"${PUBLISHER_PREFIX}_evaljobs?$select=${PUBLISHER_PREFIX}_evaljobid,${PUBLISHER_PREFIX}_name&$filter={Uri.EscapeDataString($"${PUBLISHER_PREFIX}_status eq {StatusRunning} and modifiedon lt {since}")}",
            cancellationToken);

        foreach (JsonNode row in stale)
        {
            string id = row["${PUBLISHER_PREFIX}_evaljobid"]!.GetValue<string>();
            _logger.LogWarning("Requeueing evaluation job {Name}: no progress for {Minutes} minutes", Text(row, "${PUBLISHER_PREFIX}_name"), _staleMinutes);
            await PatchAsync(http, "${PUBLISHER_PREFIX}_evaljobs", id, new Dictionary<string, object?>
            {
                ["${PUBLISHER_PREFIX}_status"] = StatusPending,
                ["${PUBLISHER_PREFIX}_message"] = "中断されたため再開待ちにしました",
            }, cancellationToken);
        }
    }

    private async Task RunJobAsync(HttpClient http, string jobId, JsonNode job, CancellationToken cancellationToken)
    {
        int scope = job["${PUBLISHER_PREFIX}_scope"]?.GetValue<int>() ?? ScopeUnevaluated;
        string runId = DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmss");

        await PatchAsync(http, "${PUBLISHER_PREFIX}_evaljobs", jobId, new Dictionary<string, object?>
        {
            ["${PUBLISHER_PREFIX}_status"] = StatusRunning,
            ["${PUBLISHER_PREFIX}_startedon"] = DateTimeOffset.UtcNow,
            ["${PUBLISHER_PREFIX}_message"] = "対象を集めています",
        }, cancellationToken);

        List<JsonNode> rules = await GetAllAsync(http, "${PUBLISHER_PREFIX}_evalrules?$filter=${PUBLISHER_PREFIX}_enabled eq true&$orderby=${PUBLISHER_PREFIX}_sortorder asc", cancellationToken);
        string? wanted = job["${PUBLISHER_PREFIX}_rulekeys"]?.GetValue<string>();
        if (!string.IsNullOrWhiteSpace(wanted))
        {
            HashSet<string> keys = [.. wanted.Split([',', ' ', '\t'], StringSplitOptions.RemoveEmptyEntries)];
            rules = [.. rules.Where(rule => keys.Contains(Text(rule, "${PUBLISHER_PREFIX}_rulekey")))];
        }
        if (rules.Count == 0)
        {
            throw new InvalidOperationException("有効な評価ルールがありません。ルール画面で有効にしてください。");
        }

        // 統合された元ターンは統合先の 1 行として採点するので、ここでは対象から外す。
        var filter = new StringBuilder("${PUBLISHER_PREFIX}_query ne null and ${PUBLISHER_PREFIX}_mergedinto eq null");
        if (scope == ScopePeriod)
        {
            if (job["${PUBLISHER_PREFIX}_fromdate"] is { } from)
            {
                filter.Append($" and ${PUBLISHER_PREFIX}_occurredon ge {DateTimeOffset.Parse(from.GetValue<string>()).UtcDateTime:o}");
            }
            if (job["${PUBLISHER_PREFIX}_todate"] is { } to)
            {
                filter.Append($" and ${PUBLISHER_PREFIX}_occurredon le {DateTimeOffset.Parse(to.GetValue<string>()).UtcDateTime:o}");
            }
        }

        const string Select = "${PUBLISHER_PREFIX}_name,${PUBLISHER_PREFIX}_actor,${PUBLISHER_PREFIX}_source,${PUBLISHER_PREFIX}_query,${PUBLISHER_PREFIX}_response,${PUBLISHER_PREFIX}_toolcalls";
        List<JsonNode> turns = await GetAllAsync(
            http, $"${PUBLISHER_PREFIX}_evalturns?$select={Select}&$filter={Uri.EscapeDataString(filter.ToString())}&$orderby=${PUBLISHER_PREFIX}_occurredon desc", cancellationToken);

        HashSet<string> done = [];
        if (scope != ScopeAll)
        {
            foreach (JsonNode row in await GetAllAsync(http, "${PUBLISHER_PREFIX}_evalresults?$select=${PUBLISHER_PREFIX}_name", cancellationToken))
            {
                done.Add(Text(row, "${PUBLISHER_PREFIX}_name"));
            }
        }

        List<(JsonNode Turn, JsonNode Rule)> pairs = [];
        foreach (JsonNode turn in turns)
        {
            foreach (JsonNode rule in rules)
            {
                if (!done.Contains($"{Text(turn, "${PUBLISHER_PREFIX}_name")}::{Text(rule, "${PUBLISHER_PREFIX}_rulekey")}"))
                {
                    pairs.Add((turn, rule));
                }
            }
        }

        await PatchAsync(http, "${PUBLISHER_PREFIX}_evaljobs", jobId, new Dictionary<string, object?>
        {
            ["${PUBLISHER_PREFIX}_targetcount"] = pairs.Count,
            ["${PUBLISHER_PREFIX}_message"] = $"{pairs.Count} 件を評価します",
        }, cancellationToken);

        if (pairs.Count == 0)
        {
            await PatchAsync(http, "${PUBLISHER_PREFIX}_evaljobs", jobId, new Dictionary<string, object?>
            {
                ["${PUBLISHER_PREFIX}_status"] = StatusDone,
                ["${PUBLISHER_PREFIX}_completedon"] = DateTimeOffset.UtcNow,
                ["${PUBLISHER_PREFIX}_donecount"] = 0,
                ["${PUBLISHER_PREFIX}_message"] = "評価対象はありませんでした",
            }, cancellationToken);
            return;
        }

        _logger.LogInformation("Evaluation job {JobId}: judging {Count} pairs", jobId, pairs.Count);

        var patches = new ConcurrentDictionary<string, ConcurrentDictionary<string, object?>>();
        int completed = 0;
        int failed = 0;
        using var gate = new SemaphoreSlim(_parallel);

        await Parallel.ForEachAsync(pairs, cancellationToken, async (pair, token) =>
        {
            await gate.WaitAsync(token);
            try
            {
                await JudgeAndPushAsync(http, pair.Turn, pair.Rule, runId, patches, token);
            }
            catch (Exception ex)
            {
                Interlocked.Increment(ref failed);
                _logger.LogWarning(ex, "Could not judge {Turn} against {Rule}", Text(pair.Turn, "${PUBLISHER_PREFIX}_name"), Text(pair.Rule, "${PUBLISHER_PREFIX}_rulekey"));
            }
            finally
            {
                gate.Release();
            }

            int now = Interlocked.Increment(ref completed);
            if (now % 5 == 0)
            {
                await PatchAsync(http, "${PUBLISHER_PREFIX}_evaljobs", jobId, new Dictionary<string, object?>
                {
                    ["${PUBLISHER_PREFIX}_donecount"] = now,
                }, token);
            }
        });

        DateTimeOffset evaluatedOn = DateTimeOffset.UtcNow;
        foreach ((string turnName, ConcurrentDictionary<string, object?> patch) in patches)
        {
            string? id = await FindIdAsync(http, "${PUBLISHER_PREFIX}_evalturns", "${PUBLISHER_PREFIX}_name", turnName, "${PUBLISHER_PREFIX}_evalturnid", cancellationToken);
            if (id is null)
            {
                continue;
            }
            patch["${PUBLISHER_PREFIX}_runid"] = runId;
            patch["${PUBLISHER_PREFIX}_evaluatedon"] = evaluatedOn;
            await PatchAsync(http, "${PUBLISHER_PREFIX}_evalturns", id, patch, cancellationToken);
        }

        int pushed = completed - failed;
        await PatchAsync(http, "${PUBLISHER_PREFIX}_evaljobs", jobId, new Dictionary<string, object?>
        {
            ["${PUBLISHER_PREFIX}_status"] = StatusDone,
            ["${PUBLISHER_PREFIX}_completedon"] = DateTimeOffset.UtcNow,
            ["${PUBLISHER_PREFIX}_donecount"] = pushed,
            ["${PUBLISHER_PREFIX}_message"] = failed == 0
                ? $"{pushed} 件の評価を反映しました"
                : $"{pushed} 件を反映しました（{failed} 件は判定に失敗）",
        }, cancellationToken);
        _logger.LogInformation("Evaluation job {JobId} done: {Pushed} pushed, {Failed} failed", jobId, pushed, failed);
    }

    private async Task JudgeAndPushAsync(
        HttpClient http,
        JsonNode turn,
        JsonNode rule,
        string runId,
        ConcurrentDictionary<string, ConcurrentDictionary<string, object?>> patches,
        CancellationToken cancellationToken)
    {
        ChatCompletion completion = await _judge!.CompleteChatAsync(
            [new SystemChatMessage(SystemPrompt), new UserChatMessage(BuildPrompt(rule, turn))],
            new ChatCompletionOptions
            {
                Temperature = 0,
                ResponseFormat = ChatResponseFormat.CreateJsonSchemaFormat(
                    "evaluation", BinaryData.FromString(Schema), jsonSchemaIsStrict: true),
            },
            cancellationToken);

        JsonNode parsed = JsonNode.Parse(completion.Content[0].Text)
            ?? throw new InvalidOperationException("判定結果が JSON ではありませんでした");

        string turnName = Text(turn, "${PUBLISHER_PREFIX}_name");
        string ruleKey = Text(rule, "${PUBLISHER_PREFIX}_rulekey");
        int score = Math.Clamp(parsed["score"]?.GetValue<int>() ?? 3, 1, 5);
        string reason = parsed["reason"]?.GetValue<string>() ?? "";

        var record = new Dictionary<string, object?>
        {
            ["${PUBLISHER_PREFIX}_name"] = $"{turnName}::{ruleKey}",
            ["${PUBLISHER_PREFIX}_turnname"] = turnName,
            ["${PUBLISHER_PREFIX}_rulekey"] = ruleKey,
            ["${PUBLISHER_PREFIX}_rulename"] = Text(rule, "${PUBLISHER_PREFIX}_name"),
            ["${PUBLISHER_PREFIX}_score"] = score,
            ["${PUBLISHER_PREFIX}_reason"] = reason,
            ["${PUBLISHER_PREFIX}_evidence"] = MarkMatches(parsed["evidence"], turn).ToJsonString(Json),
            ["${PUBLISHER_PREFIX}_suggestions"] = (parsed["suggestions"] as JsonArray ?? []).ToJsonString(Json),
            ["${PUBLISHER_PREFIX}_runid"] = runId,
            ["${PUBLISHER_PREFIX}_evaluatedon"] = DateTimeOffset.UtcNow,
        };

        string name = (string)record["${PUBLISHER_PREFIX}_name"]!;
        string? existing = await FindIdAsync(http, "${PUBLISHER_PREFIX}_evalresults", "${PUBLISHER_PREFIX}_name", name, "${PUBLISHER_PREFIX}_evalresultid", cancellationToken);
        if (existing is null)
        {
            await PostAsync(http, "${PUBLISHER_PREFIX}_evalresults", record, cancellationToken);
        }
        else
        {
            await PatchAsync(http, "${PUBLISHER_PREFIX}_evalresults", existing, record, cancellationToken);
        }

        if (Mirror.TryGetValue(ruleKey, out (string Score, string Reason) columns))
        {
            ConcurrentDictionary<string, object?> patch = patches.GetOrAdd(turnName, _ => new ConcurrentDictionary<string, object?>());
            patch[columns.Score] = score;
            patch[columns.Reason] = reason;
        }
    }

    private static string BuildPrompt(JsonNode rule, JsonNode turn)
    {
        int target = rule["${PUBLISHER_PREFIX}_target"]?.GetValue<int>() ?? 3;
        var parts = new List<string>
        {
            "# 評価ルール",
            $"## {Text(rule, "${PUBLISHER_PREFIX}_name")}",
            Text(rule, "${PUBLISHER_PREFIX}_summary"),
            "",
            "## 判定基準",
            Text(rule, "${PUBLISHER_PREFIX}_prompt"),
            "",
            "## スコア基準",
            Text(rule, "${PUBLISHER_PREFIX}_scoreguide") is { Length: > 0 } guide ? guide : "1〜5 の整数で、5 が最良です。",
            "",
            "# 評価対象のターン",
            $"相手: {Or(Text(turn, "${PUBLISHER_PREFIX}_actor"), "不明")}",
            $"経路: {Or(Text(turn, "${PUBLISHER_PREFIX}_source"), "不明")}",
            "",
            "## ユーザーの質問",
            Or(Text(turn, "${PUBLISHER_PREFIX}_query"), "(なし)"),
        };

        if (target is 1 or 3)
        {
            parts.AddRange(["", "## エージェントの応答", Or(Text(turn, "${PUBLISHER_PREFIX}_response"), "(なし)")]);
        }
        if (target is 2 or 3)
        {
            string calls = Text(turn, "${PUBLISHER_PREFIX}_toolcalls");
            int count = JsonNode.Parse(calls.Length > 0 ? calls : "[]") is JsonArray array ? array.Count : 0;
            parts.AddRange(["", $"## ツール呼び出し（{count} 件）", count > 0 ? calls : "(呼び出しなし)"]);
        }

        return string.Join("\n", parts);
    }

    /// <summary>Keeps a paraphrased quote but turns its highlight off, instead of dropping the note.</summary>
    private static JsonArray MarkMatches(JsonNode? evidence, JsonNode turn)
    {
        var sources = new Dictionary<string, string>
        {
            ["query"] = Text(turn, "${PUBLISHER_PREFIX}_query"),
            ["response"] = Text(turn, "${PUBLISHER_PREFIX}_response"),
            ["tool_call"] = Text(turn, "${PUBLISHER_PREFIX}_toolcalls"),
        };

        var marked = new JsonArray();
        foreach (JsonNode? item in evidence as JsonArray ?? [])
        {
            if (item is null)
            {
                continue;
            }
            string quote = (item["quote"]?.GetValue<string>() ?? "").Trim();
            string source = sources.GetValueOrDefault(item["kind"]?.GetValue<string>() ?? "", "");
            bool matched = quote.Length > 0
                && (source.Contains(quote, StringComparison.Ordinal)
                    || Blanks().Replace(source, "").Contains(Blanks().Replace(quote, ""), StringComparison.Ordinal));

            marked.Add(new JsonObject
            {
                ["kind"] = item["kind"]?.GetValue<string>(),
                ["quote"] = quote,
                ["note"] = item["note"]?.GetValue<string>(),
                ["polarity"] = item["polarity"]?.GetValue<string>(),
                ["matched"] = matched,
            });
        }
        return marked;
    }

    // --- Dataverse ----------------------------------------------------------

    private async Task<List<JsonNode>> GetAllAsync(HttpClient http, string path, CancellationToken cancellationToken)
    {
        var rows = new List<JsonNode>();
        string? uri = $"{_api}/{path}";
        while (uri is not null)
        {
            using HttpResponseMessage response = await http.GetAsync(uri, cancellationToken);
            string body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException($"Dataverse GET {(int)response.StatusCode}: {Cap(body, 500)}");
            }

            JsonNode page = JsonNode.Parse(body)!;
            foreach (JsonNode? row in page["value"] as JsonArray ?? [])
            {
                if (row is not null)
                {
                    rows.Add(row);
                }
            }
            uri = page["@odata.nextLink"]?.GetValue<string>();
        }
        return rows;
    }

    /// <summary>
    /// The turn id ends in a timezone offset like +00:00, and an unescaped + arrives as a space,
    /// so an unescaped lookup would miss and every upsert would insert a duplicate.
    /// </summary>
    private async Task<string?> FindIdAsync(
        HttpClient http, string set, string keyColumn, string value, string idColumn, CancellationToken cancellationToken)
    {
        string escaped = Uri.EscapeDataString(value.Replace("'", "''"));
        List<JsonNode> found = await GetAllAsync(
            http, $"{set}?$filter={keyColumn} eq '{escaped}'&$select={idColumn}", cancellationToken);
        return found.Count == 0 ? null : found[0][idColumn]?.GetValue<string>();
    }

    private Task PostAsync(HttpClient http, string set, IDictionary<string, object?> body, CancellationToken cancellationToken) =>
        SendAsync(http, HttpMethod.Post, $"{_api}/{set}", body, cancellationToken);

    private Task PatchAsync(HttpClient http, string set, string id, IDictionary<string, object?> body, CancellationToken cancellationToken) =>
        SendAsync(http, HttpMethod.Patch, $"{_api}/{set}({id})", body, cancellationToken);

    private static async Task SendAsync(
        HttpClient http, HttpMethod method, string uri, IDictionary<string, object?> body, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(method, uri)
        {
            Content = new StringContent(JsonSerializer.Serialize(body, Json), Encoding.UTF8, "application/json"),
        };
        using HttpResponseMessage response = await http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            string error = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new HttpRequestException($"Dataverse {method} {(int)response.StatusCode}: {Cap(error, 500)}");
        }
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Blanks();

    private static string Text(JsonNode node, string property) =>
        node[property] is { } value && value.GetValueKind() == JsonValueKind.String ? value.GetValue<string>() : "";

    private static string Or(string value, string fallback) => value.Length > 0 ? value : fallback;

    private static string Cap(string value, int max) => value.Length <= max ? value : value[..max];
}

using System.Net.Http.Headers;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Azure.Core;

/// <summary>
/// Mirrors the agent's SKILL.md files into Dataverse so the review app (AI チームメイト評価Hub)
/// can show them.
///
/// The skills live on the agent host as files; a Code App has no way to read that disk, and the
/// hub holds several teammates, so each teammate pushes its own copy tagged with its agent key.
/// Rows are matched on (agent key, skill key) and rewritten in place, so a rename leaves the old
/// row behind rather than silently replacing an unrelated skill.
/// </summary>
public sealed class SkillSync : BackgroundService
{
    private static readonly JsonSerializerOptions Json = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly TokenCredential _credential;
    private readonly IHttpClientFactory _factory;
    private readonly ILogger<SkillSync> _logger;
    private readonly string _api;
    private readonly string _scope;
    private readonly string _set;
    private readonly string _prefix;
    private readonly string _agentKey;
    private readonly string _directory;
    private readonly TimeSpan _interval;

    public SkillSync(
        IConfiguration configuration,
        TokenCredential credential,
        IHttpClientFactory factory,
        ILogger<SkillSync> logger)
    {
        _credential = credential;
        _factory = factory;
        _logger = logger;

        string org = (configuration["Dataverse:Url"] ?? "").TrimEnd('/');
        _api = $"{org}/api/data/v9.2";
        _scope = $"{org}/.default";
        _prefix = configuration["Evaluation:TablePrefix"] ?? "geek";
        _set = $"{_prefix}_skills";
        _agentKey = configuration["Agent:Key"] ?? "";
        _interval = TimeSpan.FromMinutes(Math.Max(5, configuration.GetValue("Skills:SyncMinutes", 30)));

        string configured = configuration["Skills:Directory"] is { Length: > 0 } value ? value : "skills";
        _directory = Path.IsPathRooted(configured)
            ? configured
            : Path.Combine(AppContext.BaseDirectory, configured);

        Enabled = configuration.GetValue("Skills:Enabled", true)
            && configuration.GetValue("Evaluation:SyncToDataverse", true)
            && org.Length > 0
            && _agentKey.Length > 0;
    }

    public bool Enabled { get; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!Enabled)
        {
            return;
        }

        using var timer = new PeriodicTimer(_interval);
        do
        {
            try
            {
                await SyncAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Skill sync failed; retrying at the next interval");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task SyncAsync(CancellationToken cancellationToken)
    {
        if (!Directory.Exists(_directory))
        {
            _logger.LogWarning("Skills are enabled but {Directory} does not exist; nothing to sync", _directory);
            return;
        }

        using HttpClient http = await OpenAsync(cancellationToken);
        string escapedAgent = Uri.EscapeDataString(_agentKey.Replace("'", "''"));
        List<JsonNode> existing = await GetAsync(
            http,
            $"{_set}?$filter={_prefix}_agentkey eq '{escapedAgent}'&$select={_prefix}_skillid,{_prefix}_skillkey",
            cancellationToken);
        Dictionary<string, string> byKey = existing
            .Where(row => Text(row, $"{_prefix}_skillkey").Length > 0)
            .GroupBy(row => Text(row, $"{_prefix}_skillkey"), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => Text(g.First(), $"{_prefix}_skillid"), StringComparer.OrdinalIgnoreCase);

        int synced = 0;
        foreach (string file in Directory.EnumerateFiles(_directory, "SKILL.md", SearchOption.AllDirectories))
        {
            string key = Path.GetFileName(Path.GetDirectoryName(file)) ?? "";
            if (key.Length == 0)
            {
                continue;
            }

            string body = await File.ReadAllTextAsync(file, cancellationToken);
            var record = new Dictionary<string, object?>
            {
                [$"{_prefix}_name"] = Cap($"{key}", 100),
                [$"{_prefix}_agentkey"] = _agentKey,
                [$"{_prefix}_skillkey"] = Cap(key, 200),
                [$"{_prefix}_title"] = Cap(Title(body, key), 200),
                [$"{_prefix}_summary"] = Cap(Summary(body), 4000),
                [$"{_prefix}_body"] = Cap(body, 1_048_576),
                [$"{_prefix}_builtin"] = true,
                [$"{_prefix}_syncedon"] = DateTimeOffset.UtcNow.ToString("o"),
            };

            if (byKey.TryGetValue(key, out string? id))
            {
                await SendAsync(http, HttpMethod.Patch, $"{_api}/{_set}({id})", record, cancellationToken);
            }
            else
            {
                await SendAsync(http, HttpMethod.Post, $"{_api}/{_set}", record, cancellationToken);
            }
            synced++;
        }

        _logger.LogInformation("Synced {Count} skills for {AgentKey}", synced, _agentKey);
    }

    /// <summary>The first Markdown heading, falling back to the folder name.</summary>
    private static string Title(string body, string fallback)
    {
        foreach (string line in body.Split('\n'))
        {
            string trimmed = line.Trim();
            if (trimmed.StartsWith("# ", StringComparison.Ordinal))
            {
                return trimmed[2..].Trim();
            }
        }
        return fallback;
    }

    /// <summary>
    /// The frontmatter <c>description</c>, which is what the runtime itself uses to decide whether
    /// to open a skill, so the hub shows the same text the agent reads.
    /// </summary>
    private static string Summary(string body)
    {
        string[] lines = body.Split('\n');
        var collected = new List<string>();
        bool inside = false;
        foreach (string raw in lines)
        {
            string line = raw.TrimEnd('\r');
            if (line.Trim() == "---")
            {
                if (collected.Count > 0)
                {
                    break;
                }
                inside = !inside;
                if (!inside)
                {
                    break;
                }
                continue;
            }
            if (!inside)
            {
                continue;
            }

            if (collected.Count > 0)
            {
                // A folded block ends at the next top-level key.
                if (line.Length > 0 && !char.IsWhiteSpace(line[0]))
                {
                    break;
                }
                collected.Add(line.Trim());
            }
            else if (line.StartsWith("description:", StringComparison.OrdinalIgnoreCase))
            {
                string rest = line["description:".Length..].Trim();
                if (rest.Length > 0 && rest is not ("|" or ">" or "|-" or ">-"))
                {
                    return rest.Trim('"', '\'');
                }
                collected.Add("");
            }
        }
        return string.Join(" ", collected.Where(l => l.Length > 0)).Trim();
    }

    // --- Dataverse ----------------------------------------------------------

    private async Task<HttpClient> OpenAsync(CancellationToken cancellationToken)
    {
        AccessToken token = await _credential.GetTokenAsync(new TokenRequestContext([_scope]), cancellationToken);
        HttpClient http = _factory.CreateClient();
        http.Timeout = TimeSpan.FromMinutes(5);
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);
        http.DefaultRequestHeaders.Add("OData-Version", "4.0");
        http.DefaultRequestHeaders.Add("OData-MaxVersion", "4.0");
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return http;
    }

    private async Task<List<JsonNode>> GetAsync(HttpClient http, string path, CancellationToken cancellationToken)
    {
        using HttpResponseMessage response = await http.GetAsync($"{_api}/{path}", cancellationToken);
        string body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"Dataverse GET {(int)response.StatusCode}: {Cap(body, 500)}");
        }

        return [.. (JsonNode.Parse(body)!["value"] as JsonArray ?? []).Where(n => n is not null).Select(n => n!)];
    }

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

    private static string Text(JsonNode node, string property) =>
        node[property] is { } value && value.GetValueKind() == JsonValueKind.String ? value.GetValue<string>() : "";

    private static string Cap(string value, int max) => value.Length <= max ? value : value[..max];
}

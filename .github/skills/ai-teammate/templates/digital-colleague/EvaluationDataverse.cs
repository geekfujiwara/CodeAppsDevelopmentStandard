using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Azure.Core;

/// <summary>
/// Mirrors a turn into the Dataverse table the review dashboard (AI チームメイト評価Hub) reads, so a
/// conversation is visible there straight away instead of only after the nightly evaluation run.
/// Scores are left empty on purpose: the evaluator fills them in later, matching on the same
/// row id, so nothing written here is lost.
/// </summary>
public sealed class EvaluationDataverse
{
    private const string EntitySet = "${PUBLISHER_PREFIX}_evalturns";

    private readonly TokenCredential _credential;
    private readonly IHttpClientFactory _factory;
    private readonly ILogger<EvaluationDataverse> _logger;
    private readonly string _api;
    private readonly string _scope;

    public EvaluationDataverse(
        IConfiguration configuration,
        TokenCredential credential,
        IHttpClientFactory factory,
        ILogger<EvaluationDataverse> logger)
    {
        _credential = credential;
        _factory = factory;
        _logger = logger;

        string org = (configuration["Dataverse:Url"] ?? "").TrimEnd('/');
        Enabled = configuration.GetValue("Evaluation:SyncToDataverse", true) && org.Length > 0;
        _api = $"{org}/api/data/v9.2";
        _scope = $"{org}/.default";

        if (Enabled)
        {
            logger.LogInformation("Evaluation rows sync to {Api}", _api);
        }
    }

    public bool Enabled { get; }

    public async Task UpsertAsync(EvaluationDataverseRow row, CancellationToken cancellationToken)
    {
        if (!Enabled)
        {
            return;
        }

        try
        {
            AccessToken token = await _credential.GetTokenAsync(new TokenRequestContext([_scope]), cancellationToken);
            using HttpClient http = _factory.CreateClient();
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);
            http.DefaultRequestHeaders.Add("OData-Version", "4.0");
            http.DefaultRequestHeaders.Add("OData-MaxVersion", "4.0");
            http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            string? id = await FindAsync(http, row.RowId, cancellationToken);
            var record = new Dictionary<string, object?>
            {
                ["${PUBLISHER_PREFIX}_name"] = row.RowId,
                ["${PUBLISHER_PREFIX}_occurredon"] = row.OccurredOn,
                ["${PUBLISHER_PREFIX}_actor"] = row.Actor ?? "",
                ["${PUBLISHER_PREFIX}_source"] = row.Source ?? "",
                ["${PUBLISHER_PREFIX}_query"] = row.Query,
                ["${PUBLISHER_PREFIX}_response"] = row.Response,
                ["${PUBLISHER_PREFIX}_toolcalls"] = row.ToolCallsJson,
                ["${PUBLISHER_PREFIX}_toolcount"] = row.ToolCount,
            };

            using var body = new StringContent(JsonSerializer.Serialize(record), Encoding.UTF8, "application/json");
            using HttpResponseMessage response = id is null
                ? await http.PostAsync($"{_api}/{EntitySet}", body, cancellationToken)
                : await http.PatchAsync($"{_api}/{EntitySet}({id})", body, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                string error = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning(
                    "Dataverse rejected the evaluation row: HTTP {Status} {Error}",
                    (int)response.StatusCode, Truncate(error));
                return;
            }

            _logger.LogInformation("Evaluation row {RowId} {Action} in Dataverse", row.RowId, id is null ? "created" : "updated");
        }
        catch (Exception ex)
        {
            // A dashboard row is never worth failing a turn over.
            _logger.LogWarning(ex, "Could not sync the evaluation row to Dataverse");
        }
    }

    private async Task<string?> FindAsync(HttpClient http, string rowId, CancellationToken cancellationToken)
    {
        string filter = Uri.EscapeDataString($"${PUBLISHER_PREFIX}_name eq '{rowId.Replace("'", "''")}'");
        using HttpResponseMessage response = await http.GetAsync(
            $"{_api}/{EntitySet}?$filter={filter}&$select=${PUBLISHER_PREFIX}_evalturnid", cancellationToken);
        response.EnsureSuccessStatusCode();

        using JsonDocument document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        JsonElement rows = document.RootElement.GetProperty("value");
        return rows.GetArrayLength() == 0 ? null : rows[0].GetProperty("${PUBLISHER_PREFIX}_evalturnid").GetString();
    }

    private static string Truncate(string value) => value.Length <= 500 ? value : value[..500];
}

public sealed record EvaluationDataverseRow(
    string RowId,
    DateTimeOffset OccurredOn,
    string? Actor,
    string? Source,
    string Query,
    string Response,
    string ToolCallsJson,
    int ToolCount);

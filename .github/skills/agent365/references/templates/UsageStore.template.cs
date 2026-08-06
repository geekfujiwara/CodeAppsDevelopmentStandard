// 利用実績とコストの記録（B15）。
//
// Azure の課金は「エージェント 1 体 = マネージド ID 1 つ」でしか集計されない。
// 誰が使ったか・どの処理が使ったか・どのツールが高いかは、Azure Cost Management でも
// 診断ログでも**復元できない**。起きたその場で書き残すしかない。
// → 後から入れると、それ以前の実績は永久に取れない。B3（頭脳）と同時に入れる。
//
// 記録の単位は「1 ターン」。ツール ループは 1 つの依頼で何往復もするので、
// モデル呼び出し単位で記録すると「この依頼はいくらだったか」に答えられない。
//
// Program.cs:
//   builder.Services.AddSingleton<UsageStore>();
//
// アプリ設定（__ が階層区切り）:
//   Usage__Enabled                       = true
//   Usage__StorePath                     = /home/data/usage（未設定なら %HOME%/data/usage）
//   Usage__Currency                      = USD（Azure のメーターは USD 建て）
//   Usage__JpyRate                       = 150（円の併記に使う固定レート。0 で併記しない）
//   Usage__Admins__0                     = 全員分を閲覧できる人のメール アドレス
//   Usage__Pricing__<deployment>__Input        = 1000 トークンあたりの単価
//   Usage__Pricing__<deployment>__CachedInput  = 省略時は Input と同額
//   Usage__Pricing__<deployment>__Output       = 1000 トークンあたりの単価
//
// ⚠ 単価は「デプロイの SKU」で変わる（GlobalStandard / DataZone / Batch）。
//   az cognitiveservices account deployment list で実際の SKU を確認してから入れる。
// ⚠ スケールアウトするとインスタンスごとにファイルを持つため集計が割れる。
//   numberOfWorkers=1 を維持するか、保存先を共有ストアへ移す。

using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

/// <summary>Who and what a model call is being spent on. Attached by the caller of the tool loop.</summary>
public sealed record UsageContext(string Source, string? Actor);

/// <summary>One completed turn: every model round trip the tool loop made to answer it.</summary>
public sealed class UsageRecord
{
    public DateTimeOffset At { get; set; }

    /// <summary>chat / schedule / mailbox — which entry point spent this.</summary>
    public string Source { get; set; } = string.Empty;

    public string? Actor { get; set; }

    public string Model { get; set; } = string.Empty;

    public int InputTokens { get; set; }

    public int CachedTokens { get; set; }

    public int OutputTokens { get; set; }

    public int ReasoningTokens { get; set; }

    /// <summary>Model round trips. One user message can cost many when tools are involved.</summary>
    public int Calls { get; set; }

    public string[] Tools { get; set; } = [];

    public int DurationMs { get; set; }

    public bool Failed { get; set; }
}

/// <summary>
/// Append-only usage log. Azure only bills one managed identity, so per-person and per-tool
/// attribution cannot be recovered afterwards — it has to be written down as it happens.
/// </summary>
public sealed class UsageStore
{
    private static readonly JsonSerializerOptions Json = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly object _gate = new();
    private readonly string _directory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<UsageStore> _logger;

    public UsageStore(IConfiguration configuration, IHostEnvironment environment, ILogger<UsageStore> logger)
    {
        _configuration = configuration;
        _logger = logger;

        // %HOME% is the persistent share on App Service; locally it falls back to the content root.
        _directory = configuration["Usage:StorePath"]
            ?? Path.Combine(Environment.GetEnvironmentVariable("HOME") ?? environment.ContentRootPath, "data", "usage");
    }

    public bool Enabled => _configuration.GetValue("Usage:Enabled", true);

    public string Currency => _configuration["Usage:Currency"] ?? "USD";

    public void Record(UsageRecord record)
    {
        if (!Enabled)
        {
            return;
        }

        try
        {
            lock (_gate)
            {
                Directory.CreateDirectory(_directory);
                File.AppendAllText(PathFor(record.At), JsonSerializer.Serialize(record, Json) + "\n", Encoding.UTF8);
            }
        }
        catch (Exception ex)
        {
            // Never let bookkeeping break a reply.
            _logger.LogWarning(ex, "Usage record could not be written");
        }
    }

    public IReadOnlyList<UsageRecord> Read(DateTimeOffset from, DateTimeOffset to)
    {
        var records = new List<UsageRecord>();
        if (!Directory.Exists(_directory))
        {
            return records;
        }

        for (var month = new DateTime(from.Year, from.Month, 1); month <= to.UtcDateTime; month = month.AddMonths(1))
        {
            string path = Path.Combine(_directory, $"usage-{month:yyyy-MM}.jsonl");
            if (!File.Exists(path))
            {
                continue;
            }

            lock (_gate)
            {
                foreach (string line in File.ReadLines(path))
                {
                    if (line.Length == 0)
                    {
                        continue;
                    }

                    UsageRecord? record;
                    try
                    {
                        record = JsonSerializer.Deserialize<UsageRecord>(line, Json);
                    }
                    catch (JsonException)
                    {
                        // A half-written last line must not hide the rest of the month.
                        continue;
                    }

                    if (record is not null && record.At >= from && record.At < to)
                    {
                        records.Add(record);
                    }
                }
            }
        }

        return records;
    }

    /// <summary>Null when no unit price is configured for the model, so the report can say so.</summary>
    public decimal? CostOf(UsageRecord record)
    {
        IConfigurationSection pricing = _configuration.GetSection($"Usage:Pricing:{record.Model}");
        if (!pricing.Exists())
        {
            return null;
        }

        decimal input = pricing.GetValue<decimal>("Input");
        decimal cached = pricing.GetValue("CachedInput", input);
        decimal output = pricing.GetValue<decimal>("Output");
        if (input == 0m && output == 0m)
        {
            return null;
        }

        // Cached input is billed at roughly a tenth, so it must not be counted twice.
        int uncached = Math.Max(record.InputTokens - record.CachedTokens, 0);
        return (uncached * input + record.CachedTokens * cached + record.OutputTokens * output) / 1000m;
    }

    private string PathFor(DateTimeOffset at) => Path.Combine(_directory, $"usage-{at:yyyy-MM}.jsonl");
}

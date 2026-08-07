// 利用実績レポート ツール（B15）。
//
// 「誰が / 何の処理が / どのツールが」使ったかを本人に聞かれた形で返す。
// Azure ポータルではこの内訳を出せないので、ここが唯一の答えになる。
//
// ★ 個人別の利用量は個人情報。既定では Usage__Admins に載っている人だけが全体を見られ、
//   それ以外の人には本人の分だけを返す。Admins が空だと全員が全員分を見られる。
//
// Program.cs:
//   builder.Services.AddSingleton<UsageTools>();
//   // ツールセット構築時: if (usage.Enabled) toolset.AddLocal(usageTools.CreateTools(userEmail));
//
// アプリ設定は UsageStore.template.cs のヘッダーを参照。

using System.Globalization;
using System.Text;
using System.Text.Json;

/// <summary>
/// Answers "who used me, for what, and what did it cost" from the usage log.
/// Azure Cost Management can only show the whole AI account as one line, so this is
/// the only place the per-person and per-tool breakdown exists.
/// </summary>
public sealed class UsageTools(UsageStore store, IConfiguration configuration)
{
    private static readonly TimeZoneInfo LocalZone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Tokyo");

    public IReadOnlyList<LocalTool> CreateTools(string? callerEmail) =>
    [
        new LocalTool(
            new McpToolDefinition(
                "usage_report",
                "自分（エージェント）の利用実績を集計する。誰がどれだけ使ったか、どの処理にコストが掛かっているかを答えるときに使う。"
                + "トークン数と、単価が設定されていれば概算費用を返す。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "period": {
                          "type": "string",
                          "enum": ["today", "yesterday", "week", "month", "last_month", "all"],
                          "description": "集計期間。week=直近 7 日、month=今月、last_month=先月。既定は month。"
                        },
                        "group_by": {
                          "type": "string",
                          "enum": ["actor", "source", "tool", "day", "model"],
                          "description": "内訳の切り口。actor=相手（利用者）別、source=処理の種類別（対話/定期配信/受信トレイ）、tool=呼び出したツール別、day=日別、model=モデル別。既定は source。"
                        }
                      }
                    }
                    """)),
            (arguments, _) => Task.FromResult(Report(arguments, callerEmail))),
    ];

    private string Report(JsonElement arguments, string? callerEmail)
    {
        string period = ReadString(arguments, "period") ?? "month";
        string groupBy = ReadString(arguments, "group_by") ?? "source";

        if (!store.Enabled)
        {
            return "ツールがエラーを返しました: 利用実績の記録が無効になっています（Usage:Enabled）。";
        }

        (DateTimeOffset from, DateTimeOffset to, string label) = Range(period);
        IReadOnlyList<UsageRecord> records = store.Read(from, to);

        // Per-person usage is personal data; only the listed admins may see other people's rows.
        string[] admins = configuration.GetSection("Usage:Admins").Get<string[]>() ?? [];
        bool maySeeOthers = admins.Length == 0
            || (callerEmail is not null && admins.Contains(callerEmail, StringComparer.OrdinalIgnoreCase));
        if (!maySeeOthers)
        {
            records = [.. records.Where(r => string.Equals(r.Actor, callerEmail, StringComparison.OrdinalIgnoreCase))];
        }

        if (records.Count == 0)
        {
            return $"{label}の利用実績はまだ記録されていません。"
                + "（記録は計測を入れた時点から始まります。それ以前の分は残っていません。）";
        }

        var builder = new StringBuilder();
        builder.AppendLine($"## {label}の利用実績（{groupBy} 別）");
        builder.AppendLine();
        builder.AppendLine(Totals(records));
        builder.AppendLine();

        if (!maySeeOthers)
        {
            builder.AppendLine("> 表示は依頼者本人の分のみです（全体を見られるのは Usage:Admins に登録された人だけ）。");
            builder.AppendLine();
        }

        builder.AppendLine(groupBy switch
        {
            "actor" => Breakdown(records, r => r.Actor ?? "(不明)", "相手"),
            "tool" => ToolBreakdown(records),
            "day" => Breakdown(records, r => ToLocal(r.At).ToString("MM/dd (ddd)", CultureInfo.GetCultureInfo("ja-JP")), "日"),
            "model" => Breakdown(records, r => r.Model, "モデル"),
            _ => Breakdown(records, r => SourceLabel(r.Source), "処理"),
        });

        builder.AppendLine();
        builder.AppendLine("※ ここに出るのはモデルのトークン費用だけ。App Service（定額）とコード実行サンドボックスは別途かかる。");

        // An unattributable record is a bug at the entry point, not a fact about the month.
        if (records.Count(r => string.IsNullOrEmpty(r.Actor)) is > 0 and int unattributed)
        {
            builder.AppendLine($"※ 相手を特定できない記録が {unattributed} 件ある。"
                + "入口が UsageContext に Actor を渡していない可能性が高い（後からは埋められない）。");
        }

        if (records.All(r => store.CostOf(r) is null))
        {
            builder.AppendLine("※ 単価が未設定のため金額は出せない。appsettings の `Usage:Pricing:<モデル名>:Input` / `Output`（1000 トークンあたり）を設定する。");
        }
        else if (JpyRate > 0m && string.Equals(store.Currency, "USD", StringComparison.OrdinalIgnoreCase))
        {
            builder.AppendLine($"※ 円は 1 USD = {JpyRate:N0} 円の固定換算。実際の請求額はその月の為替レートで決まる。");
        }

        return builder.ToString().TrimEnd();
    }

    private string Totals(IReadOnlyList<UsageRecord> records)
    {
        int turns = records.Count;
        int people = records.Select(r => r.Actor).Where(a => !string.IsNullOrEmpty(a))
            .Distinct(StringComparer.OrdinalIgnoreCase).Count();
        int calls = records.Sum(r => r.Calls);
        long input = records.Sum(r => (long)r.InputTokens);
        long output = records.Sum(r => (long)r.OutputTokens);
        long cached = records.Sum(r => (long)r.CachedTokens);
        long reasoning = records.Sum(r => (long)r.ReasoningTokens);

        var builder = new StringBuilder();
        builder.AppendLine($"- やり取り: **{turns} 回**（相手 {people} 人 / モデル呼び出し {calls} 回）");
        builder.AppendLine($"- トークン: 入力 {input:N0}（うちキャッシュ {cached:N0}） / 出力 {output:N0}（うち推論 {reasoning:N0}）");
        if (Cost(records) is { } cost)
        {
            builder.AppendLine($"- 概算費用: **{Money(cost)}**");
        }

        int failed = records.Count(r => r.Failed);
        if (failed > 0)
        {
            builder.AppendLine($"- 途中で失敗: {failed} 回");
        }

        return builder.ToString().TrimEnd();
    }

    private string Breakdown(IReadOnlyList<UsageRecord> records, Func<UsageRecord, string> key, string header)
    {
        var rows = records
            .GroupBy(key)
            .Select(g => new
            {
                Key = g.Key,
                Turns = g.Count(),
                Tokens = g.Sum(r => (long)r.InputTokens + r.OutputTokens),
                Cost = Cost([.. g]),
            })
            .OrderByDescending(r => r.Tokens)
            .ToList();

        long total = Math.Max(rows.Sum(r => r.Tokens), 1);
        bool priced = rows.Any(r => r.Cost is not null);

        var builder = new StringBuilder();
        builder.AppendLine(priced
            ? $"| {header} | 回数 | トークン | 割合 | 概算費用 |"
            : $"| {header} | 回数 | トークン | 割合 |");
        builder.AppendLine(priced ? "|---|---:|---:|---:|---:|" : "|---|---:|---:|---:|");
        foreach (var row in rows)
        {
            string share = $"{row.Tokens * 100.0 / total:N1}%";
            builder.AppendLine(priced
                ? $"| {row.Key} | {row.Turns:N0} | {row.Tokens:N0} | {share} | {(row.Cost is { } c ? Money(c) : "—")} |"
                : $"| {row.Key} | {row.Turns:N0} | {row.Tokens:N0} | {share} |");
        }

        return builder.ToString().TrimEnd();
    }

    /// <summary>Tools are counted per invocation, so the rows do not add up to the turn count.</summary>
    private static string ToolBreakdown(IReadOnlyList<UsageRecord> records)
    {
        var rows = records
            .SelectMany(r => r.Tools.Select(tool => (Tool: tool, Record: r)))
            .GroupBy(x => x.Tool)
            .Select(g => new
            {
                Tool = g.Key,
                Count = g.Count(),
                Turns = g.Select(x => x.Record).Distinct().Count(),
            })
            .OrderByDescending(r => r.Count)
            .ToList();

        if (rows.Count == 0)
        {
            return "ツールの呼び出しはありませんでした。";
        }

        var builder = new StringBuilder();
        builder.AppendLine("| ツール | 呼び出し回数 | 使われたやり取り |");
        builder.AppendLine("|---|---:|---:|");
        foreach (var row in rows)
        {
            builder.AppendLine($"| {row.Tool} | {row.Count:N0} | {row.Turns:N0} |");
        }

        builder.AppendLine();
        builder.AppendLine("> ツール 1 回ごとにモデルをもう一往復するため、呼び出し回数がそのままコスト要因になる。");
        return builder.ToString().TrimEnd();
    }

    private decimal? Cost(IReadOnlyList<UsageRecord> records)
    {
        decimal total = 0m;
        bool any = false;
        foreach (UsageRecord record in records)
        {
            if (store.CostOf(record) is { } cost)
            {
                total += cost;
                any = true;
            }
        }

        return any ? total : null;
    }

    private decimal JpyRate => configuration.GetValue<decimal?>("Usage:JpyRate") ?? 150m;

    /// <summary>
    /// Azure bills in USD, so the yen figure is a fixed-rate approximation, not the invoice.
    /// One turn costs cents, so small amounts keep more digits instead of collapsing to 0.00.
    /// </summary>
    private string Money(decimal cost)
    {
        string amount = $"{cost.ToString(cost < 1m ? "N4" : "N2", CultureInfo.InvariantCulture)} {store.Currency}";
        if (JpyRate <= 0m || !string.Equals(store.Currency, "USD", StringComparison.OrdinalIgnoreCase))
        {
            return amount;
        }

        decimal yen = cost * JpyRate;
        return $"{amount}（約 {yen.ToString(yen < 10m ? "N1" : "N0", CultureInfo.InvariantCulture)} 円）";
    }

    private static string SourceLabel(string source) => source switch
    {
        "chat" => "Teams での対話",
        "schedule" => "定期配信",
        "mailbox" => "受信トレイ監視",
        _ => source,
    };

    private static (DateTimeOffset From, DateTimeOffset To, string Label) Range(string period)
    {
        DateTimeOffset now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, LocalZone);
        DateTimeOffset today = new(now.Date, now.Offset);
        return period switch
        {
            "today" => (today, today.AddDays(1), "今日"),
            "yesterday" => (today.AddDays(-1), today, "昨日"),
            "week" => (today.AddDays(-6), today.AddDays(1), "直近 7 日"),
            "last_month" => (StartOfMonth(today.AddMonths(-1)), StartOfMonth(today), "先月"),
            "all" => (DateTimeOffset.MinValue.ToUniversalTime(), today.AddDays(1), "全期間"),
            _ => (StartOfMonth(today), today.AddDays(1), "今月"),
        };
    }

    private static DateTimeOffset StartOfMonth(DateTimeOffset value) =>
        new(new DateTime(value.Year, value.Month, 1), value.Offset);

    private static DateTimeOffset ToLocal(DateTimeOffset value) => TimeZoneInfo.ConvertTime(value, LocalZone);

    private static JsonElement Schema(string json) => JsonSerializer.Deserialize<JsonElement>(json);

    private static string? ReadString(JsonElement arguments, string name) =>
        arguments.ValueKind == JsonValueKind.Object
        && arguments.TryGetProperty(name, out JsonElement value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}

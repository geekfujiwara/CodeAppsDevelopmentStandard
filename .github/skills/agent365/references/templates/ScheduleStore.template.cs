// 定期実行（B11）のデータモデルと永続化。
//
// スケジュールをコードに埋めずデータとして持つための型。保存先は App Service の
// 永続領域（%HOME%）上の JSON ファイルで、再起動と再デプロイをまたいで残る。
// 時刻の判定はすべて JST、保存は UTC。設計判断と切り分けは references/scheduled-delivery.md。
//
// タイム ゾーンは導入先の業務時間に合わせて変える（Zone 定数）。DST のある地域に
// 向ける場合でも GetUtcOffset を通しているので、切り替わり日をまたいでも時刻はずれない。
//
// Program.cs:
//   builder.Services.AddSingleton<ScheduleStore>();
//
// アプリ設定（__ が階層区切り）:
//   Schedule__StorePath      = 省略可。未設定なら %HOME%/data/schedules.json
//   Schedule__CatchUpMinutes = 30（停止中に過ぎた実行をどこまで遡って流すか）
//
// ⚠ スケールアウトするとインスタンスごとにファイルを持つため二重配信になる。
//   B11 を入れるアプリは numberOfWorkers=1 を維持するか、保存先を共有ストアへ移す。

using System.Text.Json;
using System.Text.Json.Serialization;

/// <summary>A recurring job the agent runs on its own and delivers to a person.</summary>
public sealed class ScheduledJob
{
    public string Id { get; set; } = string.Empty;

    /// <summary>Short label shown when listing schedules, e.g. "競合ニュースの朝ダイジェスト".</summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>What the agent should actually do each time, in natural language.</summary>
    public string Instruction { get; set; } = string.Empty;

    /// <summary>daily / weekdays / weekly / monthly.</summary>
    public string Frequency { get; set; } = "weekdays";

    /// <summary>HH:mm in JST.</summary>
    public string Time { get; set; } = "08:00";

    /// <summary>mon..sun, for the weekly frequency.</summary>
    public string? Weekday { get; set; }

    /// <summary>1-31, for the monthly frequency. Clamped to the last day of short months.</summary>
    public int? DayOfMonth { get; set; }

    /// <summary>chat / mail.</summary>
    public string Channel { get; set; } = "chat";

    /// <summary>Recipient address (UPN or mail address).</summary>
    public string Recipient { get; set; } = string.Empty;

    /// <summary>Mail subject. Ignored for chat delivery.</summary>
    public string? Subject { get; set; }

    public string? RequestedBy { get; set; }

    public bool Enabled { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? LastRunAt { get; set; }

    public DateTimeOffset NextRunAt { get; set; }

    [JsonIgnore]
    public string Recurrence => Frequency switch
    {
        "daily" => $"毎日 {Time}",
        "weekdays" => $"平日 {Time}",
        "weekly" => $"毎週{ScheduleStore.WeekdayLabel(Weekday)}曜 {Time}",
        "monthly" => $"毎月 {DayOfMonth ?? 1} 日 {Time}",
        _ => $"{Frequency} {Time}",
    };

    [JsonIgnore]
    public string ChannelLabel => Channel == "mail" ? "メール" : "Teams チャット";

    public string Describe() =>
        $"- id: {Id}\n  件名: {Title}\n  頻度: {Recurrence} (JST)\n  配信: {ChannelLabel} → {Recipient}\n"
        + $"  次回: {ScheduleStore.ToLocalText(NextRunAt)}\n  状態: {(Enabled ? "有効" : "停止中")}\n  内容: {Instruction}";
}

/// <summary>
/// Schedules live in a JSON file under the App Service persistent share, so they survive
/// restarts and deployments without adding a database to the solution.
/// </summary>
public sealed class ScheduleStore
{
    public static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Tokyo");

    private static readonly JsonSerializerOptions FileFormat = new()
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private static readonly string[] WeekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    private static readonly string[] WeekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

    private readonly object _gate = new();
    private readonly string _path;
    private readonly ILogger<ScheduleStore> _logger;
    private readonly List<ScheduledJob> _jobs;

    public ScheduleStore(IConfiguration configuration, IHostEnvironment environment, ILogger<ScheduleStore> logger)
    {
        _logger = logger;

        // %HOME% is the persistent share on App Service; locally it falls back to the content root.
        string root = configuration["Schedule:StorePath"]
            ?? Path.Combine(Environment.GetEnvironmentVariable("HOME") ?? environment.ContentRootPath, "data", "schedules.json");
        _path = root;
        _jobs = Load();

        // A restart must not replay everything that was due while the app was down, but a job that
        // came due moments ago should still go out.
        DateTimeOffset floor = DateTimeOffset.UtcNow - TimeSpan.FromMinutes(
            Math.Clamp(configuration.GetValue("Schedule:CatchUpMinutes", 30), 0, 720));
        foreach (ScheduledJob job in _jobs)
        {
            job.NextRunAt = ComputeNextRun(job, floor);
            if (job.LastRunAt is { } last && job.NextRunAt <= last)
            {
                job.NextRunAt = ComputeNextRun(job, last);
            }
        }
    }

    public IReadOnlyList<ScheduledJob> All()
    {
        lock (_gate)
        {
            return _jobs.OrderBy(j => j.NextRunAt).ToList();
        }
    }

    public ScheduledJob? Find(string id)
    {
        lock (_gate)
        {
            return _jobs.FirstOrDefault(j => string.Equals(j.Id, id, StringComparison.OrdinalIgnoreCase));
        }
    }

    public ScheduledJob Add(ScheduledJob job)
    {
        job.Id = Guid.NewGuid().ToString("N")[..8];
        job.CreatedAt = DateTimeOffset.UtcNow;
        job.NextRunAt = ComputeNextRun(job, DateTimeOffset.UtcNow);

        lock (_gate)
        {
            _jobs.Add(job);
            Save();
        }

        _logger.LogInformation("Scheduled job {Id} '{Title}' every {Recurrence}", job.Id, job.Title, job.Recurrence);
        return job;
    }

    public bool Remove(string id)
    {
        lock (_gate)
        {
            int removed = _jobs.RemoveAll(j => string.Equals(j.Id, id, StringComparison.OrdinalIgnoreCase));
            if (removed == 0)
            {
                return false;
            }

            Save();
            return true;
        }
    }

    public bool RunNow(string id)
    {
        lock (_gate)
        {
            if (_jobs.FirstOrDefault(j => string.Equals(j.Id, id, StringComparison.OrdinalIgnoreCase)) is not { } job)
            {
                return false;
            }

            job.Enabled = true;
            job.NextRunAt = DateTimeOffset.UtcNow;
            Save();
            return true;
        }
    }

    /// <summary>
    /// Returns the jobs that are due and immediately advances them, so a failure inside the run
    /// cannot make the same delivery go out again on the next tick.
    /// </summary>
    public List<ScheduledJob> ClaimDue(DateTimeOffset now)
    {
        lock (_gate)
        {
            List<ScheduledJob> due = _jobs.Where(j => j.Enabled && j.NextRunAt <= now).ToList();
            if (due.Count == 0)
            {
                return due;
            }

            foreach (ScheduledJob job in due)
            {
                job.LastRunAt = now;
                job.NextRunAt = ComputeNextRun(job, now);
            }

            Save();
            return due;
        }
    }

    /// <summary>Returns a Japanese error message, or null when the job can be scheduled.</summary>
    public static string? Validate(ScheduledJob job)
    {
        if (job.Title.Trim().Length == 0 || job.Instruction.Trim().Length == 0)
        {
            return "title と instruction は必須です。";
        }

        if (job.Frequency is not ("daily" or "weekdays" or "weekly" or "monthly"))
        {
            return "frequency は daily / weekdays / weekly / monthly のいずれかにしてください。";
        }

        if (!TryParseTime(job.Time, out _, out _))
        {
            return "time は 24 時間表記の HH:mm（JST）で指定してください。例: 08:00";
        }

        if (job.Frequency == "weekly" && Array.IndexOf(WeekdayKeys, job.Weekday?.ToLowerInvariant()) < 0)
        {
            return "frequency が weekly のときは weekday を mon〜sun で指定してください。";
        }

        if (job.Frequency == "monthly" && job.DayOfMonth is not (>= 1 and <= 31))
        {
            return "frequency が monthly のときは day_of_month を 1〜31 で指定してください。";
        }

        if (job.Channel is not ("chat" or "mail"))
        {
            return "channel は chat か mail を指定してください。";
        }

        if (!job.Recipient.Contains('@'))
        {
            return "recipient には配信先のメール アドレス（UPN）を指定してください。";
        }

        return null;
    }

    public static DateTimeOffset ComputeNextRun(ScheduledJob job, DateTimeOffset after)
    {
        if (!TryParseTime(job.Time, out int hour, out int minute))
        {
            hour = 8;
            minute = 0;
        }

        DateTimeOffset local = TimeZoneInfo.ConvertTime(after, Zone);
        for (int offset = 0; offset <= 366; offset++)
        {
            DateTime day = local.Date.AddDays(offset);
            if (!Matches(job, day))
            {
                continue;
            }

            DateTime naive = day.AddHours(hour).AddMinutes(minute);
            var candidate = new DateTimeOffset(naive, Zone.GetUtcOffset(naive));
            if (candidate > local)
            {
                return candidate.ToUniversalTime();
            }
        }

        return after.AddYears(1);
    }

    public static string ToLocalText(DateTimeOffset instant) =>
        TimeZoneInfo.ConvertTime(instant, Zone).ToString("yyyy-MM-dd (ddd) HH:mm") + " JST";

    public static string WeekdayLabel(string? weekday)
    {
        int index = Array.IndexOf(WeekdayKeys, weekday?.ToLowerInvariant());
        return index < 0 ? "?" : WeekdayLabels[index];
    }

    private static bool Matches(ScheduledJob job, DateTime day) => job.Frequency switch
    {
        "daily" => true,
        "weekdays" => day.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday),
        "weekly" => (int)day.DayOfWeek == Array.IndexOf(WeekdayKeys, job.Weekday?.ToLowerInvariant()),
        // The 31st still fires in February, on the last day.
        "monthly" => day.Day == Math.Min(job.DayOfMonth ?? 1, DateTime.DaysInMonth(day.Year, day.Month)),
        _ => false,
    };

    private static bool TryParseTime(string? value, out int hour, out int minute)
    {
        hour = 0;
        minute = 0;
        string[] parts = (value ?? string.Empty).Split(':');
        return parts.Length == 2
            && int.TryParse(parts[0], out hour) && hour is >= 0 and <= 23
            && int.TryParse(parts[1], out minute) && minute is >= 0 and <= 59;
    }

    private List<ScheduledJob> Load()
    {
        try
        {
            if (File.Exists(_path))
            {
                return JsonSerializer.Deserialize<List<ScheduledJob>>(File.ReadAllText(_path)) ?? [];
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Could not read schedules from {Path}; starting empty", _path);
        }

        return [];
    }

    private void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            File.WriteAllText(_path, JsonSerializer.Serialize(_jobs, FileFormat));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Could not persist schedules to {Path}", _path);
        }
    }
}


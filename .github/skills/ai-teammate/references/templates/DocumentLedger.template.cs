// エージェントが作って渡したファイルの台帳。**誰の依頼で作ったか**と**中身の取り扱い区分**を残す。
//
// なぜ要るのか:
//   エージェントの OneDrive には、いろいろな人の依頼で作ったファイルが溩まっていく。
//   やがて別の人から「あの資料を共有して」と頼まれるが、そのときには作ったときの会話は残っていない。
//   共有リンクは一度渡すと取り消せないので、可否は**モデルの記憶ではなく記録**から判断する。
//
// 保存先は App Service の永続共有（%HOME%/data）上の JSON。スケジュール ストアと同じ方式で、
// 再起動と再配置をまたいで残る。データベースは追加しない。
//
// Program.cs:
//   builder.Services.AddSingleton<DocumentLedger>();
//
// アプリ設定（任意）:
//   Documents__LedgerPath = 保存先を変えるときだけ
//
// 名前空間だけプロジェクトに合わせて置き換える。

using System.Text.Json;
using System.Text.Json.Serialization;

namespace <RootNamespace>;

/// <summary>How freely a delivered file may be passed on.</summary>
public static class SensitivityLevel
{
    public const string Public = "public";
    public const string Internal = "internal";
    public const string Personal = "personal";

    public static string? Normalize(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        Public or "公開" => Public,
        Internal or "社内" => Internal,
        Personal or "個人情報" or "confidential" => Personal,
        _ => null,
    };

    public static string Label(string? value) => Normalize(value) switch
    {
        Public => "公開可",
        Internal => "社内限り",
        Personal => "個人情報を含む",
        _ => "未分類",
    };
}

/// <summary>A file the agent produced and stored on its own OneDrive.</summary>
public sealed class DocumentRecord
{
    public string Name { get; set; } = string.Empty;

    public string? ItemId { get; set; }

    public string? WebUrl { get; set; }

    /// <summary>Who asked for it. Consent to share is requested from this person.</summary>
    public string? OwnerEmail { get; set; }

    /// <summary>public / internal / personal. Null means nobody has looked at the contents yet.</summary>
    public string? Sensitivity { get; set; }

    /// <summary>One line on what the file contains, written when it was classified.</summary>
    public string? Summary { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public string Describe()
    {
        string level = SensitivityLevel.Label(Sensitivity);
        return $"- {Name}\n  区分: {level}"
            + $" / 依頼元: {(string.IsNullOrEmpty(OwnerEmail) ? "不明" : OwnerEmail)}"
            + $" / 作成: {DocumentLedger.ToLocalText(CreatedAt)}"
            + (Summary is { Length: > 0 } ? $"\n  内容: {Summary}" : string.Empty);
    }
}

/// <summary>A request to pass a file on to somebody other than the person who asked for it.</summary>
public sealed class ShareRequest
{
    public string Id { get; set; } = string.Empty;

    public string DocumentName { get; set; } = string.Empty;

    public string RequesterEmail { get; set; } = string.Empty;

    public string OwnerEmail { get; set; } = string.Empty;

    public string? Reason { get; set; }

    /// <summary>pending / approved / denied.</summary>
    public string Status { get; set; } = "pending";

    public DateTimeOffset RequestedAt { get; set; }

    public DateTimeOffset? DecidedAt { get; set; }

    [JsonIgnore]
    public bool IsPending => Status == "pending";

    public string Describe() =>
        $"- 申請 {Id}: 「{DocumentName}」を {RequesterEmail} へ共有してよいか"
        + $"（{DocumentLedger.ToLocalText(RequestedAt)} 受付）"
        + (Reason is { Length: > 0 } ? $"\n  理由: {Reason}" : string.Empty);
}

/// <summary>
/// The record of what the agent has produced, who asked for it, and who has agreed to it being
/// passed on. Kept in a JSON file on the App Service persistent share, like the schedule store.
///
/// This exists because a sharing link is irreversible once handed out: the decision has to be made
/// from recorded facts rather than from whatever the model remembers about the conversation.
/// </summary>
public sealed class DocumentLedger
{
    public static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Tokyo");

    private static readonly JsonSerializerOptions FileFormat = new()
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly object _gate = new();
    private readonly string _path;
    private readonly ILogger<DocumentLedger> _logger;
    private readonly LedgerFile _file;

    public DocumentLedger(IConfiguration configuration, IHostEnvironment environment, ILogger<DocumentLedger> logger)
    {
        _logger = logger;
        _path = configuration["Documents:LedgerPath"]
            ?? Path.Combine(Environment.GetEnvironmentVariable("HOME") ?? environment.ContentRootPath, "data", "documents.json");
        _file = Load();
    }

    public DocumentRecord? Find(string name)
    {
        lock (_gate)
        {
            return _file.Documents.FirstOrDefault(d => string.Equals(d.Name, name, StringComparison.OrdinalIgnoreCase))
                ?? _file.Documents.FirstOrDefault(d => d.Name.Contains(name, StringComparison.OrdinalIgnoreCase));
        }
    }

    public IReadOnlyList<DocumentRecord> Documents()
    {
        lock (_gate)
        {
            return _file.Documents.OrderByDescending(d => d.CreatedAt).ToList();
        }
    }

    /// <summary>Records a delivery. Re-delivering the same name keeps the existing classification.</summary>
    public void Record(string name, string? itemId, string? webUrl, string? ownerEmail, string? sensitivity, string? summary)
    {
        lock (_gate)
        {
            DocumentRecord? existing = _file.Documents
                .FirstOrDefault(d => string.Equals(d.Name, name, StringComparison.OrdinalIgnoreCase));
            if (existing is null)
            {
                existing = new DocumentRecord { Name = name, CreatedAt = DateTimeOffset.UtcNow };
                _file.Documents.Add(existing);
            }

            existing.ItemId = itemId ?? existing.ItemId;
            existing.WebUrl = webUrl ?? existing.WebUrl;
            existing.OwnerEmail = ownerEmail ?? existing.OwnerEmail;
            existing.Sensitivity = SensitivityLevel.Normalize(sensitivity) ?? existing.Sensitivity;
            existing.Summary = summary ?? existing.Summary;

            if (_file.Documents.Count > 500)
            {
                _file.Documents.RemoveRange(0, _file.Documents.Count - 500);
            }

            Save();
        }
    }

    public ShareRequest OpenRequest(string documentName, string requesterEmail, string ownerEmail, string? reason)
    {
        lock (_gate)
        {
            ShareRequest? existing = _file.Requests.FirstOrDefault(r =>
                r.IsPending
                && string.Equals(r.DocumentName, documentName, StringComparison.OrdinalIgnoreCase)
                && string.Equals(r.RequesterEmail, requesterEmail, StringComparison.OrdinalIgnoreCase));
            if (existing is not null)
            {
                return existing;
            }

            var request = new ShareRequest
            {
                Id = Guid.NewGuid().ToString("N")[..8],
                DocumentName = documentName,
                RequesterEmail = requesterEmail,
                OwnerEmail = ownerEmail,
                Reason = reason,
                RequestedAt = DateTimeOffset.UtcNow,
            };

            _file.Requests.Add(request);
            Save();
            _logger.LogInformation(
                "Share request {Id} opened: {Document} for {Requester}, awaiting {Owner}",
                request.Id, documentName, requesterEmail, ownerEmail);
            return request;
        }
    }

    public ShareRequest? FindRequest(string id)
    {
        lock (_gate)
        {
            return _file.Requests.FirstOrDefault(r => string.Equals(r.Id, id, StringComparison.OrdinalIgnoreCase));
        }
    }

    public bool IsApproved(string documentName, string requesterEmail)
    {
        lock (_gate)
        {
            return _file.Requests.Any(r =>
                r.Status == "approved"
                && string.Equals(r.DocumentName, documentName, StringComparison.OrdinalIgnoreCase)
                && string.Equals(r.RequesterEmail, requesterEmail, StringComparison.OrdinalIgnoreCase));
        }
    }

    public void Decide(ShareRequest request, bool approved)
    {
        lock (_gate)
        {
            request.Status = approved ? "approved" : "denied";
            request.DecidedAt = DateTimeOffset.UtcNow;
            Save();
        }

        _logger.LogInformation("Share request {Id} {Decision}", request.Id, request.Status);
    }

    /// <summary>Pending requests this person is expected to answer, so the turn can nudge them.</summary>
    public IReadOnlyList<ShareRequest> PendingFor(string? ownerEmail)
    {
        if (string.IsNullOrWhiteSpace(ownerEmail))
        {
            return [];
        }

        lock (_gate)
        {
            return _file.Requests
                .Where(r => r.IsPending && string.Equals(r.OwnerEmail, ownerEmail, StringComparison.OrdinalIgnoreCase))
                .OrderBy(r => r.RequestedAt)
                .ToList();
        }
    }

    public static string ToLocalText(DateTimeOffset instant) =>
        TimeZoneInfo.ConvertTime(instant, Zone).ToString("yyyy-MM-dd HH:mm");

    private LedgerFile Load()
    {
        try
        {
            if (File.Exists(_path))
            {
                return JsonSerializer.Deserialize<LedgerFile>(File.ReadAllText(_path)) ?? new LedgerFile();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Could not read the document ledger from {Path}; starting empty", _path);
        }

        return new LedgerFile();
    }

    private void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            File.WriteAllText(_path, JsonSerializer.Serialize(_file, FileFormat));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Could not persist the document ledger to {Path}", _path);
        }
    }

    private sealed class LedgerFile
    {
        public List<DocumentRecord> Documents { get; set; } = [];

        public List<ShareRequest> Requests { get; set; } = [];
    }
}


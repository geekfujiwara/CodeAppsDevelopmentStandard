// エージェントに「自分でコードを書いて動かす作業環境」を持たせるローカル ツール群。
//
// ここで価値を生むのは個々のツールではなく **ループ**（書く → 動かす → 出力を読む → 直す）。
// だからツールの説明文には「失敗したらエラー本文を読んで直し、もう一度呼ぶ」と明記し、
// 実行結果は stdout / stderr / 最後の式の値をそのままモデルへ返す。整形して隠さない。
//
// できるようになること:
//   - 受け取った zip / PDF / Office / 画像の中身を実際に開いて読む
//   - 集計・変換・検算・作図を、事前に手順を決めずに片付ける
//   - デザイン システムに沿った pptx / xlsx / docx を生成して渡す
//
// 前提となるプロジェクト側の型:
//   CodeSandbox        … references/templates/CodeSandbox.template.cs
//   LocalTool          … record LocalTool(McpToolDefinition Definition,
//                                         Func<JsonElement, CancellationToken, Task<string>> Invoke)
//   McpToolDefinition  … (Name, Description, InputSchema)
//   IFileDelivery      … このファイル冒頭で定義。OneDrive 保存＋共有リンク発行などを実装する
//
// Program.cs:
//   builder.Services.AddSingleton<SandboxTools>();
//
// AgentBrain のツール接続時（Graph トークンは import / deliver で使う）:
//   if (configuration.GetValue("Sandbox:Enabled", true) && sandbox.IsConfigured)
//   {
//       toolset.AddLocal(sandboxTools.CreateTools(graphToken, conversationId));
//   }
//
// アプリ設定（__ が階層区切り）:
//   Sandbox__Enabled = true
//   （Endpoint / ApiVersion / TimeoutSeconds は CodeSandbox 側）
//
// デザイン キット（任意）:
//   {ContentRoot}/sandbox/designkit/ に Python モジュールと画像資産を置き、GUIDE.md を添える。
//   セッションごとに 1 回だけ zip で転送し、以後は再利用する。
//   生成物の見た目はプロンプトでは決まらない。**コードとして同梱して初めて再現する。**

using System.Collections.Concurrent;
using System.IO.Compression;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

/// <summary>作った成果物を相手に渡す経路（OneDrive 保存＋共有リンク発行、メール添付など）。</summary>
public interface IFileDelivery
{
    Task<string> DeliverAsync(
        string accessToken,
        string fileName,
        string contentType,
        byte[] content,
        JsonElement arguments,
        CancellationToken cancellationToken);
}

public sealed class SandboxTools(
    CodeSandbox sandbox,
    IFileDelivery delivery,
    IHttpClientFactory httpClientFactory,
    IWebHostEnvironment environment,
    ILogger<SandboxTools> logger)
{
    private const string GraphRoot = "https://graph.microsoft.com/v1.0";
    private const string DesignKitFolder = "designkit";
    private const int MaxOutputLength = 6000;
    private const int MaxImportBytes = 40 * 1024 * 1024;

    private static readonly Dictionary<string, string> ContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        [".xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".pdf"] = "application/pdf",
        [".csv"] = "text/csv",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".zip"] = "application/zip",
    };

    private readonly ConcurrentDictionary<string, byte> _provisioned = new();
    private readonly Lazy<byte[]> _designKit = new(BuildDesignKit(environment), LazyThreadSafetyMode.ExecutionAndPublication);
    private readonly Lazy<string> _designGuide = new(ReadDesignGuide(environment), LazyThreadSafetyMode.ExecutionAndPublication);

    public bool IsConfigured => sandbox.IsConfigured;

    public IReadOnlyList<LocalTool> CreateTools(string? accessToken, string? sessionKey) =>
    [
        new LocalTool(
            new McpToolDefinition(
                "run_python",
                "隔離された作業環境で Python を実行する。ファイルの中身を読む、変換する、集計する、図や資料を作る、"
                + "といった「書いてみないと分からない仕事」はここで行う。標準出力とエラーがそのまま返るので、"
                + "失敗したら原因を読んで直し、もう一度呼ぶこと。同じ会話の中では /mnt/data と変数が保持される。"
                + "pandas・openpyxl・python-pptx・python-docx・Pillow・matplotlib・PyMuPDF が入っており、pip install も使える。"
                + "資料を作るときは design_kit を true にし、先に deck_design_guide を読むこと。"
                + "作った成果物は deliver_file で相手に渡すまでが仕事。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "code": {
                          "type": "string",
                          "description": "実行する Python。確認したい値は必ず print する。"
                        },
                        "design_kit": {
                          "type": "boolean",
                          "description": "true にするとデザイン システムが import できる状態になる。資料を作るときは true。"
                        },
                        "purpose": {
                          "type": "string",
                          "description": "この実行で何を確かめるか。1 行。"
                        }
                      },
                      "required": ["code"]
                    }
                    """)),
            (arguments, cancellationToken) => RunAsync(sessionKey, arguments, cancellationToken)),

        new LocalTool(
            new McpToolDefinition(
                "deck_design_guide",
                "同梱デザイン システムの使い方と、使える画像資産の一覧を返す。"
                + "資料を作る前に必ず一度読む。読まずに書くと素の白いスライドになる。",
                Schema("""{ "type": "object", "properties": {} }""")),
            (_, _) => Task.FromResult(_designGuide.Value)),

        new LocalTool(
            new McpToolDefinition(
                "import_file",
                "OneDrive のファイル、共有リンク、または公開 URL を作業環境に取り込む。"
                + "zip・pdf・xlsx・docx・画像など何でも入れられる。取り込んだあとは run_python で中身を読む。"
                + "zip はここでは展開されないので、Python の zipfile で開くこと。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "source": {
                          "type": "string",
                          "description": "取り込み元。OneDrive 内なら 'フォルダ名/ファイル名.zip'、共有リンクや公開 URL ならその URL をそのまま。"
                        },
                        "name": { "type": "string", "description": "作業環境での保存名。省略すると元のファイル名を使う。" }
                      },
                      "required": ["source"]
                    }
                    """)),
            (arguments, cancellationToken) => ImportAsync(accessToken, sessionKey, arguments, cancellationToken)),

        new LocalTool(
            new McpToolDefinition(
                "deliver_file",
                "作業環境で作ったファイルを相手に渡す。既定は保存して社内共有リンクを返す。"
                + "返ってきた URL はそのまま相手に伝えること。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "path": { "type": "string", "description": "作業環境上のファイル名。例: report.pptx" },
                        "filename": { "type": "string", "description": "渡すときのファイル名。省略時は path と同じ。" },
                        "delivery": { "type": "string", "enum": ["link", "mail"], "description": "既定は link。" },
                        "recipient": { "type": "string", "description": "delivery が mail のときの宛先。" },
                        "message": { "type": "string", "description": "メール本文。" },
                        "title": { "type": "string", "description": "メール件名。" }
                      },
                      "required": ["path"]
                    }
                    """)),
            (arguments, cancellationToken) => DeliverAsync(accessToken, sessionKey, arguments, cancellationToken)),

        new LocalTool(
            new McpToolDefinition(
                "list_workspace",
                "作業環境にいま置かれているファイルを一覧する。取り込みや生成の結果を確認するときに使う。",
                Schema("""{ "type": "object", "properties": {} }""")),
            (_, cancellationToken) => ListAsync(sessionKey, cancellationToken)),
    ];

    private async Task<string> RunAsync(string? sessionKey, JsonElement arguments, CancellationToken cancellationToken)
    {
        string? code = ReadString(arguments, "code");
        if (string.IsNullOrWhiteSpace(code))
        {
            return "ツールがエラーを返しました: code が空です。";
        }

        string session = CodeSandbox.SessionId(sessionKey);
        var prelude = new StringBuilder();

        if (arguments.TryGetProperty("design_kit", out JsonElement kit) && kit.ValueKind == JsonValueKind.True)
        {
            if (await ProvisionDesignKitAsync(session, cancellationToken) is { Length: > 0 } failure)
            {
                return $"ツールがエラーを返しました: {failure}";
            }

            prelude.AppendLine("import sys, os, zipfile");
            prelude.AppendLine($"if not os.path.isdir('/mnt/data/lib/{DesignKitFolder}'):");
            prelude.AppendLine($"    zipfile.ZipFile('/mnt/data/{DesignKitFolder}.zip').extractall('/mnt/data/lib/{DesignKitFolder}')");
            prelude.AppendLine($"if '/mnt/data/lib/{DesignKitFolder}' not in sys.path:");
            prelude.AppendLine($"    sys.path.insert(0, '/mnt/data/lib/{DesignKitFolder}')");
        }

        SandboxRun run;
        try
        {
            run = await sandbox.RunAsync(session, prelude + code, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Sandbox execution threw");
            return $"ツールがエラーを返しました: 作業環境の呼び出しに失敗しました（{ex.GetType().Name}）。";
        }

        if (run.Error is { Length: > 0 })
        {
            return $"ツールがエラーを返しました: {run.Error}";
        }

        var report = new StringBuilder();
        report.Append(run.Ok ? "実行しました" : "実行は失敗しました").Append(" (").Append(run.Milliseconds).AppendLine(" ms)");

        if (run.Stdout is { Length: > 0 })
        {
            report.AppendLine("--- 標準出力 ---").AppendLine(Clip(run.Stdout));
        }

        // エラーは隠さずそのまま返す。これがモデルの自己修正の唯一の材料になる。
        if (run.Stderr is { Length: > 0 })
        {
            report.AppendLine("--- エラー出力 ---").AppendLine(Clip(run.Stderr));
            report.AppendLine("エラーの原因を読み、コードを直してもう一度 run_python を呼ぶこと。");
        }

        if (run.Result is { Length: > 0 })
        {
            report.AppendLine("--- 最後の式の値 ---").AppendLine(Clip(run.Result));
        }

        if (run.Stdout.Length == 0 && run.Stderr.Length == 0 && run.Result.Length == 0)
        {
            report.AppendLine("出力はありませんでした。確認したい値は print してください。");
        }

        return report.ToString();
    }

    private async Task<string> ImportAsync(
        string? accessToken, string? sessionKey, JsonElement arguments, CancellationToken cancellationToken)
    {
        string? source = ReadString(arguments, "source");
        if (string.IsNullOrWhiteSpace(source))
        {
            return "ツールがエラーを返しました: source が必要です。";
        }

        byte[] content;
        string fileName;
        try
        {
            (content, fileName) = await FetchAsync(accessToken, source, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return $"ツールがエラーを返しました: {ex.Message}";
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Import failed for {Source}", source);
            return "ツールがエラーを返しました: 取り込みに失敗しました。場所を確認してください。";
        }

        if (content.Length > MaxImportBytes)
        {
            return $"ツールがエラーを返しました: ファイルが大きすぎます（{content.Length / 1024 / 1024} MB）。";
        }

        fileName = SafeName(ReadString(arguments, "name") ?? fileName);
        string session = CodeSandbox.SessionId(sessionKey);
        if (await sandbox.UploadAsync(session, fileName, content, cancellationToken) is { Length: > 0 } failure)
        {
            return $"ツールがエラーを返しました: {failure}";
        }

        logger.LogInformation("Imported {File} ({Bytes} bytes) into the sandbox", fileName, content.Length);
        return $"{fileName} を作業環境に取り込みました（{content.Length:N0} バイト）。パスは /mnt/data/{fileName} です。"
             + "run_python で中身を読んでください。";
    }

    private async Task<(byte[] Content, string Name)> FetchAsync(
        string? accessToken, string source, CancellationToken cancellationToken)
    {
        bool isUrl = source.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
                     || source.StartsWith("https://", StringComparison.OrdinalIgnoreCase);

        if (isUrl && !IsSharePointLink(source))
        {
            using HttpClient plain = httpClientFactory.CreateClient();
            plain.Timeout = TimeSpan.FromSeconds(120);
            using HttpResponseMessage direct = await plain.GetAsync(source, cancellationToken);
            if (!direct.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"URL からの取得に失敗しました（{(int)direct.StatusCode}）。");
            }

            return (await direct.Content.ReadAsByteArrayAsync(cancellationToken), NameFromUrl(source, direct));
        }

        if (string.IsNullOrEmpty(accessToken))
        {
            throw new InvalidOperationException("ファイル ストレージにアクセスできません（トークンなし）。");
        }

        using HttpClient http = httpClientFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(180);
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        // 共有リンクは /shares/{shareId}、自分の領域のパスは /me/drive/root:/... で解決する。
        string route = isUrl
            ? $"{GraphRoot}/shares/{ShareId(source)}/driveItem"
            : $"{GraphRoot}/me/drive/root:/{string.Join('/', source.Trim('/').Split('/').Select(Uri.EscapeDataString))}";

        using HttpResponseMessage metadata = await http.GetAsync(route, cancellationToken);
        if (!metadata.IsSuccessStatusCode)
        {
            throw new InvalidOperationException((int)metadata.StatusCode is 401 or 403
                ? "このファイルを読む権限がありません。共有された資料を読むには Files.Read.All の同意が必要です。"
                : $"ファイルが見つかりませんでした（{(int)metadata.StatusCode}）。");
        }

        using JsonDocument item = JsonDocument.Parse(await metadata.Content.ReadAsStringAsync(cancellationToken));
        string name = ReadString(item.RootElement, "name") ?? "import.bin";

        using HttpResponseMessage download = await http.GetAsync($"{route}/content", cancellationToken);
        if (!download.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"ファイルの取得に失敗しました（{(int)download.StatusCode}）。");
        }

        return (await download.Content.ReadAsByteArrayAsync(cancellationToken), name);
    }

    private async Task<string> DeliverAsync(
        string? accessToken, string? sessionKey, JsonElement arguments, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(accessToken))
        {
            return "ツールがエラーを返しました: ファイル ストレージにアクセスできません。";
        }

        string? path = ReadString(arguments, "path");
        if (string.IsNullOrWhiteSpace(path))
        {
            return "ツールがエラーを返しました: path が必要です。";
        }

        string name = path.Split('/').Last();
        byte[]? content = await sandbox.DownloadAsync(CodeSandbox.SessionId(sessionKey), name, cancellationToken);
        if (content is null)
        {
            return $"ツールがエラーを返しました: 作業環境に {name} がありません。list_workspace で確認してください。";
        }

        string delivered = SafeName(ReadString(arguments, "filename") ?? name);
        string contentType = ContentTypes.GetValueOrDefault(Path.GetExtension(delivered), "application/octet-stream");
        return await delivery.DeliverAsync(accessToken, delivered, contentType, content, arguments, cancellationToken);
    }

    private async Task<string> ListAsync(string? sessionKey, CancellationToken cancellationToken)
    {
        IReadOnlyList<SandboxFile> files = await sandbox.ListAsync(CodeSandbox.SessionId(sessionKey), cancellationToken);
        return files.Count == 0
            ? "作業環境にはまだファイルがありません。"
            : "作業環境のファイル:\n" + string.Join("\n", files.Select(f => $"- {f.Name} ({f.Bytes:N0} バイト)"));
    }

    /// <summary>Sessions are cheap but not free: send the design kit once and reuse it.</summary>
    private async Task<string?> ProvisionDesignKitAsync(string session, CancellationToken cancellationToken)
    {
        if (_provisioned.ContainsKey(session))
        {
            return null;
        }

        byte[] bundle = _designKit.Value;
        if (bundle.Length == 0)
        {
            return "デザイン資産が配置されていません。";
        }

        string? failure = await sandbox.UploadAsync(session, $"{DesignKitFolder}.zip", bundle, cancellationToken);
        if (failure is null)
        {
            _provisioned[session] = 1;
        }

        return failure;
    }

    private static Func<byte[]> BuildDesignKit(IWebHostEnvironment environment) => () =>
    {
        string folder = Path.Combine(environment.ContentRootPath, "sandbox", DesignKitFolder);
        if (!Directory.Exists(folder))
        {
            return [];
        }

        using var buffer = new MemoryStream();
        using (var archive = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (string file in Directory.EnumerateFiles(folder, "*", SearchOption.AllDirectories))
            {
                string relative = Path.GetRelativePath(folder, file).Replace('\\', '/');
                archive.CreateEntryFromFile(file, relative, CompressionLevel.Fastest);
            }
        }

        return buffer.ToArray();
    };

    private static Func<string> ReadDesignGuide(IWebHostEnvironment environment) => () =>
    {
        string path = Path.Combine(environment.ContentRootPath, "sandbox", DesignKitFolder, "GUIDE.md");
        return File.Exists(path)
            ? File.ReadAllText(path)
            : "デザイン ガイドが見つかりません。素のライブラリで組み立ててください。";
    };

    private static bool IsSharePointLink(string url) =>
        url.Contains("sharepoint.com", StringComparison.OrdinalIgnoreCase)
        || url.Contains("1drv.ms", StringComparison.OrdinalIgnoreCase)
        || url.Contains("onedrive.live.com", StringComparison.OrdinalIgnoreCase);

    /// <summary>Graph addresses a shared item by a base64url form of the sharing URL.</summary>
    private static string ShareId(string url)
    {
        string encoded = Convert.ToBase64String(Encoding.UTF8.GetBytes(url));
        return "u!" + encoded.TrimEnd('=').Replace('/', '_').Replace('+', '-');
    }

    private static string NameFromUrl(string url, HttpResponseMessage response)
    {
        if (response.Content.Headers.ContentDisposition?.FileNameStar is { Length: > 0 } starred)
        {
            return starred;
        }

        string candidate = Uri.TryCreate(url, UriKind.Absolute, out Uri? parsed)
            ? Path.GetFileName(parsed.AbsolutePath)
            : string.Empty;
        return candidate.Length > 0 ? candidate : "import.bin";
    }

    private static string SafeName(string name)
    {
        var invalid = new HashSet<char>(Path.GetInvalidFileNameChars()) { '/', '\\', ':', '#', '%', '?', '*', '"', '<', '>', '|' };
        string cleaned = new(name.Where(character => !invalid.Contains(character) && !char.IsControl(character)).ToArray());
        cleaned = cleaned.Trim().Trim('.');
        return cleaned.Length is 0 ? "file.bin" : cleaned.Length > 100 ? cleaned[..100] : cleaned;
    }

    private static string Clip(string text) =>
        text.Length <= MaxOutputLength ? text : text[..MaxOutputLength] + "\n…（以降は省略。必要なら出力を絞って再実行）";

    private static JsonElement Schema(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static string? ReadString(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(name, out JsonElement value)
        && value.ValueKind == JsonValueKind.String
        && value.GetString() is { Length: > 0 } text
            ? text
            : null;
}

// Azure Container Apps の動的セッション（dynamic sessions）を呼ぶだけの薄いクライアント。
// エージェントが書いた Python を Hyper-V 分離のセッションで実行し、ファイルを出し入れする。
//
// なぜ必要か: モデルに「コードを書く」だけをさせても価値は出ない。**書く → 動かす → 出力を読む →
// 直す** のループが回って初めて、事前に手順を決められない仕事（未知のファイルを読む、変換する、
// 集計する、図を描く）ができる。そのループの「動かす」を担うのがこのクラス。
// 設計判断と切り分けは references/code-sandbox.md。
//
// セッションには資格情報を渡さない。生成コードはエージェントの権限を持たないので、
// コードが何をしても Microsoft 365 のデータには触れない。
//
// 前提:
//   - scripts/provision_code_sandbox.py でセッション プールを作成済み
//   - App Service の UAMI に "Azure ContainerApps Session Executor" ロールを付与済み
//
// Program.cs:
//   builder.Services.AddHttpClient();
//   builder.Services.AddSingleton<CodeSandbox>();
//
// アプリ設定（__ が階層区切り）:
//   Sandbox__Enabled        = true
//   Sandbox__Endpoint       = ARM が返す poolManagementEndpoint（手で組み立てない）
//   Sandbox__ApiVersion     = 2025-02-02-preview
//   Sandbox__TimeoutSeconds = 300

using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Azure.Core;

public sealed record SandboxRun(bool Ok, string Stdout, string Stderr, string Result, long Milliseconds, string? Error);

public sealed record SandboxFile(string Name, long Bytes);

public sealed class CodeSandbox(
    IHttpClientFactory httpClientFactory,
    TokenCredential credential,
    IConfiguration configuration,
    ILogger<CodeSandbox> logger)
{
    private const string Scope = "https://dynamicsessions.io/.default";

    private readonly SemaphoreSlim _tokenGate = new(1, 1);
    private AccessToken _token;

    private string? Endpoint => configuration["Sandbox:Endpoint"]?.TrimEnd('/');

    private string ApiVersion => configuration["Sandbox:ApiVersion"] ?? "2025-02-02-preview";

    public bool IsConfigured => !string.IsNullOrEmpty(Endpoint);

    /// <summary>Session identifiers must be short and URL safe; conversation ids are neither.</summary>
    public static string SessionId(string? key)
    {
        string source = string.IsNullOrWhiteSpace(key) ? "default" : key;
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(source));
        return "s" + Convert.ToHexString(hash)[..24].ToLowerInvariant();
    }

    public async Task<SandboxRun> RunAsync(string sessionId, string code, CancellationToken cancellationToken)
    {
        using HttpClient http = await ClientAsync(cancellationToken);
        var payload = new { codeInputType = "inline", executionType = "synchronous", code };

        using var body = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        using HttpResponseMessage response = await http.PostAsync(Route("executions", sessionId), body, cancellationToken);
        string text = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("Sandbox execution failed with {Status}", (int)response.StatusCode);
            return new SandboxRun(false, string.Empty, string.Empty, string.Empty, 0, Describe(response, text));
        }

        using JsonDocument document = JsonDocument.Parse(text);
        JsonElement root = document.RootElement;
        string status = Text(root, "status") ?? "Unknown";
        if (!root.TryGetProperty("result", out JsonElement result) || result.ValueKind != JsonValueKind.Object)
        {
            return new SandboxRun(false, string.Empty, string.Empty, string.Empty, 0, $"実行状態: {status}");
        }

        long elapsed = result.TryGetProperty("executionTimeInMilliseconds", out JsonElement ms) && ms.TryGetInt64(out long value)
            ? value
            : 0;

        return new SandboxRun(
            string.Equals(status, "Succeeded", StringComparison.OrdinalIgnoreCase),
            Text(result, "stdout") ?? string.Empty,
            Text(result, "stderr") ?? string.Empty,
            Scalar(result, "executionResult"),
            elapsed,
            null);
    }

    /// <summary>Returns null on success; the multipart field name must be "file".</summary>
    public async Task<string?> UploadAsync(string sessionId, string fileName, byte[] content, CancellationToken cancellationToken)
    {
        using HttpClient http = await ClientAsync(cancellationToken);
        using var form = new MultipartFormDataContent();
        var part = new ByteArrayContent(content);
        part.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        form.Add(part, "file", fileName);

        using HttpResponseMessage response = await http.PostAsync(Route("files", sessionId), form, cancellationToken);
        if (response.IsSuccessStatusCode)
        {
            return null;
        }

        return Describe(response, await response.Content.ReadAsStringAsync(cancellationToken));
    }

    public async Task<byte[]?> DownloadAsync(string sessionId, string fileName, CancellationToken cancellationToken)
    {
        using HttpClient http = await ClientAsync(cancellationToken);
        string route = Route($"files/{Uri.EscapeDataString(fileName)}/content", sessionId);
        using HttpResponseMessage response = await http.GetAsync(route, cancellationToken);
        return response.IsSuccessStatusCode
            ? await response.Content.ReadAsByteArrayAsync(cancellationToken)
            : null;
    }

    public async Task<IReadOnlyList<SandboxFile>> ListAsync(string sessionId, CancellationToken cancellationToken)
    {
        using HttpClient http = await ClientAsync(cancellationToken);
        using HttpResponseMessage response = await http.GetAsync(Route("files", sessionId), cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return [];
        }

        using JsonDocument document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        if (!document.RootElement.TryGetProperty("value", out JsonElement items) || items.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var files = new List<SandboxFile>();
        foreach (JsonElement item in items.EnumerateArray())
        {
            if (Text(item, "name") is { Length: > 0 } name)
            {
                long bytes = item.TryGetProperty("sizeInBytes", out JsonElement size) && size.TryGetInt64(out long value) ? value : 0;
                files.Add(new SandboxFile(name, bytes));
            }
        }

        return files;
    }

    // identifier がセッションを分ける。同じ値なら同じ /mnt/data と同じ Python プロセスに戻る。
    private string Route(string segment, string sessionId) =>
        $"{Endpoint}/{segment}?api-version={ApiVersion}&identifier={Uri.EscapeDataString(sessionId)}";

    private async Task<HttpClient> ClientAsync(CancellationToken cancellationToken)
    {
        HttpClient http = httpClientFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(configuration.GetValue("Sandbox:TimeoutSeconds", 300));
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await TokenAsync(cancellationToken));
        return http;
    }

    private async Task<string> TokenAsync(CancellationToken cancellationToken)
    {
        if (_token.ExpiresOn > DateTimeOffset.UtcNow.AddMinutes(5))
        {
            return _token.Token;
        }

        await _tokenGate.WaitAsync(cancellationToken);
        try
        {
            if (_token.ExpiresOn <= DateTimeOffset.UtcNow.AddMinutes(5))
            {
                _token = await credential.GetTokenAsync(new TokenRequestContext([Scope]), cancellationToken);
            }

            return _token.Token;
        }
        finally
        {
            _tokenGate.Release();
        }
    }

    private static string Describe(HttpResponseMessage response, string body)
    {
        string detail = body.Length > 400 ? body[..400] : body;
        return (int)response.StatusCode is 401 or 403
            ? $"サンドボックスへのアクセスが拒否されました（{(int)response.StatusCode}）。マネージド ID にセッション実行のロールが必要です。"
            : $"サンドボックスの呼び出しに失敗しました（{(int)response.StatusCode}）。{detail}";
    }

    private static string Scalar(JsonElement element, string name) =>
        element.TryGetProperty(name, out JsonElement value) && value.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined)
            ? value.ValueKind == JsonValueKind.String ? value.GetString() ?? string.Empty : value.ToString()
            : string.Empty;

    private static string? Text(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(name, out JsonElement value)
        && value.ValueKind == JsonValueKind.String
        && value.GetString() is { Length: > 0 } text
            ? text
            : null;
}

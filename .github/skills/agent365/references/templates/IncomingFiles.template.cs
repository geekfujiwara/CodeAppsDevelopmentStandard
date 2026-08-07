// 添付ファイルの受け取り（B16）。
//
// Teams はファイルの中身を送らない。送ってくるのは「取りに行くための参照」だけで、
// 取りに行かないアプリからはメッセージにファイルが付いていたことすら見えない。
// その結果、エージェントは**ファイルが付いているメッセージに対して**
// 「ファイルを送ってください」と返す。相手からはエージェントが壊れたようにしか見えない。
//
// 前提が 2 つある。両方揃わないと動かない。
//   1. Teams アプリ マニフェストの bots[].supportsFiles = true
//      false だと Teams がそもそも添付情報を配信しない（コードを直しても届かない）
//   2. このクラスで Activity.Attachments を読むこと
//
// 画像は 2 通りに使う。片方だけでは足りない。
//   - モデルに見せる（vision）    … 何が写っているかを理解させる
//   - 作業環境に置く（B12）        … 切り抜き・リサイズ・資料への貼り込みをさせる
//
// Program.cs:
//   builder.Services.AddSingleton<IncomingFiles>();
//
// アプリ設定は無い。上限はこのファイルの定数で決める。

using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Agents.Authentication;
using Microsoft.Agents.Builder;
using Microsoft.Agents.Core.Models;

namespace <AgentNamespace>;

/// <summary>A file the user put on their message.</summary>
public sealed record IncomingFile(string Name, string ContentType, byte[] Bytes)
{
    private static readonly string[] Viewable = ["image/png", "image/jpeg", "image/gif", "image/webp"];

    /// <summary>Only the formats the model can actually look at; anything else would fail the whole turn.</summary>
    public bool IsImage => Viewable.Contains(ContentType, StringComparer.OrdinalIgnoreCase);
}

/// <summary>
/// Teams does not send file contents: it sends a reference the agent has to fetch itself.
/// Left unread, the agent answers "please send me the file" to a message that already had it.
/// </summary>
public sealed class IncomingFiles(
    IHttpClientFactory httpClientFactory,
    CodeSandbox sandbox,
    IConnections connections,
    ILogger<IncomingFiles> logger)
{
    private const string TeamsFileInfo = "application/vnd.microsoft.teams.file.download.info";
    private const int MaxFiles = 5;
    private const int MaxBytes = 20 * 1024 * 1024;

    private static readonly Dictionary<string, string> ContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".gif"] = "image/gif",
        [".webp"] = "image/webp",
        [".bmp"] = "image/bmp",
        [".pdf"] = "application/pdf",
        [".csv"] = "text/csv",
        [".txt"] = "text/plain",
        [".json"] = "application/json",
        [".zip"] = "application/zip",
        [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        [".xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };

    public async Task<IReadOnlyList<IncomingFile>> CollectAsync(
        ITurnContext turnContext, CancellationToken cancellationToken)
    {
        var files = new List<IncomingFile>();
        foreach (Attachment attachment in turnContext.Activity.Attachments ?? [])
        {
            if (files.Count >= MaxFiles)
            {
                break;
            }

            try
            {
                if (await FetchAsync(turnContext, attachment, cancellationToken) is { } file)
                {
                    files.Add(file);
                    logger.LogInformation("Received {Name} ({Type}, {Bytes} bytes)", file.Name, file.ContentType, file.Bytes.Length);
                }
            }
            catch (Exception ex)
            {
                // One unreadable attachment must not take the whole turn down.
                logger.LogWarning(ex, "Attachment {Name} could not be read", attachment.Name);
            }
        }

        return files;
    }

    /// <summary>
    /// Puts the files where the agent can work on them and returns the note that tells it so.
    /// Vision alone lets it describe an image but not crop, resize, or paste it into a deck.
    /// </summary>
    public async Task<string> StageAsync(
        string? sessionKey, IReadOnlyList<IncomingFile> files, CancellationToken cancellationToken)
    {
        var note = new StringBuilder("この発言には添付ファイルがあります。");
        string session = CodeSandbox.SessionId(sessionKey);
        bool staged = false;

        foreach (IncomingFile file in files)
        {
            string? failure = sandbox.IsConfigured
                ? await SafeUploadAsync(session, file, cancellationToken)
                : "作業環境が無効です";

            note.AppendLine();
            note.Append("- ").Append(file.Name).Append(" (").Append(file.ContentType).Append(", ")
                .Append($"{file.Bytes.Length:N0}").Append(" バイト)");

            if (failure is null)
            {
                staged = true;
                note.Append(" → /mnt/data/").Append(file.Name);
            }
            else
            {
                note.Append(" → 作業環境には取り込めませんでした（").Append(failure).Append('）');
            }
        }

        if (staged)
        {
            note.AppendLine();
            note.Append("これらは run_python でそのまま開けます。改めて送ってもらう必要はありません。");
        }

        return note.ToString();
    }

    private async Task<string?> SafeUploadAsync(string session, IncomingFile file, CancellationToken cancellationToken)
    {
        try
        {
            return await sandbox.UploadAsync(session, file.Name, file.Bytes, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Staging {Name} into the sandbox failed", file.Name);
            return ex.GetType().Name;
        }
    }

    private async Task<IncomingFile?> FetchAsync(
        ITurnContext turnContext, Attachment attachment, CancellationToken cancellationToken)
    {
        string type = attachment.ContentType ?? string.Empty;

        // The message body itself and any cards ride along as attachments; only real files matter.
        if (type.StartsWith("text/", StringComparison.OrdinalIgnoreCase)
            || type.StartsWith("application/vnd.microsoft.card.", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (type.Equals(TeamsFileInfo, StringComparison.OrdinalIgnoreCase))
        {
            JsonElement info = JsonSerializer.SerializeToElement(attachment.Content);
            if (ReadString(info, "downloadUrl") is not { Length: > 0 } downloadUrl)
            {
                return null;
            }

            string name = SafeName(attachment.Name, downloadUrl);
            return new IncomingFile(
                name,
                TypeOf(name, ReadString(info, "fileType")),
                await DownloadAsync(turnContext, downloadUrl, cancellationToken));
        }

        if (attachment.ContentUrl is not { Length: > 0 } contentUrl)
        {
            return null;
        }

        if (contentUrl.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            return FromDataUri(attachment.Name, contentUrl);
        }

        string fileName = SafeName(attachment.Name, contentUrl);
        return new IncomingFile(
            fileName,
            TypeOf(fileName, type),
            await DownloadAsync(turnContext, contentUrl, cancellationToken));
    }

    /// <summary>
    /// Teams pre-authenticates file download links but not inline image links, and which one is
    /// which is not visible from the URL, so the bot token is only added after a refusal.
    /// </summary>
    private async Task<byte[]> DownloadAsync(
        ITurnContext turnContext, string url, CancellationToken cancellationToken)
    {
        using HttpClient http = httpClientFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(90);

        using HttpResponseMessage first = await http.GetAsync(url, cancellationToken);
        if (first.IsSuccessStatusCode)
        {
            return await ReadAsync(first, cancellationToken);
        }

        if (first.StatusCode is not (HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            || await BotTokenAsync(turnContext, cancellationToken) is not { Length: > 0 } token)
        {
            throw new InvalidOperationException($"添付ファイルの取得に失敗しました（{(int)first.StatusCode}）。");
        }

        using var retry = new HttpRequestMessage(HttpMethod.Get, url);
        retry.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using HttpResponseMessage authorized = await http.SendAsync(retry, cancellationToken);
        if (!authorized.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"添付ファイルの取得に失敗しました（{(int)authorized.StatusCode}）。");
        }

        return await ReadAsync(authorized, cancellationToken);
    }

    private static async Task<byte[]> ReadAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.Content.Headers.ContentLength > MaxBytes)
        {
            throw new InvalidOperationException("添付ファイルが大きすぎます。");
        }

        byte[] bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        return bytes.Length > MaxBytes
            ? throw new InvalidOperationException("添付ファイルが大きすぎます。")
            : bytes;
    }

    private async Task<string?> BotTokenAsync(ITurnContext turnContext, CancellationToken cancellationToken)
    {
        try
        {
            IAccessTokenProvider? provider = connections.GetDefaultConnection();
            return provider is null
                ? null
                : await provider.GetAccessTokenAsync(
                    turnContext.Activity.ServiceUrl ?? "https://api.botframework.com",
                    ["https://api.botframework.com/.default"]);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No channel token for the attachment download");
            return null;
        }
    }

    private static IncomingFile? FromDataUri(string? name, string uri)
    {
        int comma = uri.IndexOf(',');
        if (comma < 0 || !uri[..comma].EndsWith("base64", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        string type = uri[5..comma].Split(';')[0];
        byte[] bytes = Convert.FromBase64String(uri[(comma + 1)..]);
        string fileName = SafeName(name, null) is { Length: > 0 } given && given != "file.bin"
            ? given
            : "pasted" + (ContentTypes.FirstOrDefault(pair => pair.Value == type).Key ?? ".bin");
        return new IncomingFile(fileName, TypeOf(fileName, type), bytes);
    }

    private static string TypeOf(string name, string? declared)
    {
        if (ContentTypes.TryGetValue(Path.GetExtension(name), out string? byExtension))
        {
            return byExtension;
        }

        if (declared is { Length: > 0 } && declared.Contains('/'))
        {
            return declared;
        }

        // Teams reports the file type as a bare extension, without the dot.
        return declared is { Length: > 0 } && ContentTypes.TryGetValue("." + declared, out string? byFileType)
            ? byFileType
            : "application/octet-stream";
    }

    /// <summary>The name reaches a shell-free sandbox path, but it still must not escape /mnt/data.</summary>
    private static string SafeName(string? name, string? url)
    {
        string candidate = name is { Length: > 0 } ? name : NameFromUrl(url);
        candidate = Path.GetFileName(candidate.Replace('\\', '/'));
        var cleaned = new string(candidate
            .Select(c => char.IsLetterOrDigit(c) || c is '.' or '-' or '_' ? c : '_')
            .ToArray())
            .Trim('.', '_');
        return cleaned.Length == 0 ? "file.bin" : cleaned[..Math.Min(cleaned.Length, 80)];
    }

    private static string NameFromUrl(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out Uri? parsed) && Path.GetFileName(parsed.LocalPath) is { Length: > 0 } last
            ? Uri.UnescapeDataString(last)
            : "file.bin";

    private static string? ReadString(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(name, out JsonElement value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}

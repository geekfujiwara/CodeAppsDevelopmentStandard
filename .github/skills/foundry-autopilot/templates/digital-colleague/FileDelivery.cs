// 生成・変換したファイルを OneDrive に保存し、共有リンクまたはメール添付として渡す（B14）。
// SandboxTools（B12）の deliver_file と ImageGenerationTools（B17）の generate_image が共有する。
//
// 必要な委任スコープ: Files.ReadWrite（メール添付なら Mail.Send も）。
//
// アプリ設定:
//   Documents__Folder = 成果物を置く OneDrive フォルダー名（既定 "${AGENT_DISPLAY_NAME} の作成ファイル"）

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

/// <summary>
/// Saves a file to the agent's own OneDrive and hands it to the requester, either as an
/// organization-scoped sharing link or as a mail attachment.
/// </summary>
public sealed class FileDelivery(
    DocumentLedger ledger,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<FileDelivery> logger) : IFileDelivery
{
    private const string GraphRoot = "https://graph.microsoft.com/v1.0";
    private const int MaxMailAttachmentBytes = 3 * 1024 * 1024;

    private string Folder => configuration["Documents:Folder"] ?? "${AGENT_DISPLAY_NAME} の作成ファイル";

    /// <summary>Shared with the sandbox and image tools so any generated file is delivered the same way.</summary>
    public Task<string> DeliverAsync(
        string accessToken,
        string fileName,
        string contentType,
        byte[] content,
        JsonElement arguments,
        CancellationToken cancellationToken) =>
        string.Equals(ReadString(arguments, "delivery"), "mail", StringComparison.OrdinalIgnoreCase)
            ? MailAsync(accessToken, arguments, fileName, contentType, content, ReadString(arguments, "title") ?? fileName, cancellationToken)
            : UploadAsync(accessToken, fileName, content, arguments, cancellationToken);

    private async Task<string> UploadAsync(
        string accessToken, string fileName, byte[] content, JsonElement arguments, CancellationToken cancellationToken)
    {
        string folder = Folder;
        string path = string.Join('/', $"{folder}/{fileName}".Split('/').Select(Uri.EscapeDataString));

        using HttpClient http = CreateClient(accessToken);
        using var payload = new ByteArrayContent(content);
        payload.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");

        using HttpResponseMessage upload = await http.PutAsync(
            $"{GraphRoot}/me/drive/root:/{path}:/content?@microsoft.graph.conflictBehavior=rename",
            payload,
            cancellationToken);
        string uploadBody = await upload.Content.ReadAsStringAsync(cancellationToken);
        if (!upload.IsSuccessStatusCode)
        {
            return Failure("OneDrive への保存", upload, uploadBody);
        }

        using JsonDocument uploaded = JsonDocument.Parse(uploadBody);
        string? itemId = ReadString(uploaded.RootElement, "id");
        string storedName = ReadString(uploaded.RootElement, "name") ?? fileName;
        string? webUrl = ReadString(uploaded.RootElement, "webUrl");

        if (itemId is { Length: > 0 })
        {
            using HttpResponseMessage link = await http.PostAsync(
                $"{GraphRoot}/me/drive/items/{itemId}/createLink",
                JsonBody(new { type = "view", scope = "organization" }),
                cancellationToken);
            string linkBody = await link.Content.ReadAsStringAsync(cancellationToken);
            if (link.IsSuccessStatusCode)
            {
                using JsonDocument created = JsonDocument.Parse(linkBody);
                if (created.RootElement.TryGetProperty("link", out JsonElement details))
                {
                    webUrl = ReadString(details, "webUrl") ?? webUrl;
                }
            }
            else
            {
                logger.LogWarning("createLink returned {Status}; falling back to the item URL", (int)link.StatusCode);
            }
        }

        logger.LogInformation("Created {File} ({Bytes} bytes) on OneDrive", storedName, content.Length);

        // Who asked for it and how sensitive it is decides, later, whether it can be passed on.
        string? owner = ReadString(arguments, "owner");
        string? sensitivity = Sensitivity.Normalize(ReadString(arguments, "sensitivity"));
        ledger.Record(storedName, itemId, webUrl, owner, sensitivity, ReadString(arguments, "title"));

        string note = sensitivity is null || owner is null
            ? "\n次からは owner（依頼元のメール）と sensitivity（public / internal / personal）も渡すこと。"
              + "記録が無いファイルは、後で共有を頼まれても中身を読み直すまで渡せない。"
            : string.Empty;

        return webUrl is { Length: > 0 }
            ? $"ファイルを作成しました。\nファイル名: {storedName}\n共有リンク（社内向け）: {webUrl}\n"
              + $"相手に伝えるときは **URL を本文に貼らず**、`[{storedName}]({webUrl})` の形でリンクにすること。{note}"
            : $"ファイルを作成しました（{storedName}）。ただし共有リンクを発行できませんでした。{note}";
    }

    private async Task<string> MailAsync(
        string accessToken,
        JsonElement arguments,
        string fileName,
        string contentType,
        byte[] content,
        string title,
        CancellationToken cancellationToken)
    {
        string? recipient = ReadString(arguments, "recipient");
        if (string.IsNullOrWhiteSpace(recipient))
        {
            return "ツールがエラーを返しました: delivery が mail のときは recipient が必要です。";
        }

        if (content.Length > MaxMailAttachmentBytes)
        {
            return "ツールがエラーを返しました: 添付が大きすぎます。delivery を link にしてください。";
        }

        var message = new
        {
            message = new
            {
                subject = string.IsNullOrWhiteSpace(title) ? fileName : title,
                body = new
                {
                    contentType = "Text",
                    content = ReadString(arguments, "message") ?? $"{fileName} をお送りします。",
                },
                toRecipients = new[] { new { emailAddress = new { address = recipient } } },
                attachments = new object[]
                {
                    new Dictionary<string, object>
                    {
                        ["@odata.type"] = "#microsoft.graph.fileAttachment",
                        ["name"] = fileName,
                        ["contentType"] = contentType,
                        ["contentBytes"] = Convert.ToBase64String(content),
                    },
                },
            },
            saveToSentItems = true,
        };

        using HttpClient http = CreateClient(accessToken);
        using HttpResponseMessage response = await http.PostAsync(
            $"{GraphRoot}/me/sendMail", JsonBody(message), cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return Failure("メール送信", response, await response.Content.ReadAsStringAsync(cancellationToken));
        }

        logger.LogInformation("Sent {File} ({Bytes} bytes) to {Recipient}", fileName, content.Length, recipient);
        return $"{fileName} を {recipient} 宛にメールで送信しました。";
    }

    private static string Failure(string operation, HttpResponseMessage response, string body)
    {
        string detail = body.Length > 400 ? body[..400] : body;
        return (int)response.StatusCode is 403 or 401
            ? $"ツールがエラーを返しました: {operation}が権限で拒否されました（{(int)response.StatusCode}）。"
              + "管理者に、エージェントへの Files.ReadWrite / Mail.Send の同意を確認してもらう必要がある。"
            : $"ツールがエラーを返しました: {operation}に失敗しました（{(int)response.StatusCode}）。{detail}";
    }

    private HttpClient CreateClient(string accessToken)
    {
        HttpClient http = httpClientFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(120);
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return http;
    }

    private static StringContent JsonBody(object payload) =>
        new(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

    private static string? ReadString(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(name, out JsonElement value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}

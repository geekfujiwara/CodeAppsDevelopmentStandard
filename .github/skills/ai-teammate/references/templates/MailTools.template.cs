// 受け取ったメールへ **HTML で** 返信するローカル ツール。
//
// なぜ Work IQ の `do_action /me/messages/{id}/reply` ではなく Graph を直接呼ぶのか:
//   Work IQ の reply が運べるのは `{"comment": "..."}` のプレーン テキストだけで、
//   URL は死んだ文字列として届き、箇条書きも表も潰れる。共有リンクを渡す仕事をさせた瞬間に破綻する。
//   Graph の reply は message.body を丸ごと指定できるので、contentType = "HTML" で送れる。
//
// モデルには Markdown を書かせ、HTML への変換はここで行う（MessageHtml.template.cs）。
// プロンプトで「HTML で書け」と指示してはいけない。タグの閉じ忘れとエスケープ漏れが必ず出る。
//
// 前提となるプロジェクト側の型:
//   MessageHtml        … references/templates/MessageHtml.template.cs
//   LocalTool          … record LocalTool(McpToolDefinition Definition,
//                                         Func<JsonElement, CancellationToken, Task<string>> Invoke)
//   McpToolDefinition  … (Name, Description, InputSchema)
//
// 必要な委任スコープ: Mail.Send（Mail.ReadWrite では reply できない）。
//   respond_invite を使うなら Mail.Read と Calendars.ReadWrite も要る。
//   給付されていなければ 403 を返すが、そのときは Work IQ の do_action 経路へ誘導する。
//
// Program.cs:
//   builder.Services.AddSingleton<MailTools>();
//
// AgentBrain のツール接続時。**受信トレイ監視のスイープでだけ**有効にする
// （Teams の会話ターンでメール返信ツールを見せると、話し相手ではない誰かへ返信してしまう）:
//   if (includeMail && configuration.GetValue("Mail:Enabled", true))
//   {
//       toolset.AddLocal(mailTools.CreateTools(graphToken));
//   }
//
// 名前空間だけプロジェクトに合わせて置き換える。

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace <RootNamespace>;

/// <summary>
/// Replying to mail, run as the agentic user.
/// Work IQ's reply action only carries a plain-text comment, so links arrive as dead text and
/// structure is lost. Graph is called directly instead and the model's Markdown is converted here,
/// which keeps hyperlinks and lists intact without ever letting the model emit raw markup.
/// </summary>
public sealed class MailTools(IHttpClientFactory httpClientFactory, ILogger<MailTools> logger)
{
    private const string GraphRoot = "https://graph.microsoft.com/v1.0";

    public IReadOnlyList<LocalTool> CreateTools(string accessToken) =>
    [
        new LocalTool(
            new McpToolDefinition(
                "reply_mail",
                "受け取ったメールに返信する。メールへの返信は必ずこのツールを使うこと。"
                + "body は **Markdown で書く**。見出し・箇条書き・表・リンクは HTML に変換して送られるので、"
                + "HTML タグや <br> は自分で書かない。"
                + "URL は裸で並べず `[資料はこちら](https://...)` の形で書くこと。そうしないと相手側でリンクにならない。"
                + "要点が 2 つ以上あるときは箇条書きにし、1 行に詰め込まない。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "message_id": {
                          "type": "string",
                          "description": "返信するメールの id。受信一覧で渡された id をそのまま使う。本文取得の応答に含まれる別の id（予定の id など）は使わない。"
                        },
                        "body": {
                          "type": "string",
                          "description": "返信本文。Markdown（箇条書き - 、**強調**、[リンク](URL)、表）で書く。宛名から結びまで含める。"
                        },
                        "reply_all": {
                          "type": "boolean",
                          "description": "true にすると全員に返信する。既定は差出人のみ。"
                        }
                      },
                      "required": ["message_id", "body"]
                    }
                    """)),
            (arguments, cancellationToken) => ReplyAsync(accessToken, arguments, cancellationToken)),

        // 会議の招待は普通のメールとして受信トレイに並ぶので、このツールが無いと
        // モデルは reply_mail を呼ぶ。主催者には出欠として届かず、予定表も更新されない。
        new LocalTool(
            new McpToolDefinition(
                "respond_invite",
                "会議の招待メールに出欠を返す。招待メールに `reply_mail` で返信してはいけない（主催者には出欠として届かない）。"
                + "message_id は受信一覧で渡されたメールの id をそのまま使う。予定の id を探す必要はない。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "message_id": {
                          "type": "string",
                          "description": "招待メールの id。受信一覧で渡された id をそのまま使う。"
                        },
                        "response": {
                          "type": "string",
                          "enum": ["accept", "tentative", "decline"],
                          "description": "出欠。accept=出席、tentative=仮の出席、decline=欠席。"
                        },
                        "comment": {
                          "type": "string",
                          "description": "主催者に添えるひとこと。省略可。"
                        }
                      },
                      "required": ["message_id", "response"]
                    }
                    """)),
            (arguments, cancellationToken) => RespondInviteAsync(accessToken, arguments, cancellationToken)),
    ];

    private static readonly Dictionary<string, string> InviteActions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["accept"] = "accept",
        ["tentative"] = "tentativelyAccept",
        ["tentativelyaccept"] = "tentativelyAccept",
        ["decline"] = "decline",
    };

    private async Task<string> ReplyAsync(string accessToken, JsonElement arguments, CancellationToken cancellationToken)
    {
        string? messageId = ReadString(arguments, "message_id");
        string? body = ReadString(arguments, "body");
        if (string.IsNullOrWhiteSpace(messageId))
        {
            return "ツールがエラーを返しました: message_id が必要です。";
        }

        if (string.IsNullOrWhiteSpace(body))
        {
            return "ツールがエラーを返しました: body が空です。";
        }

        bool replyAll = arguments.TryGetProperty("reply_all", out JsonElement all) && all.ValueKind == JsonValueKind.True;
        string action = replyAll ? "replyAll" : "reply";
        var payload = new
        {
            message = new
            {
                body = new { contentType = "HTML", content = MessageHtml.FromMarkdown(body) },
            },
        };

        using HttpClient http = CreateClient(accessToken);
        using HttpResponseMessage response = await http.PostAsync(
            $"{GraphRoot}/me/messages/{Uri.EscapeDataString(messageId)}/{action}",
            JsonContent(payload),
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            string detail = await response.Content.ReadAsStringAsync(cancellationToken);
            logger.LogWarning("Mail {Action} failed with {Status}: {Detail}", action, (int)response.StatusCode, detail);

            // 予定の id を渡されたとき。ここで訂正しないと同じ id で再試行し続ける。
            if (detail.Contains("ErrorInvalidIdMalformed", StringComparison.Ordinal)
                || detail.Contains("ErrorItemNotFound", StringComparison.Ordinal))
            {
                return "ツールがエラーを返しました: その message_id はメールの id ではありません。"
                     + "受信一覧で渡された id をそのまま使ってください。"
                     + "会議の招待に出欠を返したいのなら `respond_invite` を使います。同じ id で再試行しないこと。";
            }

            return $"ツールがエラーを返しました: 返信の送信に失敗しました（{(int)response.StatusCode}）。" + Truncate(detail);
        }

        // 二重返信はエージェントがいちばんやりがちな事故なので、成功メッセージで釘を刺す。
        logger.LogInformation("Replied to message {MessageId} (replyAll={ReplyAll})", messageId, replyAll);
        return "返信しました。同じメールに二重で返信しないこと。";
    }

    /// <summary>
    /// Responds to a meeting invitation. The event behind an invitation can only be reached through
    /// the mail item, and letting the model pick the id makes it confuse the message id with the
    /// event id, so the lookup happens here and the model only ever passes the id it was given.
    /// </summary>
    private async Task<string> RespondInviteAsync(string accessToken, JsonElement arguments, CancellationToken cancellationToken)
    {
        string? messageId = ReadString(arguments, "message_id");
        if (string.IsNullOrWhiteSpace(messageId))
        {
            return "ツールがエラーを返しました: message_id が必要です。";
        }

        string? answer = ReadString(arguments, "response")?.Trim();
        if (answer is null || !InviteActions.TryGetValue(answer, out string? action))
        {
            return "ツールがエラーを返しました: response は accept / tentative / decline のいずれかです。";
        }

        using HttpClient http = CreateClient(accessToken);
        string lookup = $"{GraphRoot}/me/messages/{Uri.EscapeDataString(messageId)}"
            + "?$select=id,subject&$expand=microsoft.graph.eventMessage/event($select=id,subject,start,end)";

        using HttpResponseMessage found = await http.GetAsync(lookup, cancellationToken);
        string payload = await found.Content.ReadAsStringAsync(cancellationToken);
        if (!found.IsSuccessStatusCode)
        {
            logger.LogWarning("Invite lookup failed with {Status}: {Detail}", (int)found.StatusCode, payload);
            return $"ツールがエラーを返しました: 招待メールを読めませんでした（{(int)found.StatusCode}）。"
                 + "`fetch` `/me/calendarView` でその予定を探し、`do_action` `/me/events/{予定の id}/"
                 + $"{action}`（本文 `{{\"sendResponse\":true}}`）で出欠を返してください。" + Truncate(payload);
        }

        if (ReadEventId(payload) is not { } eventId)
        {
            return "ツールがエラーを返しました: このメールに予定が紐づいていません。会議の招待ではないので出欠を返す必要はありません。"
                 + "返信が要る内容なら `reply_mail` を使ってください。";
        }

        var body = new { sendResponse = true, comment = ReadString(arguments, "comment") ?? string.Empty };
        using HttpResponseMessage sent = await http.PostAsync(
            $"{GraphRoot}/me/events/{Uri.EscapeDataString(eventId)}/{action}",
            JsonContent(body),
            cancellationToken);

        if (!sent.IsSuccessStatusCode)
        {
            string detail = await sent.Content.ReadAsStringAsync(cancellationToken);
            logger.LogWarning("Invite {Action} failed with {Status}: {Detail}", action, (int)sent.StatusCode, detail);

            // 予定表への書き込みが Work IQ ポリシー側にしか無い構成もあるので、モデルが自力では
            // 解決できない id を渡したうえで do_action へ逃がす。ここで諦めると reply_mail に戻る。
            if (sent.StatusCode is System.Net.HttpStatusCode.Forbidden or System.Net.HttpStatusCode.Unauthorized)
            {
                return $"ツールがエラーを返しました: 直接の出欠送信が塞がれています（{(int)sent.StatusCode}）。"
                     + $"`do_action` で `/me/events/{eventId}/{action}` を本文 `{{\"sendResponse\":true}}` で呼んでください。"
                     + "`reply_mail` で代用しないこと。";
            }

            return $"ツールがエラーを返しました: 出欠の送信に失敗しました（{(int)sent.StatusCode}）。" + Truncate(detail);
        }

        logger.LogInformation("Responded {Action} to invitation {MessageId}", action, messageId);
        return $"出欠を返しました（{action}）。予定表にも反映済みです。同じ招待に二重で応答しないこと。";
    }

    private static string? ReadEventId(string payload)
    {
        try
        {
            using JsonDocument document = JsonDocument.Parse(payload);
            return document.RootElement.TryGetProperty("event", out JsonElement calendarEvent)
                && calendarEvent.ValueKind == JsonValueKind.Object
                    ? ReadString(calendarEvent, "id")
                    : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string Truncate(string detail) => detail.Length > 300 ? detail[..300] : detail;

    private HttpClient CreateClient(string accessToken)
    {
        HttpClient http = httpClientFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(60);
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return http;
    }

    private static StringContent JsonContent(object payload) =>
        new(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

    private static JsonElement Schema(string json) => JsonSerializer.Deserialize<JsonElement>(json);

    private static string? ReadString(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(name, out JsonElement value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}

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
// 必要な委任スコープ: Mail.Send（Mail.ReadWrite では reply できない）
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
                          "description": "返信するメールの id。受信一覧で渡された id をそのまま使う。"
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
    ];

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
            return $"ツールがエラーを返しました: 返信の送信に失敗しました（{(int)response.StatusCode}）。"
                 + (detail.Length > 300 ? detail[..300] : detail);
        }

        // 二重返信はエージェントがいちばんやりがちな事故なので、成功メッセージで釘を刺す。
        logger.LogInformation("Replied to message {MessageId} (replyAll={ReplyAll})", messageId, replyAll);
        return "返信しました。同じメールに二重で返信しないこと。";
    }

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

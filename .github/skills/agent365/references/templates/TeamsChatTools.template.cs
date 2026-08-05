// エージェント名義で Teams のチャットを作り、メッセージを送る。
//
// Work IQ の書き込みは Rego のパス allowlist で制限されており、`/chats` は入っていない
// （`Path is not in the policy allowlist.` が返る）。そこで Microsoft Graph を直接呼ぶ。
// トークンは**エージェンティック ユーザーの委任トークン**なので、相手の Teams には
// エージェント本人からのメッセージとして届く。UAMI のアプリ権限では送れない
// （app-only の chat message 送信は Teamwork.Migrate.All ＝ 保護 API 承認が要る）。
//
// 必要な委任スコープ（インスタンス SP へ管理者同意。scripts/grant_agent_graph_scopes.py）:
//   User.Read / Chat.Create / Chat.Read / ChatMessage.Send
//
// 前提となるプロジェクト側の型:
//   LocalTool          … MCP 以外のツールを同じツール ループへ載せるための型
//                        record LocalTool(McpToolDefinition Definition,
//                                         Func<JsonElement, CancellationToken, Task<string>> Invoke)
//   McpToolDefinition  … (Name, Description, InputSchema)
//   McpToolset         … AddLocal(IEnumerable<LocalTool>) / TryGetLocal(string, out LocalTool)
//   MessageHtml        … references/templates/MessageHtml.template.cs（Markdown → HTML）
//
// Program.cs:
//   builder.Services.AddSingleton<TeamsChatTools>();
//
// AgentBrain のツール接続時（入口ごとに ON/OFF できるようにする）:
//   if (includeTeamsChat && configuration.GetValue("TeamsChat:Enabled", true)
//       && await tokenForScope(TeamsChatTools.GraphScope, ct) is { Length: > 0 } graphToken)
//   {
//       toolset.AddLocal(teamsChat.CreateTools(graphToken));
//   }
//
// 受信トレイ経路（MailboxWorker）では既定で無効にする。メール本文の「◯◯さんに伝えて」を
// そのまま実行できてしまい、プロンプト インジェクションの出口になるため。
//   TeamsChat__Enabled     = true    （Teams 会話の入口）
//   TeamsChat__FromMailbox = false   （メール自動処理の入口）

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

public sealed partial class TeamsChatTools(IHttpClientFactory httpClientFactory, ILogger<TeamsChatTools> logger)
{
    public const string GraphScope = "https://graph.microsoft.com/.default";

    private const string GraphRoot = "https://graph.microsoft.com/v1.0";
    private const int MaxGroupMembers = 20;

    public IReadOnlyList<LocalTool> CreateTools(string accessToken) =>
    [
        new LocalTool(
            new McpToolDefinition(
                "list_teams_chats",
                "エージェント自身が参加している Teams のチャットを一覧する。新しく作る前に、"
                + "同じ相手とのチャットが既にあるかを確認するために使う。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "filter": {
                          "type": "string",
                          "description": "トピック名・参加者の表示名・メール アドレスに対する部分一致（大小文字は無視）。"
                        },
                        "top": { "type": "integer", "description": "返す件数。既定 20、最大 50。" }
                      }
                    }
                    """)),
            (arguments, cancellationToken) => ListChatsAsync(accessToken, arguments, cancellationToken)),

        new LocalTool(
            new McpToolDefinition(
                "create_teams_chat",
                "Teams のチャットを新規作成する。members が 1 人なら 1 対 1 チャット、2 人以上ならグループ チャット。"
                + "エージェント自身は自動で参加者に含まれるので指定しない。作成しただけでは相手に通知されないので、"
                + "続けて send_teams_chat_message でメッセージを送ること。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "members": {
                          "type": "array",
                          "items": { "type": "string" },
                          "description": "参加者のメール アドレス（UPN）の配列。表示名ではなくアドレスを渡す。"
                        },
                        "topic": {
                          "type": "string",
                          "description": "グループ チャットの件名。1 対 1 チャットでは無視される。"
                        }
                      },
                      "required": ["members"]
                    }
                    """)),
            (arguments, cancellationToken) => CreateChatAsync(accessToken, arguments, cancellationToken)),

        new LocalTool(
            new McpToolDefinition(
                "send_teams_chat_message",
                "既存の Teams チャットにメッセージを送信する。chatId は create_teams_chat か list_teams_chats で得たものを使う。"
                + "message は **Markdown で書く**。見出し・箇条書き・表・リンクは Teams の書式に変換して送られる。"
                + "URL は裸のまま並べず `[見出し](https://...)` の形で書くと、リンクとして表示される。"
                + "1 行に詰め込まず、空行で段落を分け、列挙は `- ` で箇条書きにする。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "chatId": { "type": "string", "description": "チャット ID（例: 19:....@thread.v2）。" },
                        "message": {
                          "type": "string",
                          "description": "送信する本文。Markdown（見出し ##、箇条書き - 、**強調**、[リンク](URL)、表）で書く。"
                        }
                      },
                      "required": ["chatId", "message"]
                    }
                    """)),
            (arguments, cancellationToken) => SendMessageAsync(accessToken, arguments, cancellationToken)),
    ];

    private async Task<string> ListChatsAsync(string accessToken, JsonElement arguments, CancellationToken cancellationToken)
    {
        int top = arguments.TryGetProperty("top", out JsonElement topValue) && topValue.TryGetInt32(out int parsed)
            ? Math.Clamp(parsed, 1, 50)
            : 20;
        string? filter = ReadString(arguments, "filter");

        using HttpClient http = CreateClient(accessToken);
        using HttpResponseMessage response = await http.GetAsync(
            $"{GraphRoot}/me/chats?$expand=members&$top=50", cancellationToken);
        string body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            return Failure("GET /me/chats", response, body);
        }

        using JsonDocument document = JsonDocument.Parse(body);
        if (!document.RootElement.TryGetProperty("value", out JsonElement chats))
        {
            return "チャットを取得できませんでした。";
        }

        var lines = new List<string>();
        foreach (JsonElement chat in chats.EnumerateArray())
        {
            string line = DescribeChat(chat);
            if (filter is { Length: > 0 } && !line.Contains(filter, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            lines.Add(line);
            if (lines.Count >= top)
            {
                break;
            }
        }

        return lines.Count == 0 ? "該当するチャットはありません。" : string.Join("\n", lines);
    }

    private async Task<string> CreateChatAsync(string accessToken, JsonElement arguments, CancellationToken cancellationToken)
    {
        List<string> members = ReadStringArray(arguments, "members");
        if (members.Count == 0)
        {
            return "ツールがエラーを返しました: members に参加者のメール アドレスを 1 件以上指定してください。";
        }

        if (members.Count > MaxGroupMembers)
        {
            return $"ツールがエラーを返しました: 参加者は最大 {MaxGroupMembers} 人までにしてください。";
        }

        if (members.FirstOrDefault(m => !UserKey().IsMatch(m)) is { } invalid)
        {
            return $"ツールがエラーを返しました: '{invalid}' はメール アドレスの形式ではありません。表示名ではなくアドレスを渡してください。";
        }

        using HttpClient http = CreateClient(accessToken);

        AgentAccount? self = await ReadSelfAsync(http, cancellationToken);
        if (self is null)
        {
            return "ツールがエラーを返しました: エージェント自身のアカウントを特定できませんでした。";
        }

        // The model often lists the agent as a participant; Graph rejects duplicate members.
        members.RemoveAll(self.Matches);
        if (members.Count == 0)
        {
            return "ツールがエラーを返しました: 自分自身だけのチャットは作れません。相手を指定してください。";
        }

        bool oneOnOne = members.Count == 1;
        var payload = new Dictionary<string, object?>
        {
            ["chatType"] = oneOnOne ? "oneOnOne" : "group",
            ["members"] = members.Prepend(self.Id).Select(BuildMember).ToArray(),
        };

        // Graph rejects a topic on one-on-one chats.
        if (!oneOnOne && ReadString(arguments, "topic") is { Length: > 0 } topic)
        {
            payload["topic"] = topic;
        }

        using HttpResponseMessage response = await http.PostAsync(
            $"{GraphRoot}/chats", JsonContent(payload), cancellationToken);
        string body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            return Failure("POST /chats", response, body);
        }

        using JsonDocument document = JsonDocument.Parse(body);
        string chatId = ReadString(document.RootElement, "id") ?? "(不明)";
        logger.LogInformation("Created Teams chat {ChatId} with {Count} member(s)", chatId, members.Count);

        return $"チャットを作成しました。chatId: {chatId} / 種別: {(oneOnOne ? "1 対 1" : "グループ")} / "
            + $"参加者: {string.Join(", ", members)}\nまだ誰にも通知されていません。send_teams_chat_message で本文を送ってください。";
    }

    private async Task<string> SendMessageAsync(string accessToken, JsonElement arguments, CancellationToken cancellationToken)
    {
        string chatId = ReadString(arguments, "chatId") ?? string.Empty;
        string message = ReadString(arguments, "message") ?? string.Empty;

        if (!ChatId().IsMatch(chatId))
        {
            return "ツールがエラーを返しました: chatId が不正です。create_teams_chat か list_teams_chats が返した値を使ってください。";
        }

        if (message.Trim().Length == 0)
        {
            return "ツールがエラーを返しました: message が空です。";
        }

        using HttpClient http = CreateClient(accessToken);
        using HttpResponseMessage response = await http.PostAsync(
            $"{GraphRoot}/chats/{chatId}/messages",
            // text で送ると URL が死んだ文字列になり、箇条書きも表も潰れる。
            // モデルには Markdown を書かせ、変換はコードで行う（MessageHtml.template.cs）。
            JsonContent(new { body = new { contentType = "html", content = MessageHtml.FromMarkdown(message) } }),
            cancellationToken);
        string body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            return Failure($"POST /chats/{chatId}/messages", response, body);
        }

        logger.LogInformation("Sent Teams chat message to {ChatId} ({Length} chars)", chatId, message.Length);
        return "メッセージを送信しました。";
    }

    private async Task<AgentAccount?> ReadSelfAsync(HttpClient http, CancellationToken cancellationToken)
    {
        using HttpResponseMessage response = await http.GetAsync(
            $"{GraphRoot}/me?$select=id,userPrincipalName,mail", cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("GET /me returned {Status}", (int)response.StatusCode);
            return null;
        }

        using JsonDocument document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        return ReadString(document.RootElement, "id") is { Length: > 0 } id
            ? new AgentAccount(
                id,
                ReadString(document.RootElement, "userPrincipalName"),
                ReadString(document.RootElement, "mail"))
            : null;
    }

    private sealed record AgentAccount(string Id, string? UserPrincipalName, string? Mail)
    {
        public bool Matches(string candidate) =>
            string.Equals(candidate, Id, StringComparison.OrdinalIgnoreCase)
            || string.Equals(candidate, UserPrincipalName, StringComparison.OrdinalIgnoreCase)
            || string.Equals(candidate, Mail, StringComparison.OrdinalIgnoreCase);
    }

    private static object BuildMember(string idOrUpn) => new Dictionary<string, object>
    {
        ["@odata.type"] = "#microsoft.graph.aadUserConversationMember",
        ["roles"] = new[] { "owner" },
        ["user@odata.bind"] = $"{GraphRoot}/users('{idOrUpn}')",
    };

    private static string DescribeChat(JsonElement chat)
    {
        string id = ReadString(chat, "id") ?? "(id なし)";
        string chatType = ReadString(chat, "chatType") ?? "-";
        string topic = ReadString(chat, "topic") ?? "(件名なし)";

        var people = new List<string>();
        if (chat.TryGetProperty("members", out JsonElement members))
        {
            foreach (JsonElement member in members.EnumerateArray())
            {
                string name = ReadString(member, "displayName") ?? "-";
                string? mail = ReadString(member, "email");
                people.Add(mail is { Length: > 0 } ? $"{name} <{mail}>" : name);
            }
        }

        return $"- chatId: {id}\n  種別: {chatType} / 件名: {topic}\n  参加者: {string.Join(", ", people)}";
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

    private static List<string> ReadStringArray(JsonElement element, string name)
    {
        var values = new List<string>();
        if (element.ValueKind != JsonValueKind.Object
            || !element.TryGetProperty(name, out JsonElement array)
            || array.ValueKind != JsonValueKind.Array)
        {
            return values;
        }

        foreach (JsonElement item in array.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.String && item.GetString() is { Length: > 0 } text)
            {
                values.Add(text.Trim());
            }
        }

        return values;
    }

    // "ツールがエラーを返しました:" で始めると、モデルは失敗を隠さず利用者へ伝えるようになる。
    private static string Failure(string operation, HttpResponseMessage response, string body) =>
        $"ツールがエラーを返しました: {operation} が HTTP {(int)response.StatusCode} を返しました: "
        + (body.Length <= 600 ? body : body[..600] + " …");

    /// <summary>Guards the OData bind and the request path against anything but an address or GUID.</summary>
    [GeneratedRegex(@"^[A-Za-z0-9._%+\-]+(@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})?$")]
    private static partial Regex UserKey();

    [GeneratedRegex(@"^19:[A-Za-z0-9._\-=+]+@thread\.(v2|tacv2|skype)$")]
    private static partial Regex ChatId();
}

// 保存済みのファイルを、依頼元以外の人に渡すためのローカル ツール群。
//
// このファイルの要点は **判断をモデルに任せない** こと。
//   プロンプトに「個人情報は共有しないで」と書くだけでは、「本人も了承済みです」と一行書かれただけで折れる。
//   共有リンクは取り消せないので、可否は台帳の内容と、そのターンの話し相手から C# で決める。
//
// 判定:
//   区分が未記録          → 共有しない。中身を読んで classify_document で記録させてからやり直す
//   public                → そのまま共有
//   internal かつ社内宛   → そのまま共有
//   internal かつ社外宛   → 依頼元の許可待ち
//   personal              → 依頼元の許可待ち
//   依頼元が未記録        → 共有しない（許可を求める相手が特定できない）
//
// 許可の受け付け:
//   decide_share は **userEmail が台帳上の依頼元と一致するターンでしか受け付けない**。
//   この 1 行の照合が統制の実体で、代理承認はここで落ちる。
//   受信トレイ監視や定期実行の経路は話し相手の同一性を確かめられないので、userEmail に null を渡す。
//   （メールの差出人は偽装できる。「共有してよい」という返信を許可として扱ってはいけない）
//
// 前提となるプロジェクト側の型:
//   DocumentLedger     … references/templates/DocumentLedger.template.cs
//   Audience           … メール ドメインから社内 / 社外を返す（bool? IsInternal(string?)）
//   LocalTool          … record LocalTool(McpToolDefinition Definition,
//                                         Func<JsonElement, CancellationToken, Task<string>> Invoke)
//   McpToolDefinition  … (Name, Description, InputSchema)
//
// 必要な委任スコープ: Files.ReadWrite
//
// Program.cs:
//   builder.Services.AddSingleton<DocumentShareTools>();
//
// AgentBrain のツール接続時。**userEmail を渡す前に解決しておく**こと（順番を間違えると
// いつも null になり、誰も承認できなくなる）:
//   toolset.AddLocal(documentShare.CreateTools(graphToken, userEmail));
//
// アプリ設定:
//   Documents__Folder = <成果物を置く OneDrive フォルダー名>   （生成側と必ず揃える）
//
// 名前空間だけプロジェクトに合わせて置き換える。

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace <RootNamespace>;

/// <summary>
/// Passing an already-created file on to somebody else.
///
/// A sharing link cannot be recalled, so the decision is made here in code rather than left to the
/// model's judgement: an unclassified file is never shared, and a file holding personal data is
/// only shared after the person who asked for it has said yes in their own Teams turn.
/// </summary>
public sealed class DocumentShareTools(
    DocumentLedger ledger,
    Audience audience,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<DocumentShareTools> logger)
{
    private const string GraphRoot = "https://graph.microsoft.com/v1.0";

    private string Folder => configuration["Documents:Folder"] ?? "<AgentFilesFolder>";

    /// <param name="userEmail">Who is on the other side of this turn. Null for mail sweeps and
    /// scheduled runs, where the speaker cannot be trusted well enough to record a decision.</param>
    public IReadOnlyList<LocalTool> CreateTools(string accessToken, string? userEmail) =>
    [
        new LocalTool(
            new McpToolDefinition(
                "list_documents",
                "これまでに作って保存したファイルを一覧する。「あの資料」「前に作ったやつ」と言われたときや、"
                + "共有を頼まれたときに、まずこれで対象を特定する。"
                + "各ファイルの区分（公開可 / 社内限り / 個人情報を含む / 未分類）と依頼元も返る。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "filter": { "type": "string", "description": "ファイル名に対する部分一致。" }
                      }
                    }
                    """)),
            (arguments, cancellationToken) => ListAsync(accessToken, arguments, cancellationToken)),

        new LocalTool(
            new McpToolDefinition(
                "classify_document",
                "ファイルの中身を確認したうえで、その取り扱い区分を記録する。"
                + "未分類のファイルを共有する前に必ず通る。**中身を見ずに区分を決めてはいけない。**"
                + "import_file で取り込み、run_python で開いて読んでから呼ぶこと。"
                + "区分は public（公開情報・社外に出しても困らない）、internal（社内限りだが個人情報ではない）、"
                + "personal（氏名と結びついた評価・報酬・健康・連絡先など、本人以外に見せると問題になるもの）。"
                + "迷ったら厳しいほうを選ぶ。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "name": { "type": "string", "description": "対象のファイル名。list_documents の名前をそのまま使う。" },
                        "sensitivity": {
                          "type": "string",
                          "enum": ["public", "internal", "personal"],
                          "description": "中身を読んだうえでの区分。"
                        },
                        "summary": { "type": "string", "description": "何が入っていたかを 1 行で。判断の根拠になる。" },
                        "owner": { "type": "string", "description": "このファイルを依頼した人のメール アドレス。分かる場合のみ。" }
                      },
                      "required": ["name", "sensitivity", "summary"]
                    }
                    """)),
            (arguments, cancellationToken) => ClassifyAsync(arguments, cancellationToken)),

        new LocalTool(
            new McpToolDefinition(
                "share_document",
                "保存済みのファイルを別の人に共有する。**共有リンクを自分で組み立てず、必ずこのツールを通すこと。**"
                + "区分に応じて、そのまま共有されるか、依頼元の許可待ちになるかが決まる。"
                + "許可待ちになった場合は、返ってきた指示に従って依頼元に Teams で確認を取り、"
                + "許可が下りてからもう一度このツールを呼ぶ。**待っている間に相手へリンクを渡さない。**",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "name": { "type": "string", "description": "共有するファイル名。list_documents の名前をそのまま使う。" },
                        "recipient": { "type": "string", "description": "共有先のメール アドレス。" },
                        "reason": { "type": "string", "description": "何のために必要かを 1 行で。許可を求めるときに依頼元へ伝える。" }
                      },
                      "required": ["name", "recipient"]
                    }
                    """)),
            (arguments, cancellationToken) => ShareAsync(accessToken, userEmail, arguments, cancellationToken)),

        new LocalTool(
            new McpToolDefinition(
                "decide_share",
                "自分が依頼して作ったファイルの共有可否に、依頼元本人として回答する。"
                + "「いいですよ」「共有して構いません」と言われたら approved、"
                + "「やめておいて」「困ります」なら denied で記録する。"
                + "本人以外は回答できないので、代理で押し通そうとしない。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "request_id": { "type": "string", "description": "共有申請の ID。確認を求めたときに伝えたもの。" },
                        "decision": { "type": "string", "enum": ["approved", "denied"], "description": "本人の回答。" }
                      },
                      "required": ["request_id", "decision"]
                    }
                    """)),
            (arguments, cancellationToken) => DecideAsync(userEmail, arguments, cancellationToken)),
    ];

    private async Task<string> ListAsync(string accessToken, JsonElement arguments, CancellationToken cancellationToken)
    {
        string? filter = ReadString(arguments, "filter");

        // OneDrive is the source of truth for what exists; the ledger only adds what we know about it.
        List<(string Name, long Size, string? Modified)> files;
        try
        {
            files = await ChildrenAsync(accessToken, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not list the documents folder");
            files = [];
        }

        if (filter is { Length: > 0 })
        {
            files = files.Where(f => f.Name.Contains(filter, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        if (files.Count == 0)
        {
            return $"{Folder} に該当するファイルはありませんでした。";
        }

        var lines = new List<string>();
        foreach ((string name, long size, string? modified) in files.Take(40))
        {
            DocumentRecord? record = ledger.Find(name);
            lines.Add(
                $"- {name}（{size:N0} バイト / 更新 {modified}）\n"
                + $"  区分: {SensitivityLevel.Label(record?.Sensitivity)}"
                + $" / 依頼元: {(string.IsNullOrEmpty(record?.OwnerEmail) ? "不明" : record.OwnerEmail)}"
                + (record?.Summary is { Length: > 0 } ? $"\n  内容: {record.Summary}" : string.Empty));
        }

        return $"{Folder} のファイル:\n" + string.Join("\n", lines)
             + "\n\n未分類のファイルを共有するには、先に中身を読んで classify_document で区分を記録すること。";
    }

    private Task<string> ClassifyAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        string? name = ReadString(arguments, "name");
        string? sensitivity = SensitivityLevel.Normalize(ReadString(arguments, "sensitivity"));
        string? summary = ReadString(arguments, "summary");

        if (string.IsNullOrWhiteSpace(name))
        {
            return Task.FromResult("ツールがエラーを返しました: name が必要です。");
        }

        if (sensitivity is null)
        {
            return Task.FromResult("ツールがエラーを返しました: sensitivity は public / internal / personal のいずれかです。");
        }

        if (string.IsNullOrWhiteSpace(summary))
        {
            return Task.FromResult(
                "ツールがエラーを返しました: summary が必要です。中身を読まずに区分だけ決めることはできません。");
        }

        ledger.Record(name, null, null, ReadString(arguments, "owner"), sensitivity, summary);
        return Task.FromResult($"「{name}」を{SensitivityLevel.Label(sensitivity)}として記録しました。");
    }

    private async Task<string> ShareAsync(
        string accessToken, string? userEmail, JsonElement arguments, CancellationToken cancellationToken)
    {
        string? name = ReadString(arguments, "name");
        string? recipient = ReadString(arguments, "recipient");
        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(recipient))
        {
            return "ツールがエラーを返しました: name と recipient が必要です。";
        }

        DocumentRecord? record = ledger.Find(name);
        if (record?.Sensitivity is null)
        {
            return $"まだ共有できません。「{name}」の中身を確認していないためです。\n"
                 + $"import_file で `{Folder}/{name}` を作業環境に取り込み、run_python で開いて中身を読み、"
                 + "classify_document で区分を記録してから、もう一度 share_document を呼ぶこと。";
        }

        string sensitivity = record.Sensitivity;
        bool recipientIsInternal = audience.IsInternal(recipient) is true;

        // Personal data, or anything leaving the company, needs the requester's word — not the agent's.
        bool needsConsent = sensitivity == SensitivityLevel.Personal
            || (sensitivity == SensitivityLevel.Internal && !recipientIsInternal);

        if (needsConsent && !ledger.IsApproved(record.Name, recipient))
        {
            return await AwaitConsentAsync(record, recipient, userEmail, arguments);
        }

        string? link = await CreateLinkAsync(accessToken, record, cancellationToken);
        if (link is null)
        {
            return $"ツールがエラーを返しました: 「{record.Name}」の共有リンクを発行できませんでした。";
        }

        logger.LogInformation(
            "Shared {Document} ({Sensitivity}) with {Recipient}", record.Name, sensitivity, recipient);
        return $"「{record.Name}」（{SensitivityLevel.Label(sensitivity)}）の共有リンクを発行しました。\n"
             + $"{link}\nこの URL をそのまま {recipient} に伝えること。"
             + (recipientIsInternal
                 ? string.Empty
                 : "\nただしこのリンクは社内向けのため、社外の相手はそのままでは開けない。"
                   + "相手に開けない旨を伝えられたら、ファイルを直接添付して送ることを提案する。");
    }

    private Task<string> AwaitConsentAsync(
        DocumentRecord record, string recipient, string? userEmail, JsonElement arguments)
    {
        if (string.IsNullOrWhiteSpace(record.OwnerEmail))
        {
            return Task.FromResult(
                $"共有できません。「{record.Name}」は{SensitivityLevel.Label(record.Sensitivity)}ですが、"
                + "依頼元が記録されていないため誰に許可を求めればよいか分かりません。\n"
                + "依頼元が分かったら classify_document の owner で記録すること。分からないうちは共有しない。");
        }

        if (string.Equals(record.OwnerEmail, recipient, StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult(
                $"「{record.Name}」の共有先は依頼元本人です。許可は不要ですが、"
                + "本人には既に渡してあるはずなので、元のリンクを案内すること。");
        }

        string? reason = ReadString(arguments, "reason");
        ShareRequest request = ledger.OpenRequest(
            record.Name, recipient, record.OwnerEmail, reason ?? (userEmail is { Length: > 0 } ? $"{userEmail} からの依頼" : null));

        return Task.FromResult(
            $"まだ共有できません。「{record.Name}」は{SensitivityLevel.Label(record.Sensitivity)}のため、"
            + $"依頼元の {record.OwnerEmail} さんの許可が要ります。\n"
            + $"申請 ID: {request.Id}\n\n"
            + $"いま次をすること。\n"
            + $"1. {record.OwnerEmail} さんとの Teams チャットを list_teams_chats で探し、無ければ create_teams_chat で作る。\n"
            + $"2. send_teams_chat_message で許可を求める。何のファイルを・誰に・なぜ渡したいのかを書き、"
            + "「よろしければお知らせください」と結ぶ。申請 ID は本文に書かなくてよい。\n"
            + $"3. 共有を頼んできた相手には、**リンクを渡さず**「依頼元に確認しているので返事を待ってほしい」と伝える。\n"
            + $"許可が下りるのは {record.OwnerEmail} さん本人がミーナに返事をしたときだけ。ここで先に渡してはいけない。");
    }

    private Task<string> DecideAsync(string? userEmail, JsonElement arguments, CancellationToken cancellationToken)
    {
        string? requestId = ReadString(arguments, "request_id");
        string decision = ReadString(arguments, "decision")?.Trim().ToLowerInvariant() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(requestId))
        {
            return Task.FromResult("ツールがエラーを返しました: request_id が必要です。");
        }

        if (decision is not ("approved" or "denied"))
        {
            return Task.FromResult("ツールがエラーを返しました: decision は approved か denied です。");
        }

        ShareRequest? request = ledger.FindRequest(requestId);
        if (request is null)
        {
            return Task.FromResult($"ツールがエラーを返しました: 申請 {requestId} が見つかりません。");
        }

        // The only thing standing between a persuasive message and someone else's personal data.
        if (string.IsNullOrWhiteSpace(userEmail))
        {
            return Task.FromResult(
                "この経路では共有の可否を記録できません。許可はご本人が Teams でミーナに直接伝える必要があります。"
                + "そのようにご案内すること。");
        }

        if (!string.Equals(userEmail, request.OwnerEmail, StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning(
                "Share request {Id} decision refused: {Speaker} is not the owner {Owner}",
                request.Id, userEmail, request.OwnerEmail);
            return Task.FromResult(
                $"この申請に回答できるのは依頼元の {request.OwnerEmail} さんだけです。"
                + "いま話している相手は別の人なので記録しません。代理での承認は受け付けないと伝えること。");
        }

        if (!request.IsPending)
        {
            return Task.FromResult($"申請 {request.Id} は既に「{request.Status}」で確定しています。");
        }

        ledger.Decide(request, decision == "approved");

        return Task.FromResult(decision == "approved"
            ? $"許可を記録しました。「{request.DocumentName}」を {request.RequesterEmail} さんへ共有できます。"
              + "share_document をもう一度呼んでリンクを発行し、依頼者に伝えること。"
            : $"お断りとして記録しました。「{request.DocumentName}」は {request.RequesterEmail} さんへ共有しません。"
              + "依頼者には、理由には触れず「依頼元の意向により今回はお渡しできません」と伝えること。");
    }

    private async Task<List<(string Name, long Size, string? Modified)>> ChildrenAsync(
        string accessToken, CancellationToken cancellationToken)
    {
        string path = string.Join('/', Folder.Split('/').Select(Uri.EscapeDataString));
        using HttpClient http = CreateClient(accessToken);
        using HttpResponseMessage response = await http.GetAsync(
            $"{GraphRoot}/me/drive/root:/{path}:/children?$select=id,name,size,lastModifiedDateTime&$top=100",
            cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return [];
        }

        using JsonDocument document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        var files = new List<(string, long, string?)>();
        if (document.RootElement.TryGetProperty("value", out JsonElement items))
        {
            foreach (JsonElement item in items.EnumerateArray())
            {
                string? name = ReadString(item, "name");
                if (name is null or { Length: 0 })
                {
                    continue;
                }

                long size = item.TryGetProperty("size", out JsonElement bytes) && bytes.TryGetInt64(out long value) ? value : 0;
                files.Add((name, size, ReadString(item, "lastModifiedDateTime")));
            }
        }

        return files;
    }

    private async Task<string?> CreateLinkAsync(
        string accessToken, DocumentRecord record, CancellationToken cancellationToken)
    {
        using HttpClient http = CreateClient(accessToken);
        string? itemId = record.ItemId;

        if (string.IsNullOrEmpty(itemId))
        {
            string path = string.Join('/', $"{Folder}/{record.Name}".Split('/').Select(Uri.EscapeDataString));
            using HttpResponseMessage lookup = await http.GetAsync(
                $"{GraphRoot}/me/drive/root:/{path}?$select=id,webUrl", cancellationToken);
            if (!lookup.IsSuccessStatusCode)
            {
                return null;
            }

            using JsonDocument item = JsonDocument.Parse(await lookup.Content.ReadAsStringAsync(cancellationToken));
            itemId = ReadString(item.RootElement, "id");
            if (string.IsNullOrEmpty(itemId))
            {
                return null;
            }

            ledger.Record(record.Name, itemId, ReadString(item.RootElement, "webUrl"), null, null, null);
        }

        // An anonymous link would outlive the recipient's employment, so the scope stays inside the
        // tenant even when consent has been given.
        using HttpResponseMessage link = await http.PostAsync(
            $"{GraphRoot}/me/drive/items/{itemId}/createLink",
            JsonContent(new { type = "view", scope = "organization" }),
            cancellationToken);
        if (!link.IsSuccessStatusCode)
        {
            logger.LogWarning("createLink returned {Status} for {Document}", (int)link.StatusCode, record.Name);
            return record.WebUrl;
        }

        using JsonDocument created = JsonDocument.Parse(await link.Content.ReadAsStringAsync(cancellationToken));
        return created.RootElement.TryGetProperty("link", out JsonElement details)
            ? ReadString(details, "webUrl") ?? record.WebUrl
            : record.WebUrl;
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
        && value.GetString() is { Length: > 0 } text
            ? text
            : null;
}


// 定期実行（B11）を会話の中で登録・確認・削除するためのローカル ツール。
//
// 頻度をコードに埋めず、エージェント自身に自分の仕事を登録させる。ツールの説明文に
// 「確認してから呼ぶ」「会話を読まなくても分かる指示文を書く」を入れてあるので、
// プロンプト側（B8）とあわせて行動を揃える。会話設計は references/scheduled-delivery.md §3。
//
// 前提となるプロジェクト側の型:
//   LocalTool          … record LocalTool(McpToolDefinition Definition,
//                                         Func<JsonElement, CancellationToken, Task<string>> Invoke)
//   McpToolDefinition  … (Name, Description, InputSchema)
//   McpToolset         … AddLocal(IEnumerable<LocalTool>)
//
// Program.cs:
//   builder.Services.AddSingleton<ScheduleTools>();
//
// AgentBrain のツール接続時:
//   if (configuration.GetValue("Schedule:Enabled", true))
//   {
//       toolset.AddLocal(schedules.CreateTools());
//   }

using System.Text.Json;

/// <summary>
/// Lets the agent set up its own recurring work during a conversation: what to do, how often,
/// and where the result should land. <see cref="ScheduleWorker"/> is what actually runs them.
/// </summary>
public sealed class ScheduleTools(ScheduleStore store)
{
    public IReadOnlyList<LocalTool> CreateTools() =>
    [
        new LocalTool(
            new McpToolDefinition(
                "list_schedules",
                "登録済みの定期実行を一覧する。追加・変更・削除の前に必ず確認する。",
                Schema("""{ "type": "object", "properties": {} }""")),
            (_, _) => Task.FromResult(List())),

        new LocalTool(
            new McpToolDefinition(
                "create_schedule",
                "定期実行を登録する。頻度・時刻・配信方法・宛先を利用者に確認してから呼ぶこと。"
                + "確認していない項目があるうちは呼ばない。時刻は JST。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "title": { "type": "string", "description": "一覧に出す短い名前。例: 競合ニュースの朝ダイジェスト" },
                        "instruction": {
                          "type": "string",
                          "description": "毎回あなた自身が実行する内容を、あとから読み返しても分かる日本語の指示文で書く。必要な調べ方、出力の長さ、構成まで含める。"
                        },
                        "frequency": {
                          "type": "string",
                          "enum": ["daily", "weekdays", "weekly", "monthly"],
                          "description": "daily=毎日、weekdays=平日のみ、weekly=毎週、monthly=毎月。"
                        },
                        "time": { "type": "string", "description": "JST の 24 時間表記 HH:mm。例: 08:00" },
                        "weekday": {
                          "type": "string",
                          "enum": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
                          "description": "frequency が weekly のときに指定する曜日。"
                        },
                        "day_of_month": { "type": "integer", "description": "frequency が monthly のときの日付 1〜31。" },
                        "channel": {
                          "type": "string",
                          "enum": ["chat", "mail"],
                          "description": "chat=Teams チャットに投稿、mail=メールで送信。"
                        },
                        "recipient": { "type": "string", "description": "配信先のメール アドレス（UPN）。既定は依頼した本人。" },
                        "subject": { "type": "string", "description": "channel が mail のときの件名。省略時は title を使う。" }
                      },
                      "required": ["title", "instruction", "frequency", "time", "channel", "recipient"]
                    }
                    """)),
            (arguments, _) => Task.FromResult(Create(arguments))),

        new LocalTool(
            new McpToolDefinition(
                "delete_schedule",
                "定期実行を削除する。id は list_schedules で確認する。",
                Schema("""
                    {
                      "type": "object",
                      "properties": { "id": { "type": "string", "description": "定期実行の id。" } },
                      "required": ["id"]
                    }
                    """)),
            (arguments, _) => Task.FromResult(Delete(arguments))),

        new LocalTool(
            new McpToolDefinition(
                "run_schedule_now",
                "定期実行を次の周期を待たずに 1 回流す。登録直後の動作確認に使う。"
                + "結果は登録した配信先に届くので、実行する前に利用者に一言確認する。",
                Schema("""
                    {
                      "type": "object",
                      "properties": { "id": { "type": "string", "description": "定期実行の id。" } },
                      "required": ["id"]
                    }
                    """)),
            (arguments, _) => Task.FromResult(RunNow(arguments))),
    ];

    private string List()
    {
        IReadOnlyList<ScheduledJob> jobs = store.All();
        return jobs.Count == 0
            ? "登録されている定期実行はありません。"
            : string.Join("\n", jobs.Select(j => j.Describe()));
    }

    private string Create(JsonElement arguments)
    {
        var job = new ScheduledJob
        {
            Title = ReadString(arguments, "title") ?? string.Empty,
            Instruction = ReadString(arguments, "instruction") ?? string.Empty,
            Frequency = (ReadString(arguments, "frequency") ?? string.Empty).ToLowerInvariant(),
            Time = ReadString(arguments, "time") ?? string.Empty,
            Weekday = ReadString(arguments, "weekday")?.ToLowerInvariant(),
            DayOfMonth = arguments.TryGetProperty("day_of_month", out JsonElement day) && day.TryGetInt32(out int parsed)
                ? parsed
                : null,
            Channel = (ReadString(arguments, "channel") ?? string.Empty).ToLowerInvariant(),
            Recipient = ReadString(arguments, "recipient") ?? string.Empty,
            Subject = ReadString(arguments, "subject"),
        };
        job.RequestedBy = job.Recipient;

        if (ScheduleStore.Validate(job) is { } error)
        {
            return $"ツールがエラーを返しました: {error}";
        }

        ScheduledJob saved = store.Add(job);
        return $"定期実行を登録しました。\n{saved.Describe()}";
    }

    private string Delete(JsonElement arguments) =>
        ReadString(arguments, "id") is { Length: > 0 } id && store.Remove(id)
            ? $"定期実行 {id} を削除しました。"
            : "ツールがエラーを返しました: その id の定期実行は見つかりませんでした。list_schedules で確認してください。";

    private string RunNow(JsonElement arguments)
    {
        if (ReadString(arguments, "id") is not { Length: > 0 } id || !store.RunNow(id))
        {
            return "ツールがエラーを返しました: その id の定期実行は見つかりませんでした。list_schedules で確認してください。";
        }

        return $"定期実行 {id} を次のチェックで 1 回流します。結果は登録した配信先に届きます。";
    }

    private static string? ReadString(JsonElement element, string name) =>
        element.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static JsonElement Schema(string json) => JsonDocument.Parse(json).RootElement.Clone();
}


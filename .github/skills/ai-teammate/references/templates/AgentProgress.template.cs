// 時間のかかるターンで、相手を無言のまま待たせないための仕組み。
//
// エージェントにツールを増やすほど 1 ターンは長くなる。調べもの・資料作り・複数件の処理では
// 数分かかることもあり、その間チャットに何も出ないと「壊れた」と受け取られる。
// ここでは 3 層で埋める。
//
//   1. 入力中インジケーター … ターン中ずっと（自動・5 秒ごと）
//   2. 自動の状況通知       … 一定時間を超えたら、呼ばれているツール名から一言（自動）
//   3. エージェント自身の経過報告 … report_progress ツール（モデルの判断）
//
// 3 だけでは不十分（モデルが呼ばないことがある）、1・2 だけでも不十分（中身が無い）。
// 3 層そろえて初めて「待てる」体験になる。設計判断は references/code-sandbox.md。
//
// 前提となるプロジェクト側の型:
//   LocalTool          … record LocalTool(McpToolDefinition Definition,
//                                         Func<JsonElement, CancellationToken, Task<string>> Invoke)
//   McpToolDefinition  … (Name, Description, InputSchema)
//
// ターン ハンドラー:
//   await using AgentProgress? progress = AgentProgress.ForTurn(turnContext, configuration, logger);
//   progress?.Start(cancellationToken);
//   McpToolset toolset = await brain.ConnectToolsAsync(..., progress: progress);
//   try     { reply = await brain.CompleteAsync(..., progress); }
//   finally { toolset.Dispose(); if (progress is not null) await progress.StopAsync(); }
//   await turnContext.SendActivityAsync(reply, cancellationToken: cancellationToken);
//
// ツール ループ側（1 ラウンドに 1 回）:
//   await progress.StepAsync(completion.ToolCalls.Select(call => call.FunctionName), cancellationToken);
//
// アプリ設定（__ が階層区切り）:
//   Agent__Progress__Enabled          = true
//   Agent__Progress__FirstNoteSeconds = 25
//   Agent__Progress__IntervalSeconds  = 45
//   Agent__Progress__TypingSeconds    = 5
//
// 注意: 待っている相手がいない経路（メール自動処理・定期実行）では使わない。通知先が無い。

using System.Text.Json;
using Microsoft.Agents.Builder;
using Microsoft.Agents.Core.Models;

public sealed class AgentProgress : IAsyncDisposable
{
    private const int MaxNotes = 8;

    // First match wins, so the specific tools are listed before the generic word fragments.
    private static readonly (string Match, string Label)[] Labels =
    [
        ("run_python", "コードを書いて動かしています"),
        ("import_file", "ファイルを取り込んでいます"),
        ("deliver_file", "できたファイルをお渡しする準備をしています"),
        ("design_guide", "資料のデザインを確認しています"),
        ("workspace", "作業環境の中を確認しています"),
        ("skill", "作業手順書を読んでいます"),
        ("teams_chat", "Teams のやり取りを確認しています"),
        ("schedule", "定期実行の設定を確認しています"),
        ("search", "Web で調べています"),
        ("fetch_url", "Web ページを読んでいます"),
        ("mail", "メールを確認しています"),
        ("event", "予定表を確認しています"),
        ("calendar", "予定表を確認しています"),
        ("meeting", "予定表を確認しています"),
        ("record", "社内データを照会しています"),
        ("table", "社内データを照会しています"),
        ("query", "社内データを照会しています"),
    ];

    private readonly Func<IActivity, CancellationToken, Task> _send;
    private readonly TimeSpan _firstNote;
    private readonly TimeSpan _interval;
    private readonly TimeSpan _typingInterval;
    private readonly ILogger _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly CancellationTokenSource _stop = new();
    private readonly DateTimeOffset _started = DateTimeOffset.UtcNow;

    private Task? _heartbeat;
    private DateTimeOffset _lastNote = DateTimeOffset.MinValue;
    private int _notes;

    private AgentProgress(
        Func<IActivity, CancellationToken, Task> send,
        TimeSpan firstNote,
        TimeSpan interval,
        TimeSpan typingInterval,
        ILogger logger)
    {
        _send = send;
        _firstNote = firstNote;
        _interval = interval;
        _typingInterval = typingInterval;
        _logger = logger;
    }

    /// <summary>Interim updates only make sense where someone is waiting, so this is chat-only.</summary>
    public static AgentProgress? ForTurn(ITurnContext turnContext, IConfiguration configuration, ILogger logger)
    {
        if (!configuration.GetValue("Agent:Progress:Enabled", true))
        {
            return null;
        }

        return new AgentProgress(
            (activity, cancellationToken) => turnContext.SendActivityAsync(activity, cancellationToken),
            TimeSpan.FromSeconds(configuration.GetValue("Agent:Progress:FirstNoteSeconds", 25)),
            TimeSpan.FromSeconds(configuration.GetValue("Agent:Progress:IntervalSeconds", 45)),
            TimeSpan.FromSeconds(configuration.GetValue("Agent:Progress:TypingSeconds", 5)),
            logger);
    }

    public void Start(CancellationToken cancellationToken) =>
        _heartbeat = Task.Run(() => TypeAsync(cancellationToken), CancellationToken.None);

    /// <summary>Called once per tool round so silence never runs longer than the interval.</summary>
    public async Task StepAsync(IEnumerable<string> toolNames, CancellationToken cancellationToken)
    {
        IReadOnlyList<string> tools = toolNames as IReadOnlyList<string> ?? toolNames.ToList();

        // The agent is about to say it in its own words; a generated line on top would just repeat it.
        if (tools.Any(name => string.Equals(name, "report_progress", StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }

        DateTimeOffset now = DateTimeOffset.UtcNow;
        if (now - _started < _firstNote || now - _lastNote < _interval || _notes >= MaxNotes)
        {
            return;
        }

        _lastNote = now;
        string label = Label(tools);
        string note = _notes++ == 0
            ? $"{label}。もう少しお待ちください。"
            : $"{label}（{Elapsed(now - _started)}）";

        await SendAsync(MessageFactory.Text(note), cancellationToken);
    }

    public IReadOnlyList<LocalTool> CreateTools() =>
    [
        new LocalTool(
            new McpToolDefinition(
                "report_progress",
                "作業の途中経過を相手にその場で伝える。返信を返す前に届くので、"
                + "時間のかかる仕事（調べもの、資料作り、複数件の処理）では区切りごとに呼ぶこと。"
                + "「着手した」「3 件中 2 件終わった」「思ったより時間がかかる」など、状況が変わったときに使う。"
                + "最終的な回答はこれとは別に返すこと。これで代用しない。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "message": {
                          "type": "string",
                          "description": "いまの状況を 1〜2 文で。何が終わって次に何をするかを書く。あいさつや前置きは要らない。"
                        }
                      },
                      "required": ["message"]
                    }
                    """)),
            ReportAsync),
    ];

    public async Task StopAsync()
    {
        if (!_stop.IsCancellationRequested)
        {
            await _stop.CancelAsync();
        }

        if (_heartbeat is not null)
        {
            try
            {
                await _heartbeat;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Typing indicator loop ended unexpectedly");
            }

            _heartbeat = null;
        }
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync();
        _stop.Dispose();
        _gate.Dispose();
    }

    private async Task<string> ReportAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        string message = arguments.TryGetProperty("message", out JsonElement value)
            ? value.GetString()?.Trim() ?? string.Empty
            : string.Empty;

        if (message.Length == 0)
        {
            return "message が空です。いまの状況を 1〜2 文で書いて呼び直すこと。";
        }

        if (_notes >= MaxNotes)
        {
            return "経過連絡はこれ以上送りません。作業を進めて、結果は最後の返信にまとめること。";
        }

        _lastNote = DateTimeOffset.UtcNow;
        _notes++;
        await SendAsync(MessageFactory.Text(message), cancellationToken);
        return "経過を伝えました。作業を続けること。結果は最後の返信で改めてまとめること。";
    }

    private async Task TypeAsync(CancellationToken cancellationToken)
    {
        using CancellationTokenSource linked =
            CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _stop.Token);

        try
        {
            while (!linked.IsCancellationRequested)
            {
                await SendAsync(new Activity { Type = ActivityTypes.Typing }, linked.Token);
                await Task.Delay(_typingInterval, linked.Token);
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    /// <summary>A dropped progress update must never take the turn down with it.</summary>
    private async Task SendAsync(IActivity activity, CancellationToken cancellationToken)
    {
        try
        {
            await _gate.WaitAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        try
        {
            await _send(activity, cancellationToken);
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Progress update could not be delivered");
        }
        finally
        {
            _gate.Release();
        }
    }

    private static string Label(IEnumerable<string> toolNames)
    {
        foreach (string toolName in toolNames)
        {
            foreach ((string match, string label) in Labels)
            {
                if (toolName.Contains(match, StringComparison.OrdinalIgnoreCase))
                {
                    return label;
                }
            }
        }

        return "調べものを進めています";
    }

    private static string Elapsed(TimeSpan span) =>
        span.TotalMinutes < 1
            ? $"{(int)span.TotalSeconds} 秒経過"
            : $"{(int)span.TotalMinutes} 分経過";

    private static JsonElement Schema(string json) => JsonDocument.Parse(json).RootElement.Clone();
}

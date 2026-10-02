using System.Windows.Media;

namespace CoworkStudio.Core;

public enum StepState { Unknown, Pending, Running, Done, Warning, Error, Manual }

/// <summary>タイムラインの 1 クリップ（Cowork プラグインを公開するまでの 1 工程）。</summary>
public sealed class StepModel
{
    public required int Index { get; init; }
    public required string Id { get; init; }
    public required string Title { get; init; }
    public required string Track { get; init; }
    public required string TrackName { get; init; }
    public required Color Label { get; init; }
    public required string Description { get; init; }
    public StepState State { get; set; } = StepState.Unknown;
    public string Detail { get; set; } = "";
    public DateTime? CheckedAt { get; set; }
    public List<string> LastOutput { get; set; } = new();
}

/// <summary>dry-run で得た、承認待ちの変更。</summary>
public sealed class PendingPlan
{
    public required string StepId { get; init; }
    public required string Kind { get; init; }
    public required string Script { get; init; }
    public required string[] Args { get; init; }
    public required string Hash { get; init; }
    public required string Text { get; init; }
    public required string Summary { get; init; }
    public DateTime CreatedAt { get; } = DateTime.Now;
}

public static class Pipeline
{
    // Adobe のラベル色に近い配色（バイオレット・アイリス・カリビアン・セルリアン・マンゴー・フォレスト・ローズ）
    public static List<StepModel> Create() => new()
    {
        new() { Index = 0, Id = "entra", Title = "Entra OAuth アプリ", Track = "V4", TrackName = "Entra", Label = C("#8E7CC3"),
            Description = "Cowork が Dataverse MCP に OAuth で接続するための Entra アプリ（クライアント ID・シークレット・リダイレクト URI）。" },
        new() { Index = 1, Id = "consent", Title = "管理者の同意", Track = "V3", TrackName = "同意", Label = C("#5B7FD1"),
            Description = "mcp.tools への委任アクセス許可に、テナントの管理者が事前同意しているか。クラウド アプリケーション管理者・アプリケーション管理者・AI 管理者が付与できる。" },
        new() { Index = 2, Id = "mcp", Title = "MCP クライアント許可", Track = "V2", TrackName = "MCP 許可", Label = C("#1BA592"),
            Description = "Dataverse 環境の allowedmcpclients に Entra アプリを登録して有効にする。" },
        new() { Index = 3, Id = "oauth", Title = "OAuth 登録", Track = "V1", TrackName = "OAuth", Label = C("#2C97C9"),
            Description = "Teams 開発者ポータルの OAuth client registration。ID は manifest の referenceId になる（Agents Toolkit のクライアントで CLI から作る）。" },
        new() { Index = 4, Id = "build", Title = "パッケージ", Track = "A1", TrackName = "ビルド", Label = C("#D9852F"),
            Description = "referenceId を注入して ZIP を作る（manifest.json を ZIP のルートに置く）。" },
        new() { Index = 5, Id = "personal", Title = "個人インストール", Track = "A2", TrackName = "個人", Label = C("#3F9454"),
            Description = "作成者だけにインストールし、Cowork の Customize → Plugins で有効化して動作を確かめる。" },
        new() { Index = 6, Id = "publish", Title = "組織に公開", Track = "A3", TrackName = "公開", Label = C("#C95A7E"),
            Description = "M365 管理センターで組織に公開する（AI 管理者）。管理センターの画面のセッションが必要なため、ブラウザで行う。" },
    };

    private static Color C(string hex) => (Color)ColorConverter.ConvertFromString(hex);

    public static string StateText(StepState s) => s switch
    {
        StepState.Done => "完了",
        StepState.Pending => "未実施",
        StepState.Running => "実行中",
        StepState.Warning => "要確認",
        StepState.Error => "エラー",
        StepState.Manual => "手動",
        _ => "未確認",
    };
}

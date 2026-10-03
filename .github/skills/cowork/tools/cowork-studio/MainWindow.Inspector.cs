using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using CoworkStudio.Core;

namespace CoworkStudio;

public partial class MainWindow
{
    private readonly Dictionary<string, string> _fieldValues = new();

    private void ClearInspector() => InspectorHost.Children.Clear();

    private void Add(UIElement e) => InspectorHost.Children.Add(e);

    private FrameworkElement InspectorHeader(string glyph, Color accent, string kicker, string title, Border? badge = null)
    {
        var grid = new Grid { Margin = new Thickness(0, 0, 0, 4) };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var tile = new Border
        {
            Width = 38,
            Height = 38,
            CornerRadius = new CornerRadius(6),
            Background = new SolidColorBrush(Color.FromArgb(0x30, accent.R, accent.G, accent.B)),
            BorderBrush = new SolidColorBrush(Color.FromArgb(0x90, accent.R, accent.G, accent.B)),
            BorderThickness = new Thickness(1),
            Child = new TextBlock { Text = glyph, FontFamily = Ui.F("IconFont"), FontSize = 16, Foreground = new SolidColorBrush(accent), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
        };
        grid.Children.Add(tile);
        var sp = new StackPanel { Margin = new Thickness(12, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center };
        sp.Children.Add(Ui.T(kicker, 10.5, "TextFaint", FontWeights.SemiBold, mono: true));
        sp.Children.Add(Ui.T(title, 16, "TextBright", FontWeights.SemiBold));
        Grid.SetColumn(sp, 1);
        grid.Children.Add(sp);
        if (badge != null)
        {
            Grid.SetColumn(badge, 2);
            grid.Children.Add(badge);
        }
        return grid;
    }

    // ---------------------------------------------------------------- manifest（デザイナー）

    private void BuildInspectorForFile(ProjectFile f)
    {
        ClearInspector();
        if (_plugin == null || _env == null) return;
        if (f.Kind == FileKind.Manifest) { BuildManifestInspector(); return; }

        var (glyph, label) = f.Kind switch
        {
            FileKind.Skill => ("\uE8A5", "SKILL"),
            FileKind.ToolsJson => ("\uE90F", "MCP TOOLS"),
            FileKind.Icon => ("\uEB9F", "ICON"),
            _ => ("\uE8A5", "FILE"),
        };
        Add(InspectorHeader(glyph, ((SolidColorBrush)Ui.B("Accent")).Color, label, Path.GetFileName(Path.GetDirectoryName(f.FullPath) is { } d && f.Kind == FileKind.Skill ? d : f.FullPath)));
        var info = new FileInfo(f.FullPath);
        Add(Ui.Section("ファイル", "\uE8B7"));
        Add(Prop("パス", f.RelPath, mono: true));
        Add(Prop("サイズ", info.Exists ? $"{info.Length:N0} バイト" : "-"));
        Add(Prop("更新", info.Exists ? info.LastWriteTime.ToString("yyyy/MM/dd HH:mm:ss") : "-"));

        if (f.Kind == FileKind.Icon)
        {
            var size = PluginProject.ImageSize(f.FullPath);
            var expected = Path.GetFileName(f.FullPath).StartsWith("outline", StringComparison.OrdinalIgnoreCase) ? 32 : 192;
            Add(Prop("寸法", size is { } s ? $"{s.W} × {s.H}" : "?"));
            Add(Ui.IssueRow(size is { } z && z.W == expected && z.H == expected
                ? new Issue(IssueLevel.Ok, $"{expected}×{expected} の要件を満たしています")
                : new Issue(IssueLevel.Error, $"{expected}×{expected} にしてください")));
        }
        if (f.Kind == FileKind.Skill)
        {
            var fm = PluginProject.FrontMatter(File.ReadAllText(f.FullPath));
            Add(Ui.Section("frontmatter", "\uE8EC"));
            foreach (var kv in fm) Add(Prop(kv.Key, kv.Value, wrap: true));
            var folder = Path.GetFileName(Path.GetDirectoryName(f.FullPath)!);
            Add(Ui.IssueRow(fm.TryGetValue("name", out var n) && n == folder
                ? new Issue(IssueLevel.Ok, "name がフォルダ名と一致")
                : new Issue(IssueLevel.Warn, $"name をフォルダ名（{folder}）に合わせる")));
            var lines = File.ReadAllLines(f.FullPath).Length;
            Add(Prop("行数", lines.ToString()));
        }
        if (f.IsText)
        {
            Add(Ui.Section("操作", "\uE70F"));
            Add(Ui.Row(Ui.Btn("ソースで編集", (_, _) => TopLeftTabs.SelectedItem = SourceTab, "\uE70F"),
                Ui.Btn("エクスプローラーで表示", (_, _) => RevealFile(f.FullPath), "\uEC50")));
        }
    }

    private FrameworkElement Prop(string label, string value, bool mono = false, bool wrap = false)
    {
        var g = new Grid { Margin = new Thickness(0, 0, 0, 6) };
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(96) });
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        g.Children.Add(Ui.T(label, 12, "TextDim"));
        var v = Ui.T(value, 12, "Text", wrap: wrap, mono: mono);
        v.ToolTip = value;
        Grid.SetColumn(v, 1);
        g.Children.Add(v);
        return g;
    }

    private StackPanel? _issuesHost;

    private void BuildManifestInspector()
    {
        var p = _plugin!;
        ClearInspector();
        Add(InspectorHeader("\uE943", ((SolidColorBrush)Ui.B("Accent")).Color, "MANIFEST", p.ShortName,
            _manifestDirty ? Ui.Badge(StepState.Warning) : null));
        if (p.Manifest == null)
        {
            Add(Ui.IssueRow(new Issue(IssueLevel.Error, $"manifest.json を読めません: {p.LoadError}")));
            Add(Ui.Btn("ソースで直す", (_, _) => TopLeftTabs.SelectedItem = SourceTab, "\uE70F"));
            return;
        }

        void Bind(TextBox box, string path)
        {
            box.TextChanged += (_, _) =>
            {
                if (p.Get(path) == box.Text) return;
                p.Set(path, box.Text);
                MarkManifestDirty();
            };
        }

        Add(Ui.Section("基本", "\uE8EC"));
        var shortName = Ui.Field("短い名前", p.Get("name.short"), 30);
        Bind(shortName.Box, "name.short");
        Add(shortName.Root);
        var fullName = Ui.Field("正式名", p.Get("name.full"), 100);
        Bind(fullName.Box, "name.full");
        Add(fullName.Root);

        var version = Ui.Field("バージョン", p.Version, mono: true);
        Bind(version.Box, "version");
        var bump = Ui.Btn("+0.0.1", (_, _) => version.Box.Text = PluginProject.BumpPatch(version.Box.Text), tip: "パッチ番号を上げる（再公開の前に）");
        bump.Margin = new Thickness(6, 0, 0, 0);
        bump.MinHeight = 24;
        var vStack = (StackPanel)((Grid)version.Root).Children[1];
        var vRow = new DockPanel();
        vStack.Children.Remove(version.Box);
        DockPanel.SetDock(bump, Dock.Right);
        vRow.Children.Add(bump);
        vRow.Children.Add(version.Box);
        vStack.Children.Insert(0, vRow);
        Add(version.Root);

        var dev = Ui.Field("開発者", p.Get("developer.name"), 32);
        Bind(dev.Box, "developer.name");
        Add(dev.Root);

        var accent = Ui.Field("アクセント", p.Get("accentColor"), mono: true);
        Bind(accent.Box, "accentColor");
        var swatch = new Border { Width = 24, Height = 24, CornerRadius = new CornerRadius(3), BorderBrush = Ui.B("LineHi"), BorderThickness = new Thickness(1), Margin = new Thickness(6, 0, 0, 0) };
        void Paint()
        {
            try { swatch.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(accent.Box.Text)); }
            catch { swatch.Background = Brushes.Transparent; }
        }
        accent.Box.TextChanged += (_, _) => Paint();
        Paint();
        var aStack = (StackPanel)((Grid)accent.Root).Children[1];
        var aRow = new DockPanel();
        aStack.Children.Remove(accent.Box);
        DockPanel.SetDock(swatch, Dock.Right);
        aRow.Children.Add(swatch);
        aRow.Children.Add(accent.Box);
        aStack.Children.Insert(0, aRow);
        Add(accent.Root);

        Add(Ui.Section("説明", "\uE8BD"));
        var sd = Ui.Field("短い説明", p.Get("description.short"), 80, multi: true);
        sd.Box.Height = 52;
        Bind(sd.Box, "description.short");
        Add(sd.Root);
        var fd = Ui.Field("詳しい説明", p.Get("description.full"), 4000, multi: true);
        fd.Box.Height = 130;
        Bind(fd.Box, "description.full");
        Add(fd.Root);

        Add(Ui.Row(
            Ui.Btn("保存", (_, _) => SaveManifest(), "\uE74E", "Primary", "Ctrl+S"),
            Ui.Btn("元に戻す", (_, _) => { p.Load(); _manifestDirty = false; BuildManifestInspector(); ShowProgramForFile(_selectedFile!); }, "\uE7A7"),
            Ui.Btn("ソース", (_, _) => TopLeftTabs.SelectedItem = SourceTab, "\uE943")));

        Add(Ui.Section("スキルとコネクタ", "\uE8A5"));
        foreach (var folder in p.SkillFolders()) Add(Prop("スキル", folder, mono: true));
        foreach (var c in p.Connectors())
        {
            var url = c["toolSource"]?["remoteMcpServer"]?["mcpServerUrl"]?.GetValue<string>() ?? "";
            Add(Prop("コネクタ", $"{c["displayName"]} — {url}", wrap: true));
        }

        Add(Ui.Section("検証", "\uE9D5"));
        _issuesHost = new StackPanel();
        Add(_issuesHost);
        RenderIssues();
    }

    private void RenderIssues()
    {
        if (_issuesHost == null || _plugin == null || _env == null) return;
        _issuesHost.Children.Clear();
        var issues = _plugin.Validate(_env).OrderBy(i => i.Level == IssueLevel.Error ? 0 : i.Level == IssueLevel.Warn ? 1 : 2).ToList();
        var e = issues.Count(i => i.Level == IssueLevel.Error);
        var w = issues.Count(i => i.Level == IssueLevel.Warn);
        _issuesHost.Children.Add(Ui.T(e + w == 0 ? "問題はありません" : $"エラー {e} · 警告 {w}", 12, e > 0 ? "Danger" : w > 0 ? "Warn" : "Ok", FontWeights.SemiBold, margin: new Thickness(0, 0, 0, 8)));
        foreach (var i in issues) _issuesHost.Children.Add(Ui.IssueRow(i));
    }

    private void MarkManifestDirty()
    {
        _manifestDirty = true;
        RenderIssues();
        if (_selectedFile?.Kind == FileKind.Manifest) ShowManifestPreview();
        SetStatus("manifest に保存していない変更があります（Ctrl+S）");
    }

    private void SaveManifest()
    {
        if (_plugin?.Manifest == null) return;
        _plugin.Save();
        _manifestDirty = false;
        Log($"manifest.json を保存しました（v{_plugin.Version}）", LogKind.Ok);
        SetStatus("manifest.json を保存しました");
        if (_sourcePath == _plugin.ManifestPath) LoadSource(_sourcePath);
        EvaluateLocal();
        RenderTimeline();
        if (_selectedFile?.Kind == FileKind.Manifest) BuildManifestInspector();
        RefreshPluginRow();
    }

    private void RefreshPluginRow()
    {
        if (PluginList.SelectedItem is ListBoxItem item && _plugin != null && _root != null) item.Content = PluginRow(_plugin, _root);
    }

    // ---------------------------------------------------------------- ステップ

    private void BuildInspectorForStep(StepModel s)
    {
        ClearInspector();
        if (_plugin == null || _env == null) return;
        Add(InspectorHeader(StepGlyph(s.Id), s.Label, $"STEP {s.Index + 1:00} / {_steps.Count:00} · {s.Track}", s.Title, Ui.Badge(s.State)));
        Add(Ui.T(s.Description, 12, "TextDim", wrap: true, margin: new Thickness(0, 8, 0, 0)));

        Add(Ui.Section("状態", "\uE9D9"));
        Add(new Border
        {
            Background = Ui.B("Field"),
            BorderBrush = Ui.B("Line"),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(3),
            Padding = new Thickness(10, 8, 10, 8),
            Child = Ui.T(s.Detail.Length > 0 ? s.Detail : "—", 12, "Text", wrap: true),
        });
        if (s.CheckedAt != null) Add(Ui.T($"確認 {s.CheckedAt:HH:mm:ss}", 10.5, "TextFaint", margin: new Thickness(0, 4, 0, 0)));

        switch (s.Id)
        {
            case "entra":
                Add(Ui.Section("パラメーター", "\uE713"));
                var appName = StepField("entra.name", "表示名", $"{_plugin.ShortName} Cowork OAuth");
                Add(Ui.Section("操作", "\uE768"));
                var clientId = _env.Get("COWORK_OAUTH_CLIENT_ID");
                Add(Ui.Row(
                    Ui.Btn("診断", async (_, _) => { await DiagnoseAsync(); RefreshStepViews(s); }, "\uE9D9", "Primary"),
                    Ui.Btn("作成…", async (_, _) => await CreateEntraAppAsync(appName()), "\uE710"),
                    Ui.Btn("Entra で開く", (_, _) => OpenUrl($"https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Overview/appId/{clientId}"), "\uE8A7", enabled: clientId.Length > 0)));
                break;
            case "consent":
                Add(Ui.Section("操作", "\uE768"));
                var cid = _env.Get("COWORK_OAUTH_CLIENT_ID");
                Add(Ui.Row(
                    Ui.Btn("診断", async (_, _) => { await DiagnoseAsync(); RefreshStepViews(s); }, "\uE9D9", "Primary"),
                    Ui.Btn("API のアクセス許可を開く", (_, _) => OpenUrl($"https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/{cid}"), "\uE8A7", enabled: cid.Length > 0)));
                Add(Ui.T("同意はクラウド アプリケーション管理者・アプリケーション管理者・AI 管理者が「管理者の同意を与えます」で付与する（全体管理者は不要）。", 11.5, "TextFaint", wrap: true, margin: new Thickness(0, 4, 0, 0)));
                break;
            case "mcp":
                Add(Ui.Section("パラメーター", "\uE713"));
                var mcpName = StepField("mcp.name", "表示名", _plugin.ShortName);
                Add(Ui.Section("操作", "\uE768"));
                Add(Ui.Row(
                    Ui.Btn("診断", async (_, _) => { await DiagnoseAsync(); RefreshStepViews(s); }, "\uE9D9", "Primary"),
                    Ui.Btn("登録…", async (_, _) => await RegisterMcpClientAsync(mcpName()), "\uE710"),
                    Ui.Btn("一覧", async (_, _) => await RunPy("allowedmcpclients の一覧", Scripts + "register_mcp_client.py", new[] { "--list" }, s), "\uE8FD")));
                break;
            case "oauth":
                Add(Ui.Section("パラメーター", "\uE713"));
                StepField("oauth.name", "登録名", OAuthName);
                StepField("oauth.base", "Base URL", OAuthBase, mono: true);
                StepField("oauth.scopes", "スコープ", OAuthScopes, mono: true);
                Add(Ui.Section("操作", "\uE768"));
                Add(Ui.Row(
                    Ui.Btn("計画を作る", async (_, _) => await PlanOAuthAsync(), "\uE9D5", "Primary", "dry-run。同じクライアント ID・Base URL の登録があれば止まる"),
                    Ui.Btn("一覧", async (_, _) => { await CheckOAuthListAsync(); RefreshStepViews(s); }, "\uE8FD")));
                Add(Ui.T("Agents Toolkit のクライアントで送ります。初回だけサインイン（デバイス コード）の画面が出ます。", 11.5, "TextFaint", wrap: true, margin: new Thickness(0, 4, 0, 0)));
                break;
            case "build":
                Add(Ui.Section("パラメーター", "\uE713"));
                StepField("build.name", "出力名", OutputName, mono: true);
                var zip = _plugin.LatestZip();
                Add(Ui.Section("操作", "\uE768"));
                Add(Ui.Row(
                    Ui.Btn("ビルド", async (_, _) => await BuildAsync(), "\uE7B8", "Primary", "Ctrl+Enter"),
                    Ui.Btn("ZIP を表示", (_, _) => { if (zip != null) RevealFile(zip.FullName); }, "\uEC50", enabled: zip != null),
                    Ui.Btn("書き出しキューへ", (_, _) => { OnQuickExport(this, new RoutedEventArgs()); }, "\uEDE1")));
                if (zip != null)
                {
                    Add(Ui.Section("ZIP", "\uE7B8"));
                    foreach (var i in PluginProject.InspectZip(zip.FullName)) Add(Ui.IssueRow(i));
                }
                break;
            case "personal":
                var pz = _plugin.LatestZip();
                Add(Ui.Section("パッケージ", "\uE7B8"));
                Add(Prop("ZIP", pz?.Name ?? "（なし）", mono: true));
                Add(Prop("titleId", _state.PersonalTitleId ?? "—", mono: true));
                Add(Ui.Section("操作", "\uE768"));
                Add(Ui.Row(
                    Ui.Btn("インストールの計画", async (_, _) => await PlanInstallAsync(), "\uE896", "Primary", enabled: pz != null),
                    Ui.Btn("状態を確認", async (_, _) => { await PersonalStatusAsync(); EvaluateLocal(); RefreshStepViews(s); }, "\uE9D9", enabled: _state.PersonalTitleId != null),
                    Ui.Btn("アンインストールの計画", async (_, _) => await PlanUninstallAsync(), "\uE74D", enabled: _state.PersonalTitleId != null)));
                Add(Ui.T("インストール後、Cowork の Customize → Plugins で有効にし、Connect で同意します。", 11.5, "TextFaint", wrap: true, margin: new Thickness(0, 4, 0, 0)));
                if (_state.PersonalTitleId == null)
                {
                    Add(Ui.Section("既にインストール済みなら", "\uE71B"));
                    var tid = StepField("personal.title", "titleId", "", mono: true);
                    Add(Ui.Row(Ui.Btn("この titleId を取り込む", async (_, _) =>
                    {
                        var v = tid().Trim();
                        if (!v.StartsWith("U_") && !v.StartsWith("T_")) { StudioDialog.Info(this, "titleId の形式", "U_ または T_ で始まる titleId を入れてください（install の出力にあります）。"); return; }
                        _state.PersonalTitleId = v;
                        _state.InstalledVersion = null;
                        SaveState();
                        await PersonalStatusAsync();
                        EvaluateLocal();
                        RefreshStepViews(s);
                    }, "\uE896", tip: "CLI で入れたインストールの状態をこの画面で追えるようにする")));
                }
                break;
            case "publish":
                Add(Ui.Section("操作", "\uE768"));
                var lz = _plugin.LatestZip();
                Add(Ui.Row(
                    Ui.Btn("管理センターを開く", (_, _) => OpenUrl("https://admin.cloud.microsoft/#/agents/tools/all"), "\uE8A7", "Primary"),
                    Ui.Btn("ZIP を表示", (_, _) => { if (lz != null) RevealFile(lz.FullName); }, "\uEC50", enabled: lz != null)));
                Add(Ui.Row(_state.Published
                    ? Ui.Btn("未公開に戻す", (_, _) => MarkPublished(false), "\uE7A7")
                    : Ui.Btn($"v{_plugin.Version} を公開済みにする", (_, _) => MarkPublished(true), "\uE73E")));
                Add(Ui.T("組織への公開は管理センターの画面のセッションが必要です。AI 管理者が ZIP をアップロードし、公開先（最初は検証ユーザー）を選びます。", 11.5, "TextFaint", wrap: true, margin: new Thickness(0, 4, 0, 0)));
                break;
        }

        if (_plan?.StepId == s.Id) Add(PlanCard(_plan));

        if (s.LastOutput.Count > 0)
        {
            Add(Ui.Section("最後の出力", "\uE756"));
            Add(new Border
            {
                Background = Ui.B("Field"),
                BorderBrush = Ui.B("Line"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(3),
                Padding = new Thickness(8, 6, 8, 6),
                Child = Ui.T(string.Join("\n", s.LastOutput), 11, "TextDim", wrap: true, mono: true),
            });
        }
    }

    private FrameworkElement PlanCard(PendingPlan plan)
    {
        var sp = new StackPanel();
        sp.Children.Add(Ui.T("承認待ちの計画", 12.5, "TextBright", FontWeights.SemiBold));
        sp.Children.Add(Ui.T(plan.Summary, 12, "Text", wrap: true, margin: new Thickness(0, 4, 0, 6)));
        sp.Children.Add(Ui.T($"PLAN_HASH  {plan.Hash[..16]}…", 11.5, "Accent", mono: true));
        sp.Children.Add(Ui.T($"作成 {plan.CreatedAt:HH:mm:ss}・内容はプログラム モニターに表示", 10.5, "TextFaint", margin: new Thickness(0, 2, 0, 10)));
        sp.Children.Add(Ui.Row(
            Ui.Btn("承認して実行", async (_, _) => await ApplyPlanAsync(), "\uE73E", "GoButton", "Ctrl+Enter"),
            Ui.Btn("破棄", (_, _) => DiscardPlan(), "\uE711")));
        return new Border
        {
            Margin = new Thickness(0, 16, 0, 0),
            Padding = new Thickness(12, 10, 12, 6),
            CornerRadius = new CornerRadius(4),
            Background = Ui.Hex("#15283D"),
            BorderBrush = Ui.B("Accent"),
            BorderThickness = new Thickness(1),
            Child = sp,
        };
    }

    /// <summary>ステップのパラメーター入力欄。値は選び直しても保持する。</summary>
    private Func<string> StepField(string key, string label, string fallback, bool mono = false)
    {
        var value = _fieldValues.TryGetValue(key, out var v) && v.Length > 0 ? v : fallback;
        var f = Ui.Field(label, value, mono: mono);
        f.Box.TextChanged += (_, _) => _fieldValues[key] = f.Box.Text;
        Add(f.Root);
        return () => f.Box.Text;
    }

    private static string StepGlyph(string id) => id switch
    {
        "entra" => "\uE72E",
        "consent" => "\uEA18",
        "mcp" => "\uE968",
        "oauth" => "\uE71B",
        "build" => "\uE7B8",
        "personal" => "\uE77B",
        _ => "\uE753",
    };

    // ---------------------------------------------------------------- 出力

    private void BuildInspectorForExport()
    {
        ClearInspector();
        Add(InspectorHeader("\uEDE1", ((SolidColorBrush)Ui.B("Go")).Color, "EXPORT", "書き出し"));
        Add(Ui.T("左下の出力キューでプリセットを選び、キューに追加して開始します。パッケージは ZIP を作ったあと、manifest がルートにあるか・referenceId が注入されたかを検査します。", 12, "TextDim", wrap: true, margin: new Thickness(0, 8, 0, 0)));
        Add(Ui.Section("プリセット", "\uE8FD"));
        foreach (var p in Presets)
        {
            var dp = new DockPanel { Margin = new Thickness(0, 0, 0, 8) };
            var ic = Ui.Icon(p.Glyph, 14, "Accent");
            ic.Margin = new Thickness(0, 1, 10, 0);
            ic.VerticalAlignment = VerticalAlignment.Top;
            DockPanel.SetDock(ic, Dock.Left);
            dp.Children.Add(ic);
            var sp = new StackPanel();
            sp.Children.Add(Ui.T(p.Title, 12.5, "TextBright", FontWeights.SemiBold));
            sp.Children.Add(Ui.T(p.Description, 11.5, "TextDim", wrap: true));
            dp.Children.Add(sp);
            Add(dp);
        }
        if (_plugin != null && _env != null)
        {
            Add(Ui.Section("書き出し前の検証", "\uE9D5"));
            var issues = _plugin.Validate(_env).Where(i => i.Level != IssueLevel.Ok).ToList();
            if (issues.Count == 0) Add(Ui.IssueRow(new Issue(IssueLevel.Ok, "エラー・警告はありません")));
            foreach (var i in issues) Add(Ui.IssueRow(i));
        }
    }
}

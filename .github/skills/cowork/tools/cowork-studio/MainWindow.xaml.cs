using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using CoworkStudio.Core;
using Microsoft.Win32;

namespace CoworkStudio;

public partial class MainWindow : Window
{
    private string? _root;
    private EnvFile? _env;
    private PluginProject? _plugin;
    private PluginState _state = new();
    private List<StepModel> _steps = Pipeline.Create();
    private StepModel? _selectedStep;
    private ProjectFile? _selectedFile;
    private PendingPlan? _plan;
    private bool _manifestDirty;
    private bool _loadingPlugin;

    public MainWindow()
    {
        InitializeComponent();
        InitConsole();
        InitTimeline();
        InitQueue();
        Width = App.Options.Width;
        Height = App.Options.Height;
        if (!App.Options.Unattended)
        {
            // 表示倍率が高い画面でもはみ出さないよう、作業領域に収める
            var wa = SystemParameters.WorkArea;
            MinWidth = Math.Min(MinWidth, wa.Width);
            MinHeight = Math.Min(MinHeight, wa.Height);
            Width = Math.Min(Width, wa.Width * 0.95);
            Height = Math.Min(Height, wa.Height * 0.95);
        }
        StateChanged += (_, _) =>
        {
            RootBorder.Padding = WindowState == WindowState.Maximized ? new Thickness(7) : new Thickness(0);
            MaxButton.Content = WindowState == WindowState.Maximized ? "\uE923" : "\uE922";
        };
        PreviewKeyDown += OnShortcut;
        Loaded += OnLoaded;
        Closing += OnClosingWindow;
    }

    // ---------------------------------------------------------------- 起動

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        var root = WorkspaceLocator.FindRoot(App.Options.Root);
        if (root == null && !App.Options.Unattended) root = PickRoot();
        if (root == null)
        {
            SetStatus("cowork スキル（.github/skills/cowork）のあるフォルダを開いてください（左上のフォルダ ボタン）");
            ShowEmptyProgram("ルート フォルダが未選択です", "リポジトリのルート（.github/skills/cowork を含むフォルダ）を開くと、プラグインを自動で見つけます。");
            SelectWorkspace(App.Options.Workspace);
            if (App.Options.Unattended) await FinishUnattended();
            return;
        }
        LoadRoot(root, App.Options.Plugin);
        SelectWorkspace(App.Options.Workspace);
        ApplyInitialSelection(App.Options.Select);
        if (!App.Options.NoRefresh && _plugin != null) await RefreshAllAsync();
        ApplyInitialSelection(App.Options.Select);
        if (App.Options.Export != null) await ExportFromCommandLineAsync(App.Options.Export);
        if (App.Options.Unattended) await FinishUnattended();
    }

    private string? PickRoot()
    {
        var dlg = new OpenFolderDialog { Title = "リポジトリのルート（.github/skills/cowork を含むフォルダ）を選ぶ" };
        while (dlg.ShowDialog(this) == true)
        {
            var found = WorkspaceLocator.FindRoot(dlg.FolderName);
            if (found != null) return found;
            StudioDialog.Info(this, "フォルダが違います", "選んだフォルダ（またはその上）に .github/skills/cowork/scripts がありません。", dlg.FolderName);
        }
        return null;
    }

    private void LoadRoot(string root, string? preferPlugin = null)
    {
        _root = root;
        _env = new EnvFile(Path.Combine(root, ".env"));
        UpdateEnvChip();
        StatusRoot.Text = root;
        PluginList.Items.Clear();
        var plugins = WorkspaceLocator.FindPlugins(root);
        foreach (var dir in plugins)
        {
            var p = new PluginProject(dir);
            p.Load();
            var item = new ListBoxItem { Tag = dir, Content = PluginRow(p, root) };
            PluginList.Items.Add(item);
        }
        if (plugins.Count == 0)
        {
            ShowEmptyProgram("プラグインが見つかりません", "agentSkills を持つ manifest.json のフォルダがありません。cowork スキルのテンプレートから scaffold してください。");
            SetStatus("プラグインが見つかりません");
            return;
        }
        var index = 0;
        if (!string.IsNullOrEmpty(preferPlugin))
        {
            var hit = plugins.FindIndex(p => p.EndsWith(preferPlugin.Replace('/', '\\').TrimEnd('\\'), StringComparison.OrdinalIgnoreCase) || Path.GetFileName(p).Equals(preferPlugin, StringComparison.OrdinalIgnoreCase));
            if (hit >= 0) index = hit;
        }
        PluginList.SelectedIndex = index;
        Log($"ルート: {root}（プラグイン {plugins.Count} 件）", LogKind.Info);
    }

    private static FrameworkElement PluginRow(PluginProject p, string root)
    {
        var dp = new DockPanel();
        var ver = Ui.T("v" + p.Version, 11, "TextFaint", mono: true);
        DockPanel.SetDock(ver, Dock.Right);
        dp.Children.Add(ver);
        var ic = Ui.Icon("\uE7B8", 13, "Accent");
        ic.Margin = new Thickness(0, 0, 8, 0);
        DockPanel.SetDock(ic, Dock.Left);
        dp.Children.Add(ic);
        var sp = new StackPanel();
        sp.Children.Add(Ui.T(p.ShortName, 12, "TextBright", FontWeights.SemiBold));
        sp.Children.Add(Ui.T(Path.GetRelativePath(root, p.Dir).Replace('\\', '/'), 10.5, "TextFaint", mono: true));
        dp.Children.Add(sp);
        return dp;
    }

    private void OnPluginSelected(object sender, SelectionChangedEventArgs e)
    {
        if (PluginList.SelectedItem is ListBoxItem { Tag: string dir }) LoadPlugin(dir);
    }

    private void LoadPlugin(string dir)
    {
        if (!ConfirmDiscard()) return;
        _loadingPlugin = true;
        _plugin = new PluginProject(dir);
        _plugin.Load();
        _state = StateStore.Load(_root!, _plugin.Name);
        _steps = Pipeline.Create();
        _plan = null;
        _manifestDirty = false;
        EvaluateLocal();
        PopulateFiles();
        TitleProject.Text = $"{_plugin.ShortName}  ·  {Path.GetRelativePath(_root!, dir).Replace('\\', '/')}";
        OutputFolder.Text = _state.ExportFolder ?? Path.Combine(dir, "dist");
        RenderTimeline();
        _loadingPlugin = false;
        if (WsDesign.IsChecked == true) SelectManifest();
        else SelectStep(PlayheadStep());
        SetStatus($"{_plugin.ShortName} を読み込みました");
    }

    private void PopulateFiles()
    {
        FileList.Items.Clear();
        if (_plugin == null) return;
        var files = _plugin.Files();
        foreach (var f in files)
        {
            var (glyph, brush, meta) = f.Kind switch
            {
                FileKind.Manifest => ("\uE943", "Accent", "manifest"),
                FileKind.Skill => ("\uE8A5", "Ok", "skill"),
                FileKind.ToolsJson => ("\uE90F", "Warn", "tools"),
                FileKind.Icon => ("\uEB9F", "TextDim", IconMeta(f.FullPath)),
                FileKind.Script => ("\uE756", "TextDim", "script"),
                _ => ("\uE8A5", "TextDim", "doc"),
            };
            var dp = new DockPanel();
            var m = Ui.T(meta, 10.5, "TextFaint", mono: true);
            DockPanel.SetDock(m, Dock.Right);
            dp.Children.Add(m);
            var ic = Ui.Icon(glyph, 12, brush);
            ic.Margin = new Thickness(0, 0, 8, 0);
            DockPanel.SetDock(ic, Dock.Left);
            dp.Children.Add(ic);
            dp.Children.Add(Ui.T(f.RelPath, 12, "Text", mono: false));
            FileList.Items.Add(new ListBoxItem { Tag = f, Content = dp });
        }
        FileCount.Text = $"{files.Count} 項目";
    }

    private static string IconMeta(string path) => PluginProject.ImageSize(path) is { } s ? $"{s.W}×{s.H}" : "?";

    private bool _syncingFileList;

    private void OnFileSelected(object sender, SelectionChangedEventArgs e)
    {
        if (_syncingFileList) return;
        if (FileList.SelectedItem is ListBoxItem { Tag: ProjectFile f }) SelectFile(f);
    }

    private void SelectManifest()
    {
        var f = _plugin?.Files().FirstOrDefault(x => x.Kind == FileKind.Manifest);
        if (f != null) SelectFile(f);
    }

    private void SelectFile(ProjectFile f)
    {
        if (!ConfirmDiscardSource()) return;
        _selectedFile = f;
        _selectedStep = null;
        RenderClipSelection();
        _syncingFileList = true;
        FileList.SelectedItem = FileList.Items.OfType<ListBoxItem>().FirstOrDefault(i => i.Tag is ProjectFile pf && pf.FullPath == f.FullPath);
        _syncingFileList = false;
        if (f.IsText) LoadSource(f.FullPath);
        ShowProgramForFile(f);
        BuildInspectorForFile(f);
        TopLeftTabs.SelectedItem = f.Kind is FileKind.Manifest or FileKind.Icon ? InspectorTab : SourceTab;
    }

    private void ApplyInitialSelection(string? select)
    {
        if (string.IsNullOrEmpty(select) || _plugin == null) return;
        if (select == "manifest") SelectManifest();
        else if (select.StartsWith("step:") && int.TryParse(select[5..], out var n) && n >= 1 && n <= _steps.Count) SelectStep(_steps[n - 1]);
        else if (select.StartsWith("file:"))
        {
            var f = _plugin.Files().FirstOrDefault(x => x.RelPath.Equals(select[5..], StringComparison.OrdinalIgnoreCase));
            if (f != null) SelectFile(f);
        }
    }

    // ---------------------------------------------------------------- ワークスペース

    private void OnWorkspaceChecked(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded || _loadingPlugin) return;
        if (sender == WsDesign)
        {
            BottomLeftTabs.SelectedItem = ProjectTab;
            if (_selectedFile == null) SelectManifest();
        }
        else if (sender == WsPipeline)
        {
            BottomLeftTabs.SelectedItem = ConsoleTab;
            SelectStep(_selectedStep ?? PlayheadStep());
        }
        else if (sender == WsOutput)
        {
            BottomLeftTabs.SelectedItem = QueueTab;
            BuildInspectorForExport();
            ShowExportSummary();
        }
    }

    private void SelectWorkspace(string name)
    {
        var target = name switch { "design" => WsDesign, "output" => WsOutput, _ => WsPipeline };
        if (target.IsChecked == true) OnWorkspaceChecked(target, new RoutedEventArgs());
        else target.IsChecked = true;
    }

    private void OnShortcut(object sender, KeyEventArgs e)
    {
        var ctrl = Keyboard.Modifiers.HasFlag(ModifierKeys.Control);
        if (e.Key == Key.F5) { _ = RefreshAllAsync(); e.Handled = true; }
        else if (ctrl && e.Key == Key.S) { SaveCurrent(); e.Handled = true; }
        else if (ctrl && e.Key == Key.D1) { SelectWorkspace("design"); e.Handled = true; }
        else if (ctrl && e.Key == Key.D2) { SelectWorkspace("pipeline"); e.Handled = true; }
        else if (ctrl && (e.Key == Key.D3 || e.Key == Key.M)) { OnQuickExport(this, new RoutedEventArgs()); e.Handled = true; }
        else if (ctrl && e.Key == Key.Enter) { OnRunSelected(this, new RoutedEventArgs()); e.Handled = true; }
        else if (!ctrl && Keyboard.FocusedElement is not TextBox && (e.Key == Key.Left || e.Key == Key.Right) && WsPipeline.IsChecked == true)
        {
            var i = (_selectedStep?.Index ?? 0) + (e.Key == Key.Right ? 1 : -1);
            if (i >= 0 && i < _steps.Count) SelectStep(_steps[i]);
            e.Handled = true;
        }
    }

    private void SaveCurrent()
    {
        if (TopLeftTabs.SelectedItem == SourceTab && _sourceDirty) SaveSource();
        else if (_manifestDirty) SaveManifest();
        else if (_sourceDirty) SaveSource();
    }

    // ---------------------------------------------------------------- タイトル バー

    private void OnMinimize(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;
    private void OnMaximize(object sender, RoutedEventArgs e) => WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
    private void OnClose(object sender, RoutedEventArgs e) => Close();

    private void OnClosingWindow(object? sender, CancelEventArgs e)
    {
        if (!App.Options.Unattended && !ConfirmDiscard()) e.Cancel = true;
        _runCts?.Cancel();
    }

    private void OnOpenRoot(object sender, RoutedEventArgs e)
    {
        if (!ConfirmDiscard()) return;
        var root = PickRoot();
        if (root != null) LoadRoot(root);
    }

    private void OnRevealPlugin(object sender, RoutedEventArgs e)
    {
        if (_plugin != null) Process.Start(new ProcessStartInfo("explorer.exe", $"\"{_plugin.Dir}\"") { UseShellExecute = true });
    }

    private void OnReload(object sender, RoutedEventArgs e)
    {
        if (_root == null || !ConfirmDiscard()) return;
        _manifestDirty = false;
        _sourceDirty = false;
        LoadRoot(_root, _plugin?.Dir);
    }

    private void OnQuickExport(object sender, RoutedEventArgs e)
    {
        SelectWorkspace("output");
        if (PresetList.SelectedIndex < 0) PresetList.SelectedIndex = 0;
    }

    private bool ConfirmDiscard()
    {
        if (!_manifestDirty && !_sourceDirty) return true;
        if (App.Options.Unattended) return true;
        if (StudioDialog.Confirm(this, "保存していない変更", "保存していない変更があります。保存しますか？", okText: "保存する", cancelText: "破棄する"))
            SaveCurrent();
        _manifestDirty = false;
        _sourceDirty = false;
        return true;
    }

    private void UpdateEnvChip()
    {
        var host = _env?.DataverseHost() ?? "";
        if (_env is not { Exists: true })
        {
            EnvChipText.Text = ".env なし";
            EnvDot.Fill = Ui.B("Danger");
            EnvChip.ToolTip = "ルートに .env がありません";
            return;
        }
        EnvChipText.Text = host.Length > 0 ? host.Split('.')[0] : "DATAVERSE_URL なし";
        EnvDot.Fill = host.Length > 0 ? Ui.B("Ok") : Ui.B("Warn");
        var tenant = _env.Get("TENANT_ID");
        EnvChip.ToolTip = $"Dataverse: {_env.Get("DATAVERSE_URL")}\nテナント: {EnvFile.Mask(tenant)}\nCowork クライアント: {EnvFile.Mask(_env.Get("COWORK_OAUTH_CLIENT_ID"))}";
    }

    private void SetStatus(string text) => StatusText.Text = text;

    // ---------------------------------------------------------------- 無人実行（撮影・自己テスト）

    private async Task FinishUnattended()
    {
        await Task.Delay(900);
        UpdateLayout();
        if (App.Options.SelfTest != null)
        {
            var report = new
            {
                root = _root,
                plugins = PluginList.Items.OfType<ListBoxItem>().Select(i => i.Tag as string).ToList(),
                plugin = _plugin?.Dir,
                version = _plugin?.Version,
                files = _plugin?.Files().Select(f => f.RelPath).ToList(),
                issues = _plugin != null && _env != null ? _plugin.Validate(_env).Select(i => new { level = i.Level.ToString(), text = i.Text }).ToList() : null,
                steps = _steps.Select(s => new { s.Id, state = s.State.ToString(), s.Detail }).ToList(),
                playhead = PlayheadStep().Id,
                log = _log.Select(l => l.Text).ToList(),
            };
            File.WriteAllText(App.Options.SelfTest, JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
        }
        if (App.Options.Screenshot != null)
        {
            var dpi = VisualTreeHelper.GetDpi(this);
            var w = (int)(RootBorder.ActualWidth * dpi.DpiScaleX);
            var h = (int)(RootBorder.ActualHeight * dpi.DpiScaleY);
            var bmp = new RenderTargetBitmap(w, h, dpi.PixelsPerInchX, dpi.PixelsPerInchY, PixelFormats.Pbgra32);
            bmp.Render(RootBorder);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(bmp));
            using var fs = File.Create(App.Options.Screenshot);
            enc.Save(fs);
        }
        Application.Current.Shutdown(Environment.ExitCode);
    }
}

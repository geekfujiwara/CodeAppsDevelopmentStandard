using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using CoworkStudio.Core;
using Microsoft.Win32;

namespace CoworkStudio;

public sealed record ExportPreset(string Id, string Title, string Description, string Glyph);

public partial class MainWindow
{
    private static readonly ExportPreset[] Presets =
    {
        new("package", "Cowork パッケージ (.zip)", "referenceId を注入して ZIP を作り、manifest の位置とプレースホルダー残りを検査する。出力先が dist 以外ならコピーする。", "\uE7B8"),
        new("report", "検証レポート (.md)", "manifest の検証・パイプラインの状態・パッケージの SHA-256 をまとめる（レビュー・引き継ぎ用）。", "\uE9D5"),
        new("manifest", "パッケージ一覧 (.json)", "ZIP の中身（ファイル名・サイズ・SHA-256）と manifest の要約。配布記録に使う。", "\uE943"),
    };

    private readonly ObservableCollection<QueueItem> _queue = new();
    private bool _queueRunning;

    private void InitQueue()
    {
        QueueList.ItemsSource = _queue;
        foreach (var p in Presets)
        {
            var dp = new DockPanel();
            var ic = Ui.Icon(p.Glyph, 13, "Accent");
            ic.Margin = new Thickness(0, 1, 8, 0);
            ic.VerticalAlignment = VerticalAlignment.Top;
            DockPanel.SetDock(ic, Dock.Left);
            dp.Children.Add(ic);
            dp.Children.Add(Ui.T(p.Title, 12, "Text"));
            PresetList.Items.Add(new ListBoxItem { Tag = p, Content = dp, ToolTip = p.Description });
        }
        PresetList.SelectedIndex = 0;
        _queue.CollectionChanged += (_, _) => UpdateQueueSummary();
        UpdateQueueSummary();
    }

    private void UpdateQueueSummary()
    {
        var waiting = _queue.Count(q => !q.Finished && !q.IsRunning);
        var done = _queue.Count(q => q.Finished);
        QueueSummary.Text = _queue.Count == 0 ? "キューは空です（プリセットを選んで追加）" : $"待機 {waiting} · 完了 {done} · 合計 {_queue.Count}";
        StartQueue.IsEnabled = waiting > 0 && !_queueRunning;
    }

    private void OnPresetSelected(object sender, SelectionChangedEventArgs e)
    {
        if (PresetList.SelectedItem is ListBoxItem { Tag: ExportPreset p }) SetStatus($"プリセット: {p.Title} — {p.Description}");
    }

    private void OnBrowseOutput(object sender, RoutedEventArgs e)
    {
        var dlg = new OpenFolderDialog { Title = "出力先フォルダ", InitialDirectory = Directory.Exists(OutputFolder.Text) ? OutputFolder.Text : _plugin?.Dir };
        if (dlg.ShowDialog(this) == true) OutputFolder.Text = dlg.FolderName;
    }

    private void OnAddToQueue(object sender, RoutedEventArgs e)
    {
        if (_plugin == null || PresetList.SelectedItem is not ListBoxItem { Tag: ExportPreset p }) return;
        var folder = OutputFolder.Text.Trim();
        if (folder.Length == 0) folder = Path.Combine(_plugin.Dir, "dist");
        _state.ExportFolder = folder;
        SaveState();
        var output = p.Id switch
        {
            "package" => Path.Combine(folder, OutputName + ".zip"),
            "report" => Path.Combine(folder, $"{_plugin.Name}-report-{{日時}}.md"),
            _ => Path.Combine(folder, $"{_plugin.Name}-package.json"),
        };
        _queue.Add(new QueueItem { PresetId = p.Id, Preset = p.Title, Output = output });
        UpdateQueueSummary();
    }

    private void OnClearQueue(object sender, RoutedEventArgs e)
    {
        foreach (var q in _queue.Where(q => q.Finished).ToList()) _queue.Remove(q);
        UpdateQueueSummary();
    }

    private async void OnStartQueue(object sender, RoutedEventArgs e) => await RunQueueAsync();

    /// <summary>コマンドラインから書き出す（--export package,report,manifest [--out フォルダ]）。</summary>
    private async Task ExportFromCommandLineAsync(string presets)
    {
        if (_plugin == null) return;
        SelectWorkspace("output");
        if (!string.IsNullOrEmpty(App.Options.Out)) OutputFolder.Text = App.Options.Out;
        foreach (var id in presets.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var index = Array.FindIndex(Presets, p => p.Id == id);
            if (index < 0) { Log($"不明なプリセット: {id}（package / report / manifest）", LogKind.Error); continue; }
            PresetList.SelectedIndex = index;
            OnAddToQueue(this, new RoutedEventArgs());
        }
        await RunQueueAsync();
        Environment.ExitCode = _queue.Any(q => q.StatusBrush == Ui.B("Danger")) ? 1 : 0;
    }

    private async Task RunQueueAsync()
    {
        if (_queueRunning || _plugin == null) return;
        _queueRunning = true;
        UpdateQueueSummary();
        foreach (var item in _queue.Where(q => !q.Finished).ToList())
        {
            var sw = Stopwatch.StartNew();
            item.IsRunning = true;
            item.Status = "書き出し中…";
            item.StatusBrush = Ui.B("Accent");
            item.Icon = "\uE895";
            try
            {
                var path = item.PresetId switch
                {
                    "package" => await ExportPackageAsync(Path.GetDirectoryName(item.Output)!),
                    "report" => ExportReport(Path.GetDirectoryName(item.Output)!),
                    _ => ExportPackageJson(Path.GetDirectoryName(item.Output)!),
                };
                item.Output = path;
                item.Status = "完了";
                item.StatusBrush = Ui.B("Ok");
                item.Icon = "\uE73E";
                item.Progress = 100;
                Log($"書き出し: {path}", LogKind.Ok);
            }
            catch (Exception ex)
            {
                item.Status = ex.Message;
                item.StatusBrush = Ui.B("Danger");
                item.Icon = "\uE711";
                item.Progress = 100;
                Log($"書き出しに失敗: {item.Preset} — {ex.Message}", LogKind.Error);
            }
            item.IsRunning = false;
            item.Finished = true;
            item.Elapsed = $"{sw.Elapsed.TotalSeconds:0.0}s";
            UpdateQueueSummary();
        }
        _queueRunning = false;
        UpdateQueueSummary();
        if (WsOutput.IsChecked == true) { ShowExportSummary(); BuildInspectorForExport(); }
        SetStatus("キューを処理しました");
    }

    private async Task<string> ExportPackageAsync(string folder)
    {
        var zip = await BuildAsync() ?? throw new InvalidOperationException("ビルドに失敗しました（コンソールを確認）");
        Directory.CreateDirectory(folder);
        var dest = Path.Combine(folder, Path.GetFileName(zip));
        if (!Path.GetFullPath(dest).Equals(Path.GetFullPath(zip), StringComparison.OrdinalIgnoreCase)) File.Copy(zip, dest, overwrite: true);
        return dest;
    }

    private string ExportReport(string folder)
    {
        if (_plugin == null || _env == null) throw new InvalidOperationException("プラグインがありません");
        Directory.CreateDirectory(folder);
        var p = _plugin;
        var sb = new StringBuilder();
        sb.AppendLine($"# Cowork プラグイン レポート — {p.ShortName} v{p.Version}");
        sb.AppendLine();
        sb.AppendLine($"- 作成: {DateTime.Now:yyyy-MM-dd HH:mm}（Cowork Studio）");
        sb.AppendLine($"- プラグイン: `{Path.GetRelativePath(_root!, p.Dir).Replace('\\', '/')}`");
        sb.AppendLine($"- manifest id: `{p.Get("id")}`");
        sb.AppendLine($"- Dataverse: {_env.DataverseHost()}");
        sb.AppendLine();
        sb.AppendLine("## パイプライン");
        sb.AppendLine();
        sb.AppendLine("| # | ステップ | 状態 | 詳細 |");
        sb.AppendLine("|---|---|---|---|");
        foreach (var s in _steps) sb.AppendLine($"| {s.Index + 1} | {s.Title} | {Pipeline.StateText(s.State)} | {s.Detail.Replace("|", "\\|")} |");
        sb.AppendLine();
        sb.AppendLine("## manifest の検証");
        sb.AppendLine();
        foreach (var i in p.Validate(_env)) sb.AppendLine($"- {(i.Level == IssueLevel.Ok ? "✅" : i.Level == IssueLevel.Warn ? "⚠️" : "❌")} {i.Text}");
        sb.AppendLine();
        sb.AppendLine("## パッケージ");
        sb.AppendLine();
        var zip = p.LatestZip();
        if (zip == null) sb.AppendLine("- ZIP はまだありません");
        else
        {
            sb.AppendLine($"- `{zip.Name}`（{zip.Length:N0} バイト・{zip.LastWriteTime:yyyy-MM-dd HH:mm}）");
            sb.AppendLine($"- SHA-256: `{PluginProject.Sha256(zip.FullName)}`");
            foreach (var i in PluginProject.InspectZip(zip.FullName)) sb.AppendLine($"- {(i.Level == IssueLevel.Ok ? "✅" : "❌")} {i.Text}");
        }
        var path = Path.Combine(folder, $"{p.Name}-report-{DateTime.Now:yyyyMMdd-HHmm}.md");
        File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
        return path;
    }

    private string ExportPackageJson(string folder)
    {
        if (_plugin == null) throw new InvalidOperationException("プラグインがありません");
        var zip = _plugin.LatestZip() ?? throw new InvalidOperationException("ZIP がありません（先に Cowork パッケージを書き出す）");
        Directory.CreateDirectory(folder);
        var entries = new List<object>();
        using (var archive = ZipFile.OpenRead(zip.FullName))
        {
            foreach (var e in archive.Entries.OrderBy(e => e.FullName))
            {
                using var s = e.Open();
                using var ms = new MemoryStream();
                s.CopyTo(ms);
                entries.Add(new { name = e.FullName, size = e.Length, sha256 = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(ms.ToArray())).ToLowerInvariant() });
            }
        }
        var doc = new
        {
            plugin = _plugin.ShortName,
            version = _plugin.Version,
            manifestId = _plugin.Get("id"),
            skills = _plugin.SkillFolders(),
            zip = new { name = zip.Name, size = zip.Length, sha256 = PluginProject.Sha256(zip.FullName), modified = zip.LastWriteTime },
            entries,
            exportedAt = DateTime.Now,
        };
        var path = Path.Combine(folder, $"{_plugin.Name}-package.json");
        File.WriteAllText(path, JsonSerializer.Serialize(doc, new JsonSerializerOptions { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }), new UTF8Encoding(false));
        return path;
    }
}

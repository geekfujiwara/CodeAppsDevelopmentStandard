using System.IO;
using System.Text;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using CoworkStudio.Core;

namespace CoworkStudio;

public partial class MainWindow
{
    private string? _sourcePath;
    private bool _sourceDirty;
    private bool _suppressSourceChange;

    private void LoadSource(string path)
    {
        _suppressSourceChange = true;
        SourceEditor.Text = File.Exists(path) ? File.ReadAllText(path) : "";
        _suppressSourceChange = false;
        _sourcePath = path;
        _sourceDirty = false;
        SourceDirtyDot.Visibility = Visibility.Collapsed;
        SourceTitle.Text = _plugin != null ? Path.GetRelativePath(_plugin.Dir, path).Replace('\\', '/') : path;
        SourceEditor.ScrollToHome();
        UpdateLineNumbers();
    }

    private void OnSourceChanged(object sender, TextChangedEventArgs e)
    {
        UpdateLineNumbers();
        if (_suppressSourceChange || _sourcePath == null) return;
        _sourceDirty = true;
        SourceDirtyDot.Visibility = Visibility.Visible;
    }

    private void UpdateLineNumbers()
    {
        var count = Math.Max(1, SourceEditor.LineCount > 0 ? SourceEditor.LineCount : SourceEditor.Text.Split('\n').Length);
        var sb = new StringBuilder();
        for (var i = 1; i <= count; i++) sb.Append(i).Append('\n');
        LineNumbers.Text = sb.ToString();
        LineNumbers.LineHeight = SourceEditor.FontFamily.LineSpacing * SourceEditor.FontSize;
    }

    private void OnSourceScroll(object sender, ScrollChangedEventArgs e)
    {
        LineNumbers.Margin = new Thickness(0, -e.VerticalOffset, 0, 0);
        if (e.ExtentHeightChange != 0) UpdateLineNumbers();
    }

    private void OnSaveSource(object sender, RoutedEventArgs e) => SaveSource();

    private void OnRevertSource(object sender, RoutedEventArgs e)
    {
        if (_sourcePath != null) LoadSource(_sourcePath);
    }

    private void SaveSource()
    {
        if (_sourcePath == null || _plugin == null) return;
        var text = SourceEditor.Text;
        if (_sourcePath.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
        {
            try { JsonNode.Parse(text); }
            catch (Exception ex)
            {
                StudioDialog.Info(this, "JSON が正しくありません", "保存しませんでした。JSON の構文を直してください。", ex.Message);
                return;
            }
        }
        File.WriteAllText(_sourcePath, text, new UTF8Encoding(false));
        _sourceDirty = false;
        SourceDirtyDot.Visibility = Visibility.Collapsed;
        Log($"保存しました: {SourceTitle.Text}", LogKind.Ok);
        SetStatus($"{SourceTitle.Text} を保存しました");
        if (_sourcePath.Equals(_plugin.ManifestPath, StringComparison.OrdinalIgnoreCase))
        {
            _plugin.Load();
            _manifestDirty = false;
            RefreshPluginRow();
        }
        EvaluateLocal();
        RenderTimeline();
        if (_selectedFile != null)
        {
            ShowProgramForFile(_selectedFile);
            BuildInspectorForFile(_selectedFile);
        }
    }

    private bool ConfirmDiscardSource()
    {
        if (!_sourceDirty || App.Options.Unattended) return true;
        if (StudioDialog.Confirm(this, "保存していない変更", $"{SourceTitle.Text} に保存していない変更があります。保存しますか？", okText: "保存する", cancelText: "破棄する"))
            SaveSource();
        _sourceDirty = false;
        return true;
    }
}

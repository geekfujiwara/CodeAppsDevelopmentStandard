using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Media;

namespace CoworkStudio;

public enum LogKind { Info, Header, Ok, Warn, Error, Faint }

public partial class MainWindow
{
    private readonly ObservableCollection<LogLine> _log = new();
    private ICollectionView? _logView;

    private void InitConsole()
    {
        ConsoleList.ItemsSource = _log;
        _logView = CollectionViewSource.GetDefaultView(_log);
        _logView.Filter = o => ConsoleFilter.Text.Length == 0 || ((LogLine)o).Text.Contains(ConsoleFilter.Text, StringComparison.OrdinalIgnoreCase);
    }

    private static LogKind Classify(string line, bool err)
    {
        var t = line.TrimStart();
        if (t.StartsWith("[auth_helper]") || t.StartsWith("WARNING: ") && t.Contains("pip")) return LogKind.Faint;
        if (t.StartsWith("✅") || t.StartsWith("[OK]") || t.StartsWith("✔")) return LogKind.Ok;
        if (t.StartsWith("❌") || t.StartsWith("✖") || t.StartsWith("Traceback") || t.Contains("Error:") || t.StartsWith("Write-Error")) return LogKind.Error;
        if (t.StartsWith("⚠") || t.StartsWith("❓") || t.StartsWith("WARN") || t.StartsWith("警告")) return LogKind.Warn;
        if (t.StartsWith("PLAN_HASH=")) return LogKind.Header;
        return err ? LogKind.Faint : LogKind.Info;
    }

    private void Log(string text, LogKind kind)
    {
        var brush = kind switch
        {
            LogKind.Header => Ui.B("AccentHover"),
            LogKind.Ok => Ui.B("Ok"),
            LogKind.Warn => Ui.B("Warn"),
            LogKind.Error => Ui.B("Danger"),
            LogKind.Faint => Ui.B("TextFaint"),
            _ => Ui.B("Text"),
        };
        _log.Add(new LogLine { Time = DateTime.Now.ToString("HH:mm:ss"), Text = text, Brush = brush, Weight = kind == LogKind.Header ? FontWeights.SemiBold : FontWeights.Normal });
        while (_log.Count > 5000) _log.RemoveAt(0);
        if (ConsoleFilter.Text.Length == 0 && _log.Count > 0) ConsoleList.ScrollIntoView(_log[^1]);
    }

    private void OnConsoleFilter(object sender, TextChangedEventArgs e) => _logView?.Refresh();

    private void OnClearConsole(object sender, RoutedEventArgs e) => _log.Clear();

    private void OnCopyConsole(object sender, RoutedEventArgs e)
    {
        try { Clipboard.SetText(string.Join(Environment.NewLine, _log.Select(l => $"{l.Time} {l.Text}"))); SetStatus("コンソールをコピーしました"); }
        catch { }
    }
}

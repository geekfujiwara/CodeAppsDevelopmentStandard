using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using CoworkStudio.Core;

namespace CoworkStudio;

/// <summary>コードで組み立てる UI 部品（インスペクター・プレビュー用）。</summary>
internal static class Ui
{
    public static Brush B(string key) => (Brush)Application.Current.Resources[key];
    public static FontFamily F(string key) => (FontFamily)Application.Current.Resources[key];
    public static SolidColorBrush Hex(string hex) => new((Color)ColorConverter.ConvertFromString(hex));

    public static TextBlock T(string text, double size = 12, string brush = "Text", FontWeight? weight = null, bool wrap = false, Thickness? margin = null, bool mono = false)
    {
        var t = new TextBlock
        {
            Text = text,
            FontSize = size,
            Foreground = B(brush),
            FontWeight = weight ?? FontWeights.Normal,
            TextWrapping = wrap ? TextWrapping.Wrap : TextWrapping.NoWrap,
            TextTrimming = wrap ? TextTrimming.None : TextTrimming.CharacterEllipsis,
            Margin = margin ?? new Thickness(0),
        };
        if (mono) t.FontFamily = F("MonoFont");
        return t;
    }

    public static TextBlock Icon(string glyph, double size = 13, string brush = "TextDim") =>
        new() { Text = glyph, FontFamily = F("IconFont"), FontSize = size, Foreground = B(brush), VerticalAlignment = VerticalAlignment.Center };

    /// <summary>Effect Controls 風のセクション見出し（細い線と小さい大文字）。</summary>
    public static FrameworkElement Section(string title, string? glyph = null)
    {
        var dp = new DockPanel { Margin = new Thickness(0, 16, 0, 8) };
        if (glyph != null)
        {
            var ic = Icon(glyph, 11, "TextFaint");
            ic.Margin = new Thickness(0, 0, 6, 0);
            DockPanel.SetDock(ic, Dock.Left);
            dp.Children.Add(ic);
        }
        var label = T(title, 11, "TextFaint", FontWeights.SemiBold);
        DockPanel.SetDock(label, Dock.Left);
        dp.Children.Add(label);
        dp.Children.Add(new Border { Height = 1, Background = B("Line"), Margin = new Thickness(10, 1, 0, 0), VerticalAlignment = VerticalAlignment.Center });
        return dp;
    }

    public static Button Btn(string text, RoutedEventHandler click, string? glyph = null, string? style = null, string? tip = null, bool enabled = true)
    {
        var sp = new StackPanel { Orientation = Orientation.Horizontal };
        if (glyph != null)
        {
            var ic = new TextBlock { Text = glyph, FontFamily = F("IconFont"), Margin = new Thickness(0, 0, 7, 0), VerticalAlignment = VerticalAlignment.Center };
            sp.Children.Add(ic);
        }
        sp.Children.Add(new TextBlock { Text = text, VerticalAlignment = VerticalAlignment.Center });
        var b = new Button { Content = sp, Margin = new Thickness(0, 0, 6, 6), IsEnabled = enabled };
        System.Windows.Automation.AutomationProperties.SetName(b, text);
        if (style != null) b.Style = (Style)Application.Current.Resources[style];
        if (tip != null) b.ToolTip = tip;
        b.Click += click;
        return b;
    }

    public static WrapPanel Row(params UIElement[] items)
    {
        var w = new WrapPanel { Orientation = Orientation.Horizontal };
        foreach (var i in items) w.Children.Add(i);
        return w;
    }

    /// <summary>ラベル + 入力欄（右に文字数カウンター）。</summary>
    public static (FrameworkElement Root, TextBox Box, TextBlock Counter) Field(string label, string value, int? max = null, bool multi = false, bool mono = false, string? hint = null)
    {
        var grid = new Grid { Margin = new Thickness(0, 0, 0, 8) };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(96) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var lab = T(label, 12, "TextDim", margin: new Thickness(0, 5, 8, 0));
        lab.VerticalAlignment = VerticalAlignment.Top;
        if (hint != null) lab.ToolTip = hint;
        grid.Children.Add(lab);
        var stack = new StackPanel();
        Grid.SetColumn(stack, 1);
        var box = new TextBox { Text = value, AcceptsReturn = multi, TextWrapping = multi ? TextWrapping.Wrap : TextWrapping.NoWrap };
        if (multi) { box.Height = 110; box.VerticalScrollBarVisibility = ScrollBarVisibility.Auto; }
        if (mono) box.FontFamily = F("MonoFont");
        stack.Children.Add(box);
        var counter = T("", 10.5, "TextFaint", margin: new Thickness(0, 2, 2, 0));
        counter.HorizontalAlignment = HorizontalAlignment.Right;
        if (max != null)
        {
            void Update()
            {
                counter.Text = $"{box.Text.Length} / {max}";
                counter.Foreground = box.Text.Length > max ? B("Danger") : B("TextFaint");
            }
            box.TextChanged += (_, _) => Update();
            Update();
            stack.Children.Add(counter);
        }
        grid.Children.Add(stack);
        return (grid, box, counter);
    }

    public static Color StateColor(StepState s) => s switch
    {
        StepState.Done => (Color)ColorConverter.ConvertFromString("#4FBF72"),
        StepState.Warning => (Color)ColorConverter.ConvertFromString("#E9A23B"),
        StepState.Error => (Color)ColorConverter.ConvertFromString("#E5534B"),
        StepState.Running => (Color)ColorConverter.ConvertFromString("#2C8DF3"),
        StepState.Manual => (Color)ColorConverter.ConvertFromString("#B58CE6"),
        StepState.Pending => (Color)ColorConverter.ConvertFromString("#8A8A8A"),
        _ => (Color)ColorConverter.ConvertFromString("#5E5E5E"),
    };

    public static string StateGlyph(StepState s) => s switch
    {
        StepState.Done => "\uE73E",
        StepState.Warning => "\uE7BA",
        StepState.Error => "\uE711",
        StepState.Running => "\uE895",
        StepState.Manual => "\uE8A7",
        StepState.Pending => "\uE823",
        _ => "\uE9CE",
    };

    public static Border Badge(StepState s)
    {
        var c = StateColor(s);
        var sp = new StackPanel { Orientation = Orientation.Horizontal };
        sp.Children.Add(new TextBlock { Text = StateGlyph(s), FontFamily = F("IconFont"), FontSize = 10, Foreground = new SolidColorBrush(c), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 5, 0) });
        sp.Children.Add(new TextBlock { Text = Pipeline.StateText(s), FontSize = 11, Foreground = new SolidColorBrush(c), VerticalAlignment = VerticalAlignment.Center });
        return new Border
        {
            Child = sp,
            Padding = new Thickness(8, 2, 9, 2),
            CornerRadius = new CornerRadius(10),
            Background = new SolidColorBrush(Color.FromArgb(0x26, c.R, c.G, c.B)),
            BorderBrush = new SolidColorBrush(Color.FromArgb(0x55, c.R, c.G, c.B)),
            BorderThickness = new Thickness(1),
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Left,
        };
    }

    public static FrameworkElement IssueRow(Issue i)
    {
        var (glyph, brush) = i.Level switch
        {
            IssueLevel.Ok => ("\uE73E", "Ok"),
            IssueLevel.Warn => ("\uE7BA", "Warn"),
            _ => ("\uE711", "Danger"),
        };
        var dp = new DockPanel { Margin = new Thickness(0, 0, 0, 5) };
        var ic = Icon(glyph, 11, brush);
        ic.Margin = new Thickness(0, 2, 8, 0);
        ic.VerticalAlignment = VerticalAlignment.Top;
        DockPanel.SetDock(ic, Dock.Left);
        dp.Children.Add(ic);
        dp.Children.Add(T(i.Text, 12, i.Level == IssueLevel.Ok ? "TextDim" : "Text", wrap: true));
        return dp;
    }

    /// <summary>プレビューの背景（暗い市松模様）。</summary>
    public static Brush Checker(string a = "#191919", string b = "#1E1E1E", double size = 14)
    {
        var group = new DrawingGroup();
        group.Children.Add(new GeometryDrawing(Hex(a), null, new RectangleGeometry(new Rect(0, 0, size * 2, size * 2))));
        var g = new GeometryGroup();
        g.Children.Add(new RectangleGeometry(new Rect(0, 0, size, size)));
        g.Children.Add(new RectangleGeometry(new Rect(size, size, size, size)));
        group.Children.Add(new GeometryDrawing(Hex(b), null, g));
        return new DrawingBrush(group) { TileMode = TileMode.Tile, Viewport = new Rect(0, 0, size * 2, size * 2), ViewportUnits = BrushMappingMode.Absolute };
    }

    /// <summary>未実施クリップの斜線。</summary>
    public static Brush Hatch(Color c)
    {
        var group = new DrawingGroup();
        group.Children.Add(new GeometryDrawing(new SolidColorBrush(Color.FromArgb(0x30, c.R, c.G, c.B)), null, new RectangleGeometry(new Rect(0, 0, 8, 8))));
        group.Children.Add(new GeometryDrawing(null, new Pen(new SolidColorBrush(Color.FromArgb(0x55, c.R, c.G, c.B)), 1.4), new LineGeometry(new Point(0, 8), new Point(8, 0))));
        return new DrawingBrush(group) { TileMode = TileMode.Tile, Viewport = new Rect(0, 0, 8, 8), ViewportUnits = BrushMappingMode.Absolute };
    }
}

public sealed class LogLine
{
    public required string Time { get; init; }
    public required string Text { get; init; }
    public required Brush Brush { get; init; }
    public FontWeight Weight { get; init; } = FontWeights.Normal;
}

public sealed class QueueItem : INotifyPropertyChanged
{
    private string _status = "待機";
    private double _progress;
    private bool _isRunning;
    private string _elapsed = "";
    private Brush _statusBrush = Ui.B("TextDim");
    private string _icon = "\uE823";

    public required string PresetId { get; init; }
    public required string Preset { get; init; }
    private string _output = "";
    public required string Output { get => _output; set => Set(ref _output, value); }

    public string Status { get => _status; set => Set(ref _status, value); }
    public double Progress { get => _progress; set => Set(ref _progress, value); }
    public bool IsRunning { get => _isRunning; set => Set(ref _isRunning, value); }
    public string Elapsed { get => _elapsed; set => Set(ref _elapsed, value); }
    public Brush StatusBrush { get => _statusBrush; set => Set(ref _statusBrush, value); }
    public string Icon { get => _icon; set => Set(ref _icon, value); }
    public bool Finished { get; set; }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}

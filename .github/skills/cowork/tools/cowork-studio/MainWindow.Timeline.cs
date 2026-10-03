using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using CoworkStudio.Core;
using Shapes = System.Windows.Shapes;

namespace CoworkStudio;

public partial class MainWindow
{
    private readonly Dictionary<string, Border> _clips = new();
    private readonly Canvas _playheadLayer = new() { IsHitTestVisible = false, ClipToBounds = false };
    private readonly Shapes.Rectangle _playheadLine = new() { Width = 1.5, Fill = new SolidColorBrush(Color.FromRgb(0x2C, 0x8D, 0xF3)) };
    private readonly Shapes.Path _playheadHead = new()
    {
        Fill = new SolidColorBrush(Color.FromRgb(0x2C, 0x8D, 0xF3)),
        Data = Geometry.Parse("M0,0 L12,0 L12,9 L6,15 L0,9 Z"),
    };
    private readonly Shapes.Rectangle _workArea = new() { Height = 5, RadiusX = 1, RadiusY = 1, Fill = new SolidColorBrush(Color.FromRgb(0x3B, 0x52, 0x6E)), HorizontalAlignment = HorizontalAlignment.Left };
    private int _playheadIndex = -1;

    private void InitTimeline()
    {
        TimelineGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(156) });
        for (var i = 0; i < 7; i++) TimelineGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star), MinWidth = 70 });
        TimelineGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(26) });
        TimelineGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(9) });
        for (var i = 0; i < 7; i++) TimelineGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star), MinHeight = 22 });
        _playheadLayer.Children.Add(_playheadLine);
        _playheadLayer.Children.Add(_playheadHead);
        _playheadLayer.SizeChanged += (_, _) => PositionPlayhead(false);
    }

    private StepModel PlayheadStep() =>
        _steps.FirstOrDefault(s => s.State is not StepState.Done) ?? _steps[^1];

    private void RenderTimeline()
    {
        TimelineGrid.Children.Clear();
        _clips.Clear();

        // ルーラー
        var corner = new Border { Background = Ui.Hex("#1A1A1A"), BorderBrush = Ui.B("Line"), BorderThickness = new Thickness(0, 0, 1, 1) };
        corner.Child = new TextBlock { Text = "トラック", Foreground = Ui.B("TextFaint"), FontSize = 10.5, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(10, 0, 0, 0) };
        TimelineGrid.Children.Add(corner);
        foreach (var s in _steps)
        {
            var cell = new Border
            {
                Background = Ui.Hex("#1A1A1A"),
                BorderBrush = Ui.B("Line"),
                BorderThickness = new Thickness(1, 0, 0, 1),
                Cursor = Cursors.Hand,
                ToolTip = $"{s.Index + 1}. {s.Title}",
            };
            var dp = new DockPanel { Margin = new Thickness(5, 0, 4, 0) };
            var tc = new TextBlock { Text = $"00:0{s.Index + 1}", FontFamily = Ui.F("MonoFont"), FontSize = 10.5, Foreground = Ui.B("TextDim"), VerticalAlignment = VerticalAlignment.Center };
            DockPanel.SetDock(tc, Dock.Left);
            dp.Children.Add(tc);
            dp.Children.Add(new TextBlock { Text = s.TrackName, FontSize = 10.5, Foreground = Ui.B("TextFaint"), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(6, 0, 0, 0), TextTrimming = TextTrimming.CharacterEllipsis });
            // 目盛り
            var ticks = new Canvas { IsHitTestVisible = false };
            cell.Child = new Grid { Children = { dp, ticks } };
            cell.SizeChanged += (_, e) =>
            {
                ticks.Children.Clear();
                for (var k = 1; k < 4; k++)
                    ticks.Children.Add(new Shapes.Rectangle { Width = 1, Height = k == 2 ? 6 : 4, Fill = Ui.Hex("#3A3A3A"), Margin = new Thickness(e.NewSize.Width * k / 4, e.NewSize.Height - (k == 2 ? 6 : 4), 0, 0) });
            };
            var step = s;
            cell.MouseLeftButtonDown += (_, _) => SelectStep(step);
            Grid.SetColumn(cell, s.Index + 1);
            TimelineGrid.Children.Add(cell);
        }

        // ワーク エリア（完了した範囲）
        var doneCount = _steps.TakeWhile(x => x.State == StepState.Done).Count();
        var workHost = new Grid { Background = Ui.Hex("#161616") };
        Grid.SetRow(workHost, 1);
        Grid.SetColumn(workHost, 1);
        Grid.SetColumnSpan(workHost, 7);
        workHost.Children.Add(_workArea.Parent is Panel old ? DetachWorkArea(old) : _workArea);
        workHost.SizeChanged += (_, e) => _workArea.Width = Math.Max(0, e.NewSize.Width * doneCount / 7.0 - 2);
        _workArea.Width = Math.Max(0, workHost.ActualWidth * doneCount / 7.0 - 2);
        _workArea.Margin = new Thickness(1, 2, 0, 2);
        TimelineGrid.Children.Add(workHost);
        var workCorner = new Border { Background = Ui.Hex("#161616"), BorderBrush = Ui.B("Line"), BorderThickness = new Thickness(0, 0, 1, 0) };
        Grid.SetRow(workCorner, 1);
        TimelineGrid.Children.Add(workCorner);

        // トラック
        foreach (var s in _steps)
        {
            var row = s.Index + 2;
            var lane = new Border
            {
                Background = Ui.Hex(s.Index % 2 == 0 ? "#1B1B1B" : "#1E1E1E"),
                BorderBrush = Ui.Hex("#262626"),
                BorderThickness = new Thickness(0, 0, 0, 1),
            };
            Grid.SetRow(lane, row);
            Grid.SetColumn(lane, 1);
            Grid.SetColumnSpan(lane, 7);
            TimelineGrid.Children.Add(lane);
            TimelineGrid.Children.Add(TrackHeader(s, row));
        }
        // 縦の目盛り線
        for (var c = 1; c <= 7; c++)
        {
            var line = new Border { BorderBrush = Ui.Hex("#262626"), BorderThickness = new Thickness(1, 0, 0, 0), IsHitTestVisible = false };
            Grid.SetColumn(line, c);
            Grid.SetRow(line, 2);
            Grid.SetRowSpan(line, 7);
            TimelineGrid.Children.Add(line);
        }
        foreach (var s in _steps) TimelineGrid.Children.Add(MakeClip(s));

        Grid.SetColumn(_playheadLayer, 1);
        Grid.SetColumnSpan(_playheadLayer, 7);
        Grid.SetRowSpan(_playheadLayer, 9);
        TimelineGrid.Children.Add(_playheadLayer);

        HighlightClip();
        UpdateSequenceHeader();
        PositionPlayhead(true);
    }

    private UIElement DetachWorkArea(Panel old)
    {
        old.Children.Remove(_workArea);
        return _workArea;
    }

    private Border TrackHeader(StepModel s, int row)
    {
        var header = new Border { Background = Ui.Hex("#222222"), BorderBrush = Ui.B("Line"), BorderThickness = new Thickness(0, 0, 1, 1), Padding = new Thickness(6, 0, 8, 0) };
        var dp = new DockPanel();
        var tag = new Border
        {
            Width = 26,
            Height = 17,
            CornerRadius = new CornerRadius(2),
            Background = Ui.Hex(s.Track.StartsWith('V') ? "#2B3442" : "#2D3A2F"),
            Child = new TextBlock { Text = s.Track, FontFamily = Ui.F("MonoFont"), FontSize = 10, Foreground = Ui.B("TextDim"), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
            VerticalAlignment = VerticalAlignment.Center,
        };
        DockPanel.SetDock(tag, Dock.Left);
        dp.Children.Add(tag);
        var dot = new Shapes.Ellipse { Width = 7, Height = 7, Fill = new SolidColorBrush(Ui.StateColor(s.State)), VerticalAlignment = VerticalAlignment.Center, ToolTip = Pipeline.StateText(s.State) };
        DockPanel.SetDock(dot, Dock.Right);
        dp.Children.Add(dot);
        var swatch = new Border { Width = 3, Height = 14, Background = new SolidColorBrush(s.Label), Margin = new Thickness(7, 0, 6, 0), VerticalAlignment = VerticalAlignment.Center, CornerRadius = new CornerRadius(1) };
        DockPanel.SetDock(swatch, Dock.Left);
        dp.Children.Add(swatch);
        dp.Children.Add(new TextBlock { Text = s.TrackName, FontSize = 11.5, Foreground = Ui.B("Text"), VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis });
        header.Child = dp;
        Grid.SetRow(header, row);
        var step = s;
        header.Cursor = Cursors.Hand;
        header.MouseLeftButtonDown += (_, _) => SelectStep(step);
        return header;
    }

    private Border MakeClip(StepModel s)
    {
        var c = s.Label;
        var dark = Color.FromRgb((byte)(c.R * 0.55), (byte)(c.G * 0.55), (byte)(c.B * 0.55));
        var clip = new Border
        {
            CornerRadius = new CornerRadius(3),
            Margin = new Thickness(2, 3, 2, 3),
            BorderThickness = new Thickness(1),
            Cursor = Cursors.Hand,
            ToolTip = $"{s.Title} — {Pipeline.StateText(s.State)}" + (s.Detail.Length > 0 ? $"\n{s.Detail}" : ""),
            SnapsToDevicePixels = true,
        };
        var fg = Brushes.White as Brush;
        switch (s.State)
        {
            case StepState.Done:
            case StepState.Running:
                clip.Background = new LinearGradientBrush(c, dark, 90);
                clip.BorderBrush = new SolidColorBrush(Color.FromArgb(0xAA, c.R, c.G, c.B));
                break;
            case StepState.Warning:
                clip.Background = new LinearGradientBrush(c, dark, 90);
                clip.BorderBrush = Ui.B("Warn");
                break;
            case StepState.Error:
                clip.Background = Ui.Hex("#4A1F1F");
                clip.BorderBrush = Ui.B("Danger");
                break;
            case StepState.Manual:
                clip.Background = new SolidColorBrush(Color.FromArgb(0x22, c.R, c.G, c.B));
                clip.BorderBrush = new SolidColorBrush(c);
                fg = new SolidColorBrush(c);
                break;
            default:
                clip.Background = Ui.Hatch(c);
                clip.BorderBrush = new SolidColorBrush(Color.FromArgb(0x66, c.R, c.G, c.B));
                fg = Ui.B("TextDim");
                break;
        }
        var grid = new Grid();
        var dp = new DockPanel { Margin = new Thickness(6, 0, 6, 0) };
        var glyph = new TextBlock { Text = Ui.StateGlyph(s.State), FontFamily = Ui.F("IconFont"), FontSize = 10.5, Foreground = s.State == StepState.Error ? Ui.B("Danger") : s.State == StepState.Warning ? Ui.B("Warn") : fg, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 6, 0) };
        DockPanel.SetDock(glyph, Dock.Left);
        dp.Children.Add(glyph);
        dp.Children.Add(new TextBlock { Text = s.Title, Foreground = fg, FontSize = 11.5, FontWeight = FontWeights.SemiBold, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis });
        grid.Children.Add(dp);
        if (s.State == StepState.Warning)
            grid.Children.Add(new Border { Height = 2, VerticalAlignment = VerticalAlignment.Bottom, Background = Ui.B("Warn") });
        clip.Child = grid;
        if (s.State == StepState.Running)
        {
            var anim = new DoubleAnimation(1, 0.45, TimeSpan.FromMilliseconds(650)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever };
            clip.BeginAnimation(OpacityProperty, anim);
        }
        var step = s;
        clip.MouseLeftButtonDown += (_, e) =>
        {
            SelectStep(step);
            if (e.ClickCount == 2) _ = RunPrimaryAsync(step);
        };
        Grid.SetRow(clip, s.Index + 2);
        Grid.SetColumn(clip, s.Index + 1);
        _clips[s.Id] = clip;
        return clip;
    }

    private void HighlightClip()
    {
        foreach (var (id, clip) in _clips)
        {
            var selected = _selectedStep?.Id == id;
            clip.Effect = selected ? new System.Windows.Media.Effects.DropShadowEffect { Color = Colors.White, BlurRadius = 0, ShadowDepth = 0, Opacity = 1 } : null;
            if (selected)
            {
                clip.BorderBrush = Brushes.White;
                clip.BorderThickness = new Thickness(1.5);
            }
        }
    }

    private void PositionPlayhead(bool animate)
    {
        if (_steps.Count == 0) return;
        var idx = PlayheadStep().Index;
        var allDone = _steps.All(s => s.State == StepState.Done);
        var col = _playheadLayer.ActualWidth / 7.0;
        if (col <= 0) return;
        var x = allDone ? _playheadLayer.ActualWidth - 1 : col * idx + col / 2;
        _playheadLine.Height = _playheadLayer.ActualHeight;
        Canvas.SetTop(_playheadHead, 5);
        if (animate && _playheadIndex >= 0 && _playheadIndex != idx)
        {
            var ease = new CubicEase { EasingMode = EasingMode.EaseInOut };
            _playheadLine.BeginAnimation(Canvas.LeftProperty, new DoubleAnimation(x, TimeSpan.FromMilliseconds(420)) { EasingFunction = ease });
            _playheadHead.BeginAnimation(Canvas.LeftProperty, new DoubleAnimation(x - 6, TimeSpan.FromMilliseconds(420)) { EasingFunction = ease });
        }
        else
        {
            _playheadLine.BeginAnimation(Canvas.LeftProperty, null);
            _playheadHead.BeginAnimation(Canvas.LeftProperty, null);
            Canvas.SetLeft(_playheadLine, x);
            Canvas.SetLeft(_playheadHead, x - 6);
        }
        _playheadIndex = idx;
    }

    private void UpdateSequenceHeader()
    {
        var done = _steps.Count(s => s.State == StepState.Done);
        var warn = _steps.Count(s => s.State == StepState.Warning);
        var err = _steps.Count(s => s.State == StepState.Error);
        var play = PlayheadStep();
        Timecode.Text = $"{done:00}:{_steps.Count:00}";
        SequenceName.Text = _plugin == null ? "シーケンスなし" : $"{_plugin.ShortName}  ·  v{_plugin.Version}";
        var last = _steps.Where(s => s.CheckedAt != null).Select(s => s.CheckedAt!.Value).DefaultIfEmpty().Max();
        SequenceMeta.Text = $"完了 {done}/{_steps.Count}" + (warn > 0 ? $" · 要確認 {warn}" : "") + (err > 0 ? $" · エラー {err}" : "")
            + $" · 次: {play.Index + 1}. {play.Title}" + (last == default ? " · 未確認（F5）" : $" · 確認 {last:HH:mm:ss}");
    }

    private void SelectStep(StepModel step)
    {
        if (_plugin == null) return;
        _selectedStep = step;
        _selectedFile = null;
        _syncingFileList = true;
        FileList.SelectedItem = null;
        _syncingFileList = false;
        RenderClipSelection();
        BuildInspectorForStep(step);
        ShowProgramForStep(step);
        TopLeftTabs.SelectedItem = InspectorTab;
    }

    private void RenderClipSelection()
    {
        // 選択枠だけを描き直す（状態の色は保持）
        foreach (var s in _steps)
        {
            if (!_clips.TryGetValue(s.Id, out var old)) continue;
            var idx = TimelineGrid.Children.IndexOf(old);
            if (idx < 0) continue;
            var fresh = MakeClip(s);
            TimelineGrid.Children.RemoveAt(idx);
            TimelineGrid.Children.Insert(idx, fresh);
        }
        HighlightClip();
    }
}

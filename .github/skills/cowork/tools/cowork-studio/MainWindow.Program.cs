using System.IO;
using System.IO.Compression;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using CoworkStudio.Core;
using Shapes = System.Windows.Shapes;

namespace CoworkStudio;

public partial class MainWindow
{
    private void SetProgram(UIElement content, string caption, string meta)
    {
        ProgramHost.Content = content;
        ProgramCaption.Text = caption;
        ProgramMeta.Text = meta;
    }

    private string SequenceMetaText()
    {
        var done = _steps.Count(s => s.State == StepState.Done);
        return $"{done:00}:{_steps.Count:00}  " + string.Concat(_steps.Select(s => s.State == StepState.Done ? "●" : "○"));
    }

    private void ShowEmptyProgram(string title, string text)
    {
        var sp = new StackPanel { VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center, MaxWidth = 460 };
        var ic = Ui.Icon("\uE8B7", 40, "TextFaint");
        ic.HorizontalAlignment = HorizontalAlignment.Center;
        sp.Children.Add(ic);
        var t = Ui.T(title, 16, "TextBright", FontWeights.SemiBold, margin: new Thickness(0, 14, 0, 6));
        t.HorizontalAlignment = HorizontalAlignment.Center;
        sp.Children.Add(t);
        var d = Ui.T(text, 12, "TextDim", wrap: true);
        d.TextAlignment = TextAlignment.Center;
        sp.Children.Add(d);
        SetProgram(new Grid { Background = Ui.Checker(), Children = { sp } }, title, "--:--");
    }

    private void ShowProgramForFile(ProjectFile f)
    {
        switch (f.Kind)
        {
            case FileKind.Manifest: ShowManifestPreview(); break;
            case FileKind.Skill:
            case FileKind.Markdown: ShowMarkdown(f); break;
            case FileKind.Icon: ShowIcons(); break;
            default: ShowCode(f); break;
        }
    }

    // ---------------------------------------------------------------- カード プレビュー

    private void ShowManifestPreview()
    {
        if (_plugin?.Manifest == null)
        {
            ShowEmptyProgram("manifest.json を読めません", _plugin?.LoadError ?? "");
            return;
        }
        var p = _plugin;
        Color accent;
        try { accent = (Color)ColorConverter.ConvertFromString(p.Get("accentColor")); } catch { accent = Color.FromRgb(0x2C, 0x8D, 0xF3); }

        var card = new Border
        {
            Width = 460,
            Background = Brushes.White,
            CornerRadius = new CornerRadius(10),
            Effect = new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 30, ShadowDepth = 6, Opacity = 0.45, Color = Colors.Black },
            ClipToBounds = true,
        };
        var stack = new StackPanel();
        stack.Children.Add(new Border { Height = 6, Background = new SolidColorBrush(accent), CornerRadius = new CornerRadius(10, 10, 0, 0) });
        var body = new StackPanel { Margin = new Thickness(22, 18, 22, 20) };

        var head = new DockPanel();
        var iconPath = Path.Combine(p.Dir, p.Get("icons.color") is { Length: > 0 } c ? c : "color.png");
        var icon = new Border { Width = 58, Height = 58, CornerRadius = new CornerRadius(12), Background = new SolidColorBrush(accent), ClipToBounds = true, Margin = new Thickness(0, 0, 14, 0) };
        if (LoadImage(iconPath) is { } img) icon.Child = new Image { Source = img, Stretch = Stretch.UniformToFill };
        DockPanel.SetDock(icon, Dock.Left);
        head.Children.Add(icon);
        var ver = new Border { Background = Ui.Hex("#EEF3F8"), CornerRadius = new CornerRadius(9), Padding = new Thickness(8, 1, 8, 1), VerticalAlignment = VerticalAlignment.Top, Child = new TextBlock { Text = "v" + p.Version, FontSize = 11, Foreground = Ui.Hex("#3D5A80"), FontFamily = Ui.F("MonoFont") } };
        DockPanel.SetDock(ver, Dock.Right);
        head.Children.Add(ver);
        var names = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        names.Children.Add(new TextBlock { Text = p.Get("name.short"), FontSize = 19, FontWeight = FontWeights.SemiBold, Foreground = Ui.Hex("#1B1B1B"), TextTrimming = TextTrimming.CharacterEllipsis });
        names.Children.Add(new TextBlock { Text = p.Get("developer.name"), FontSize = 12, Foreground = Ui.Hex("#6B6B6B"), TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(0, 2, 0, 0) });
        head.Children.Add(names);
        body.Children.Add(head);

        body.Children.Add(new TextBlock { Text = p.Get("description.short"), FontSize = 13.5, Foreground = Ui.Hex("#242424"), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 16, 0, 0) });
        body.Children.Add(new TextBlock { Text = p.Get("description.full"), FontSize = 12, Foreground = Ui.Hex("#5C5C5C"), TextWrapping = TextWrapping.Wrap, MaxHeight = 90, TextTrimming = TextTrimming.WordEllipsis, Margin = new Thickness(0, 8, 0, 0), LineHeight = 18 });

        body.Children.Add(new TextBlock { Text = "スキル", FontSize = 11, FontWeight = FontWeights.SemiBold, Foreground = Ui.Hex("#8A8A8A"), Margin = new Thickness(0, 16, 0, 6) });
        var chips = new WrapPanel();
        foreach (var s in p.SkillFolders())
            chips.Children.Add(new Border
            {
                Background = new SolidColorBrush(Color.FromArgb(0x1C, accent.R, accent.G, accent.B)),
                BorderBrush = new SolidColorBrush(Color.FromArgb(0x55, accent.R, accent.G, accent.B)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(12),
                Padding = new Thickness(10, 3, 10, 3),
                Margin = new Thickness(0, 0, 6, 6),
                Child = new TextBlock { Text = Path.GetFileName(s.TrimEnd('/')), FontSize = 11.5, Foreground = Ui.Hex("#22324A") },
            });
        body.Children.Add(chips);

        body.Children.Add(new TextBlock { Text = "コネクタ", FontSize = 11, FontWeight = FontWeights.SemiBold, Foreground = Ui.Hex("#8A8A8A"), Margin = new Thickness(0, 10, 0, 6) });
        foreach (var con in p.Connectors())
        {
            var url = con["toolSource"]?["remoteMcpServer"]?["mcpServerUrl"]?.GetValue<string>() ?? "";
            var auth = con["toolSource"]?["remoteMcpServer"]?["authorization"]?["type"]?.GetValue<string>() ?? "";
            var row = new DockPanel { Margin = new Thickness(0, 0, 0, 4) };
            var lock_ = new TextBlock { Text = "\uE72E", FontFamily = Ui.F("IconFont"), Foreground = Ui.Hex("#3D7A4E"), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 8, 0) };
            DockPanel.SetDock(lock_, Dock.Left);
            row.Children.Add(lock_);
            var a = new TextBlock { Text = auth, FontSize = 11, Foreground = Ui.Hex("#8A8A8A"), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(8, 0, 0, 0) };
            DockPanel.SetDock(a, Dock.Right);
            row.Children.Add(a);
            var sp = new StackPanel();
            sp.Children.Add(new TextBlock { Text = con["displayName"]?.GetValue<string>() ?? "", FontSize = 12.5, FontWeight = FontWeights.SemiBold, Foreground = Ui.Hex("#1B1B1B") });
            sp.Children.Add(new TextBlock { Text = Uri.TryCreate(url, UriKind.Absolute, out var u) ? u.Host + u.AbsolutePath : url, FontSize = 11, Foreground = Ui.Hex("#6B6B6B"), FontFamily = Ui.F("MonoFont"), TextTrimming = TextTrimming.CharacterEllipsis });
            row.Children.Add(sp);
            body.Children.Add(row);
        }
        stack.Children.Add(body);
        card.Child = stack;

        var stage = new Grid { Background = Ui.Checker() };
        stage.Children.Add(SafeFrame());
        var viewbox = new Viewbox { Stretch = Stretch.Uniform, StretchDirection = StretchDirection.DownOnly, Margin = new Thickness(40), Child = card };
        stage.Children.Add(viewbox);
        stage.Children.Add(Corner("COWORK カード プレビュー", HorizontalAlignment.Left, VerticalAlignment.Top));
        stage.Children.Add(Corner(_manifestDirty ? "● 未保存" : "保存済み", HorizontalAlignment.Right, VerticalAlignment.Top, _manifestDirty ? "Warn" : "TextFaint"));
        SetProgram(stage, $"manifest.json — {p.Get("name.full")}", SequenceMetaText());
    }

    private static UIElement SafeFrame() => new Shapes.Rectangle
    {
        Stroke = Ui.Hex("#3A3A3A"),
        StrokeThickness = 1,
        StrokeDashArray = new DoubleCollection { 4, 4 },
        Margin = new Thickness(26),
        IsHitTestVisible = false,
    };

    private static UIElement Corner(string text, HorizontalAlignment h, VerticalAlignment v, string brush = "TextFaint") =>
        new TextBlock { Text = text, FontSize = 10.5, FontFamily = Ui.F("MonoFont"), Foreground = Ui.B(brush), HorizontalAlignment = h, VerticalAlignment = v, Margin = new Thickness(30, 8, 30, 8) };

    private static BitmapImage? LoadImage(string path)
    {
        if (!File.Exists(path)) return null;
        try
        {
            var img = new BitmapImage();
            img.BeginInit();
            img.CacheOption = BitmapCacheOption.OnLoad;
            img.CreateOptions = BitmapCreateOptions.IgnoreImageCache;
            img.UriSource = new Uri(path);
            img.EndInit();
            img.Freeze();
            return img;
        }
        catch { return null; }
    }

    // ---------------------------------------------------------------- アイコン

    private void ShowIcons()
    {
        if (_plugin == null) return;
        var color = Path.Combine(_plugin.Dir, _plugin.Get("icons.color") is { Length: > 0 } c ? c : "color.png");
        var outline = Path.Combine(_plugin.Dir, _plugin.Get("icons.outline") is { Length: > 0 } o ? o : "outline.png");
        var row = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        UIElement Tile(string path, double size, int required, string bg, string label)
        {
            var img = LoadImage(path);
            var dim = PluginProject.ImageSize(path);
            var ok = dim is { } d && d.W == required && d.H == required;
            var sp = new StackPanel { Margin = new Thickness(14, 0, 14, 0), VerticalAlignment = VerticalAlignment.Bottom };
            sp.Children.Add(new Border
            {
                Width = size + 16,
                Height = size + 16,
                Background = Ui.Hex(bg),
                CornerRadius = new CornerRadius(4),
                BorderBrush = Ui.B("Line"),
                BorderThickness = new Thickness(1),
                Child = img == null ? Ui.Icon("\uE783", 20, "Danger") : new Image { Source = img, Width = size, Height = size, Stretch = Stretch.Uniform },
            });
            var t = Ui.T(label, 11.5, "TextBright", FontWeights.SemiBold, margin: new Thickness(0, 8, 0, 0));
            t.HorizontalAlignment = HorizontalAlignment.Center;
            sp.Children.Add(t);
            var m = Ui.T(dim is { } dd ? $"{dd.W}×{dd.H} {(ok ? "✓" : $"（{required}×{required} にする）")}" : "なし", 11, ok ? "Ok" : "Danger", mono: true);
            m.HorizontalAlignment = HorizontalAlignment.Center;
            sp.Children.Add(m);
            return sp;
        }
        row.Children.Add(Tile(color, 192, 192, "#2A2A2A", "color 192"));
        row.Children.Add(Tile(color, 96, 192, "#2A2A2A", "96 表示"));
        row.Children.Add(Tile(color, 48, 192, "#2A2A2A", "48 表示"));
        row.Children.Add(Tile(outline, 32, 32, "#1A1A1A", "outline 暗"));
        row.Children.Add(Tile(outline, 32, 32, "#F2F2F2", "outline 明"));
        var stage = new Grid { Background = Ui.Checker() };
        stage.Children.Add(SafeFrame());
        stage.Children.Add(new Viewbox { Stretch = Stretch.Uniform, StretchDirection = StretchDirection.DownOnly, Margin = new Thickness(40), Child = row });
        stage.Children.Add(Corner("アイコン — 要件: color 192×192 / outline 32×32（透過）", HorizontalAlignment.Left, VerticalAlignment.Top));
        SetProgram(stage, "アイコン", SequenceMetaText());
    }

    // ---------------------------------------------------------------- Markdown・コード

    private void ShowMarkdown(ProjectFile f)
    {
        var text = File.ReadAllText(f.FullPath);
        var doc = RenderMarkdown(text);
        var viewer = new FlowDocumentScrollViewer
        {
            Document = doc,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            IsToolBarVisible = false,
            Background = Ui.Hex("#1A1A1A"),
        };
        SetProgram(viewer, f.RelPath + " — 表示", $"{text.Split('\n').Length} 行");
    }

    private void ShowCode(ProjectFile f)
    {
        var box = new TextBox
        {
            Text = File.Exists(f.FullPath) ? File.ReadAllText(f.FullPath) : "",
            IsReadOnly = true,
            FontFamily = Ui.F("MonoFont"),
            FontSize = 12,
            Background = Ui.Hex("#1A1A1A"),
            BorderThickness = new Thickness(0),
            Padding = new Thickness(14, 10, 14, 10),
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
        };
        SetProgram(box, f.RelPath, $"{box.Text.Length:N0} 文字");
    }

    private static FlowDocument RenderMarkdown(string text)
    {
        var doc = new FlowDocument
        {
            Background = Ui.Hex("#1A1A1A"),
            Foreground = Ui.B("Text"),
            FontFamily = Ui.F("UiFont"),
            FontSize = 13,
            PagePadding = new Thickness(28, 20, 28, 28),
            LineHeight = 21,
        };
        var lines = text.Replace("\r\n", "\n").Split('\n');
        var i = 0;
        if (lines.Length > 0 && lines[0].Trim() == "---")
        {
            var table = new Table { CellSpacing = 0, Margin = new Thickness(0, 0, 0, 16), BorderBrush = Ui.B("Line"), BorderThickness = new Thickness(1), Background = Ui.Hex("#202020") };
            table.Columns.Add(new TableColumn { Width = new GridLength(110) });
            table.Columns.Add(new TableColumn());
            var group = new TableRowGroup();
            for (i = 1; i < lines.Length && lines[i].Trim() != "---"; i++)
            {
                var idx = lines[i].IndexOf(':');
                if (idx <= 0) continue;
                var row = new TableRow();
                row.Cells.Add(new TableCell(new Paragraph(new Run(lines[i][..idx].Trim())) { Foreground = Ui.B("TextDim"), FontFamily = Ui.F("MonoFont"), FontSize = 11.5 }) { Padding = new Thickness(10, 4, 10, 4) });
                row.Cells.Add(new TableCell(new Paragraph(new Run(lines[i][(idx + 1)..].Trim())) { FontSize = 12 }) { Padding = new Thickness(10, 4, 10, 4) });
                group.Rows.Add(row);
            }
            table.RowGroups.Add(group);
            doc.Blocks.Add(table);
            i++;
        }
        var code = new List<string>();
        var inCode = false;
        for (; i < lines.Length; i++)
        {
            var line = lines[i];
            if (line.TrimStart().StartsWith("```"))
            {
                if (inCode)
                {
                    doc.Blocks.Add(new Paragraph(new Run(string.Join("\n", code)))
                    {
                        FontFamily = Ui.F("MonoFont"),
                        FontSize = 11.5,
                        Background = Ui.Hex("#111111"),
                        Padding = new Thickness(12, 8, 12, 8),
                        Foreground = Ui.Hex("#C8D3DF"),
                        LineHeight = 17,
                    });
                    code.Clear();
                }
                inCode = !inCode;
                continue;
            }
            if (inCode) { code.Add(line); continue; }
            if (line.Trim().Length == 0) continue;
            var h = Regex.Match(line, @"^(#{1,4})\s+(.*)");
            if (h.Success)
            {
                var level = h.Groups[1].Length;
                var para = Inline(h.Groups[2].Value);
                para.FontSize = level switch { 1 => 22, 2 => 17, 3 => 14.5, _ => 13.5 };
                para.FontWeight = FontWeights.SemiBold;
                para.Foreground = Ui.B("TextBright");
                para.Margin = new Thickness(0, level <= 2 ? 18 : 12, 0, 6);
                if (level <= 2) { para.BorderBrush = Ui.B("Line"); para.BorderThickness = new Thickness(0, 0, 0, 1); para.Padding = new Thickness(0, 0, 0, 4); }
                doc.Blocks.Add(para);
                continue;
            }
            var li = Regex.Match(line, @"^(\s*)([-*]|\d+\.)\s+(.*)");
            if (li.Success)
            {
                var para = Inline(li.Groups[3].Value);
                var bullet = li.Groups[2].Value.EndsWith('.') ? li.Groups[2].Value + " " : "•  ";
                para.Inlines.InsertBefore(para.Inlines.FirstInline, new Run(bullet) { Foreground = Ui.B("Accent") });
                para.Margin = new Thickness(14 + li.Groups[1].Length * 8, 0, 0, 3);
                doc.Blocks.Add(para);
                continue;
            }
            if (line.TrimStart().StartsWith('|'))
            {
                doc.Blocks.Add(new Paragraph(new Run(line)) { FontFamily = Ui.F("MonoFont"), FontSize = 11, Foreground = Ui.B("TextDim"), Margin = new Thickness(0), LineHeight = 16 });
                continue;
            }
            if (line.StartsWith('>'))
            {
                var para = Inline(line.TrimStart('>', ' '));
                para.BorderBrush = Ui.B("Accent");
                para.BorderThickness = new Thickness(3, 0, 0, 0);
                para.Padding = new Thickness(10, 2, 0, 2);
                para.Foreground = Ui.B("TextDim");
                doc.Blocks.Add(para);
                continue;
            }
            var p = Inline(line);
            p.Margin = new Thickness(0, 0, 0, 8);
            doc.Blocks.Add(p);
        }
        return doc;
    }

    private static Paragraph Inline(string text)
    {
        var p = new Paragraph();
        foreach (Match m in Regex.Matches(text, @"(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|[^*`\[]+|[*`\[])"))
        {
            var t = m.Value;
            if (t.StartsWith("**") && t.EndsWith("**") && t.Length > 4) p.Inlines.Add(new Bold(new Run(t[2..^2])) { Foreground = Ui.B("TextBright") });
            else if (t.StartsWith('`') && t.EndsWith('`') && t.Length > 2) p.Inlines.Add(new Run(t[1..^1]) { FontFamily = Ui.F("MonoFont"), FontSize = 12, Background = Ui.Hex("#2A2A2A"), Foreground = Ui.Hex("#E6C07B") });
            else if (Regex.Match(t, @"^\[([^\]]+)\]\(([^)]+)\)$") is { Success: true } link) p.Inlines.Add(new Run(link.Groups[1].Value) { Foreground = Ui.B("AccentHover"), TextDecorations = TextDecorations.Underline });
            else p.Inlines.Add(new Run(t));
        }
        return p;
    }

    // ---------------------------------------------------------------- ステップ・計画

    private void ShowProgramForStep(StepModel s)
    {
        if (_plan?.StepId == s.Id) { ShowPlan(_plan); return; }
        var stage = new Grid { Background = Ui.Checker("#171717", "#1A1A1A", 18) };
        stage.Children.Add(SafeFrame());
        var sp = new StackPanel { VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center, MaxWidth = 620, Margin = new Thickness(40) };
        sp.Children.Add(new Border { Width = 56, Height = 4, Background = new SolidColorBrush(s.Label), HorizontalAlignment = HorizontalAlignment.Left, CornerRadius = new CornerRadius(2) });
        sp.Children.Add(Ui.T($"STEP {s.Index + 1:00}  ·  {s.Track}  ·  {s.TrackName}", 11.5, "TextFaint", mono: true, margin: new Thickness(0, 12, 0, 4)));
        sp.Children.Add(Ui.T(s.Title, 30, "TextBright", FontWeights.SemiBold));
        var badge = Ui.Badge(s.State);
        badge.Margin = new Thickness(0, 10, 0, 0);
        sp.Children.Add(badge);
        sp.Children.Add(Ui.T(s.Detail.Length > 0 ? s.Detail : s.Description, 13, "Text", wrap: true, margin: new Thickness(0, 14, 0, 22)));

        // 全体の流れ（ノードと線）
        var flow = new Grid { Margin = new Thickness(0, 6, 0, 0), MinWidth = 560 };
        for (var k = 0; k < _steps.Count; k++) flow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        foreach (var st in _steps)
        {
            var col = new Grid();
            var c = Ui.StateColor(st.State);
            var node = new Border
            {
                Width = st.Id == s.Id ? 24 : 20,
                Height = st.Id == s.Id ? 24 : 20,
                CornerRadius = new CornerRadius(12),
                Background = st.State == StepState.Done ? new SolidColorBrush(st.Label) : Ui.Hex("#202020"),
                BorderBrush = st.Id == s.Id ? Brushes.White : new SolidColorBrush(st.State == StepState.Done ? st.Label : c),
                BorderThickness = new Thickness(st.Id == s.Id ? 2 : 1.5),
                VerticalAlignment = VerticalAlignment.Top,
                HorizontalAlignment = HorizontalAlignment.Center,
                Child = new TextBlock { Text = Ui.StateGlyph(st.State), FontFamily = Ui.F("IconFont"), FontSize = 9.5, Foreground = st.State == StepState.Done ? Brushes.White : new SolidColorBrush(c), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
            };
            var label = Ui.T(st.TrackName, 10.5, st.Id == s.Id ? "TextBright" : "TextFaint", margin: new Thickness(0, 30, 0, 0));
            label.HorizontalAlignment = HorizontalAlignment.Center;
            col.Children.Add(node);
            col.Children.Add(label);
            Grid.SetColumn(col, st.Index);
            flow.Children.Add(col);
        }
        // 線はノードの後ろに 1 本で引く
        var line = new Border { Height = 2, Background = Ui.B("Line"), VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 10, 0, 0) };
        Grid.SetColumnSpan(line, _steps.Count);
        flow.Children.Insert(0, line);
        // 最初と最後のノードの中心を結ぶ（列幅の半分ずつ内側）
        flow.SizeChanged += (_, e) => line.Margin = new Thickness(e.NewSize.Width / (_steps.Count * 2.0), 10, e.NewSize.Width / (_steps.Count * 2.0), 0);
        sp.Children.Add(flow);

        stage.Children.Add(sp);
        stage.Children.Add(Corner($"{s.Index + 1}/{_steps.Count}  {s.Title}", HorizontalAlignment.Left, VerticalAlignment.Top));
        SetProgram(stage, $"ステップ {s.Index + 1} — {s.Title}", SequenceMetaText());
    }

    private void ShowPlan(PendingPlan plan)
    {
        var dock = new DockPanel { Background = Ui.Hex("#1A1A1A") };
        var head = new Border { Background = Ui.Hex("#15283D"), BorderBrush = Ui.B("Accent"), BorderThickness = new Thickness(0, 0, 0, 1), Padding = new Thickness(16, 10, 16, 10) };
        var hs = new StackPanel();
        hs.Children.Add(Ui.T("承認待ちの計画（dry-run）", 11, "AccentHover", FontWeights.SemiBold));
        hs.Children.Add(Ui.T(plan.Summary, 14, "TextBright", FontWeights.SemiBold, wrap: true, margin: new Thickness(0, 3, 0, 4)));
        hs.Children.Add(Ui.T($"PLAN_HASH {plan.Hash}", 11.5, "Accent", mono: true));
        head.Child = hs;
        DockPanel.SetDock(head, Dock.Top);
        dock.Children.Add(head);
        dock.Children.Add(new TextBox
        {
            Text = plan.Text,
            IsReadOnly = true,
            FontFamily = Ui.F("MonoFont"),
            FontSize = 12,
            Background = Ui.Hex("#1A1A1A"),
            BorderThickness = new Thickness(0),
            Padding = new Thickness(16, 10, 16, 10),
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
        });
        SetProgram(dock, "計画の内容 — 秘密の値はハッシュで表示", "PLAN " + plan.Hash[..8]);
    }

    // ---------------------------------------------------------------- 出力の概要

    private void ShowExportSummary()
    {
        if (_plugin == null) return;
        var zip = _plugin.LatestZip();
        var stage = new Grid { Background = Ui.Checker() };
        stage.Children.Add(SafeFrame());
        var sp = new StackPanel { Margin = new Thickness(48, 44, 48, 40), MaxWidth = 720 };
        sp.Children.Add(Ui.T("パッケージの中身", 11, "TextFaint", FontWeights.SemiBold, mono: true));
        if (zip == null)
        {
            sp.Children.Add(Ui.T("まだ ZIP がありません", 20, "TextBright", FontWeights.SemiBold, margin: new Thickness(0, 6, 0, 6)));
            sp.Children.Add(Ui.T("出力キューで「Cowork パッケージ」を追加して開始すると、ここに中身が表示されます。", 12.5, "TextDim", wrap: true));
        }
        else
        {
            sp.Children.Add(Ui.T(zip.Name, 20, "TextBright", FontWeights.SemiBold, margin: new Thickness(0, 6, 0, 2)));
            sp.Children.Add(Ui.T($"{zip.Length / 1024.0:0.0} KB · {zip.LastWriteTime:yyyy/MM/dd HH:mm:ss} · SHA-256 {PluginProject.Sha256(zip.FullName)[..16]}…", 11.5, "TextDim", mono: true, margin: new Thickness(0, 0, 0, 14)));
            try
            {
                using var archive = ZipFile.OpenRead(zip.FullName);
                foreach (var entry in archive.Entries.OrderBy(e => e.FullName))
                {
                    var row = new DockPanel { Margin = new Thickness(0, 0, 0, 3) };
                    var size = Ui.T($"{entry.Length:N0} B", 11.5, "TextFaint", mono: true);
                    DockPanel.SetDock(size, Dock.Right);
                    row.Children.Add(size);
                    var ic = Ui.Icon(entry.FullName.EndsWith(".png") ? "\uEB9F" : entry.FullName.EndsWith(".md") ? "\uE8A5" : "\uE943", 12, "TextDim");
                    ic.Margin = new Thickness(0, 0, 8, 0);
                    DockPanel.SetDock(ic, Dock.Left);
                    row.Children.Add(ic);
                    row.Children.Add(Ui.T(entry.FullName, 12, "Text", mono: true));
                    sp.Children.Add(row);
                }
            }
            catch (Exception ex) { sp.Children.Add(Ui.T(ex.Message, 12, "Danger", wrap: true)); }
            foreach (var i in PluginProject.InspectZip(zip.FullName))
            {
                var r = Ui.IssueRow(i);
                ((FrameworkElement)r).Margin = new Thickness(0, 10, 0, 0);
                sp.Children.Add(r);
            }
        }
        stage.Children.Add(new ScrollViewer { Content = sp, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        SetProgram(stage, "出力 — 最新のパッケージ", SequenceMetaText());
    }
}

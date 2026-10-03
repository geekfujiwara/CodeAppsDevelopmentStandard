using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shell;

namespace CoworkStudio;

/// <summary>暗いテーマの確認ダイアログ（承認・上書き確認）。</summary>
internal sealed class StudioDialog : Window
{
    private bool _ok;

    private StudioDialog(Window owner, string title, string message, string? details, string okText, bool danger, string? cancelText)
    {
        Owner = owner;
        Title = title;
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        SizeToContent = SizeToContent.WidthAndHeight;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;
        Background = Ui.B("Bg0");
        FontFamily = Ui.F("UiFont");
        Foreground = Ui.B("Text");
        WindowChrome.SetWindowChrome(this, new WindowChrome { CaptionHeight = 34, GlassFrameThickness = new Thickness(0), ResizeBorderThickness = new Thickness(0) });

        var root = new StackPanel { Width = 480 };
        var head = new Border { Height = 34, Background = Ui.B("PanelHeader"), Padding = new Thickness(14, 0, 14, 0) };
        head.Child = Ui.T(title, 12.5, "TextBright", FontWeights.SemiBold);
        ((TextBlock)head.Child).VerticalAlignment = VerticalAlignment.Center;
        root.Children.Add(head);

        var body = new StackPanel { Margin = new Thickness(18, 16, 18, 8) };
        body.Children.Add(Ui.T(message, 13, "Text", wrap: true));
        if (!string.IsNullOrEmpty(details))
        {
            body.Children.Add(new Border
            {
                Margin = new Thickness(0, 12, 0, 0),
                Padding = new Thickness(10, 8, 10, 8),
                Background = Ui.B("Field"),
                BorderBrush = Ui.B("Line"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(3),
                Child = Ui.T(details, 11.5, "TextDim", wrap: true, mono: true),
            });
        }
        root.Children.Add(body);

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(18, 8, 18, 16) };
        if (cancelText != null)
        {
            var cancel = new Button { Content = cancelText, MinWidth = 96, Margin = new Thickness(0, 0, 8, 0), IsCancel = true };
            cancel.Click += (_, _) => Close();
            buttons.Children.Add(cancel);
        }
        var ok = new Button { Content = okText, MinWidth = 120, IsDefault = true, Style = (Style)Application.Current.Resources[danger ? "DangerButton" : "Primary"] };
        ok.Click += (_, _) => { _ok = true; Close(); };
        buttons.Children.Add(ok);
        root.Children.Add(buttons);

        Content = new Border { BorderBrush = Ui.B("LineHi"), BorderThickness = new Thickness(1), Child = root };
        PreviewKeyDown += (_, e) => { if (e.Key == Key.Escape) Close(); };
    }

    public static bool Confirm(Window owner, string title, string message, string? details = null, string okText = "実行", bool danger = false, string cancelText = "キャンセル")
    {
        if (App.Options.Unattended) return false;
        var d = new StudioDialog(owner, title, message, details, okText, danger, cancelText);
        d.ShowDialog();
        return d._ok;
    }

    public static void Info(Window owner, string title, string message, string? details = null)
    {
        if (App.Options.Unattended) return;
        new StudioDialog(owner, title, message, details, "閉じる", false, null).ShowDialog();
    }
}

/// <summary>初回サインインのデバイス コード。コードを自動でコピーし、ブラウザを開くボタンを出す。</summary>
internal sealed class DeviceCodeWindow : Window
{
    public const string DeviceUrl = "https://login.microsoft.com/device";

    public DeviceCodeWindow(Window owner, string code, string context)
    {
        Owner = owner;
        Title = "サインイン";
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        SizeToContent = SizeToContent.WidthAndHeight;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;
        Topmost = true;
        Background = Ui.B("Bg0");
        FontFamily = Ui.F("UiFont");
        WindowChrome.SetWindowChrome(this, new WindowChrome { CaptionHeight = 34, GlassFrameThickness = new Thickness(0), ResizeBorderThickness = new Thickness(0) });

        try { Clipboard.SetText(code); } catch { }

        var root = new StackPanel { Width = 440 };
        var head = new Border { Height = 34, Background = Ui.B("PanelHeader"), Padding = new Thickness(14, 0, 14, 0) };
        var title = Ui.T("サインインが必要です（初回だけ）", 12.5, "TextBright", FontWeights.SemiBold);
        title.VerticalAlignment = VerticalAlignment.Center;
        head.Child = title;
        root.Children.Add(head);

        var body = new StackPanel { Margin = new Thickness(20, 16, 20, 6) };
        body.Children.Add(Ui.T(context, 12, "TextDim", wrap: true));
        body.Children.Add(Ui.T("ブラウザでサインイン ページを開き、次のコードを入力してください。コードはコピー済みです。", 13, "Text", wrap: true, margin: new Thickness(0, 8, 0, 14)));
        var codeBox = new Border
        {
            Background = Ui.B("Field"),
            BorderBrush = Ui.B("Accent"),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(4),
            Padding = new Thickness(0, 10, 0, 10),
            Child = new TextBlock
            {
                Text = string.Join(" ", code.ToCharArray()),
                FontFamily = Ui.F("MonoFont"),
                FontSize = 28,
                FontWeight = FontWeights.SemiBold,
                Foreground = Ui.B("TextBright"),
                HorizontalAlignment = HorizontalAlignment.Center,
            },
        };
        body.Children.Add(codeBox);
        body.Children.Add(Ui.T("サインインが終わると、この画面は自動で閉じます。", 11.5, "TextFaint", wrap: true, margin: new Thickness(0, 12, 0, 0)));
        root.Children.Add(body);

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(20, 12, 20, 18) };
        var copy = new Button { Content = "コードをコピー", Margin = new Thickness(0, 0, 8, 0) };
        copy.Click += (_, _) => { try { Clipboard.SetText(code); } catch { } };
        var open = new Button { Content = "ブラウザで開く", Style = (Style)Application.Current.Resources["Primary"], IsDefault = true };
        open.Click += (_, _) => Process.Start(new ProcessStartInfo(DeviceUrl) { UseShellExecute = true });
        buttons.Children.Add(copy);
        buttons.Children.Add(open);
        root.Children.Add(buttons);
        Content = new Border { BorderBrush = Ui.B("LineHi"), BorderThickness = new Thickness(1), Child = root };
    }
}

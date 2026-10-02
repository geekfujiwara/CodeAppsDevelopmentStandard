using System.Windows;
using System.Windows.Threading;

namespace CoworkStudio;

public partial class App : Application
{
    public static StudioOptions Options { get; private set; } = new();

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        Options = StudioOptions.Parse(e.Args);
        DispatcherUnhandledException += OnUnhandled;
        new MainWindow().Show();
    }

    private static void OnUnhandled(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        Core.StateStore.WriteCrash(e.Exception);
        if (!Options.Unattended)
            MessageBox.Show(e.Exception.Message, "Cowork Studio", MessageBoxButton.OK, MessageBoxImage.Error);
        e.Handled = true;
        if (Options.Unattended) Current.Shutdown(3);
    }
}

/// <summary>起動引数。画面を開かずに検証・撮影するための引数も持つ。</summary>
public sealed class StudioOptions
{
    public string? Root { get; set; }
    public string? Plugin { get; set; }
    public string Workspace { get; set; } = "pipeline";
    public string? Select { get; set; }
    public bool NoRefresh { get; set; }
    public string? Screenshot { get; set; }
    public string? SelfTest { get; set; }
    public string? Export { get; set; }
    public string? Out { get; set; }
    public int Width { get; set; } = 1600;
    public int Height { get; set; } = 960;
    public bool Unattended => Screenshot != null || SelfTest != null || Export != null;

    public static StudioOptions Parse(string[] args)
    {
        var o = new StudioOptions();
        for (var i = 0; i < args.Length; i++)
        {
            string Next() => i + 1 < args.Length ? args[++i] : "";
            switch (args[i])
            {
                case "--root": o.Root = Next(); break;
                case "--plugin": o.Plugin = Next(); break;
                case "--workspace": o.Workspace = Next(); break;
                case "--select": o.Select = Next(); break;
                case "--no-refresh": o.NoRefresh = true; break;
                case "--screenshot": o.Screenshot = Next(); break;
                case "--selftest": o.SelfTest = Next(); break;
                case "--export": o.Export = Next(); break;
                case "--out": o.Out = Next(); break;
                case "--size":
                    var parts = Next().Split('x');
                    if (parts.Length == 2 && int.TryParse(parts[0], out var w) && int.TryParse(parts[1], out var h)) { o.Width = w; o.Height = h; }
                    break;
            }
        }
        return o;
    }
}

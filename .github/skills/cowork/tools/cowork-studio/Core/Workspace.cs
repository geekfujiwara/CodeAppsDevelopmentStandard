using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace CoworkStudio.Core;

public static class WorkspaceLocator
{
    public const string Marker = ".github/skills/cowork/scripts/diagnose_cowork_connector.py";
    private static readonly HashSet<string> SkipDirs = new(StringComparer.OrdinalIgnoreCase)
    {
        "node_modules", ".git", ".github", "dist", "bin", "obj", "publish", "templates", "samples", ".venv", "generated", ".power",
    };

    /// <summary>cowork スキルのスクリプトがあるフォルダ（リポジトリ ルート）を、指定・作業フォルダ・exe の場所から上にたどって探す。</summary>
    public static string? FindRoot(string? hint)
    {
        foreach (var start in new[] { hint, Environment.CurrentDirectory, AppContext.BaseDirectory })
        {
            if (string.IsNullOrWhiteSpace(start)) continue;
            var dir = new DirectoryInfo(Path.GetFullPath(start));
            while (dir != null)
            {
                if (File.Exists(Path.Combine(dir.FullName, Marker))) return dir.FullName;
                dir = dir.Parent;
            }
        }
        return null;
    }

    public static bool IsRoot(string dir) => File.Exists(Path.Combine(dir, Marker));

    /// <summary>agentSkills / agentConnectors を持つ manifest.json のあるフォルダ（テンプレートと生成物は除く）。</summary>
    public static List<string> FindPlugins(string root)
    {
        var found = new List<string>();
        void Walk(string dir, int depth)
        {
            if (depth > 4) return;
            var manifest = Path.Combine(dir, "manifest.json");
            if (File.Exists(manifest))
            {
                try
                {
                    var text = File.ReadAllText(manifest);
                    if (text.Contains("\"agentSkills\"") || text.Contains("\"agentConnectors\"")) found.Add(dir);
                }
                catch (IOException) { }
            }
            IEnumerable<string> subs;
            try { subs = Directory.EnumerateDirectories(dir); } catch { return; }
            foreach (var sub in subs)
            {
                var name = Path.GetFileName(sub);
                if (SkipDirs.Contains(name) || name.StartsWith('.')) continue;
                Walk(sub, depth + 1);
            }
        }
        Walk(root, 0);
        return found.OrderBy(p => p, StringComparer.OrdinalIgnoreCase).ToList();
    }
}

/// <summary>プラグインごとの画面の状態（個人インストールの titleId、公開の記録）。リポジトリには置かない。</summary>
public sealed class PluginState
{
    public string? PersonalTitleId { get; set; }
    public string? InstalledVersion { get; set; }
    public bool Published { get; set; }
    public string? PublishedVersion { get; set; }
    public DateTime? PublishedAt { get; set; }
    public string? OutputName { get; set; }
    public string? ExportFolder { get; set; }
    public List<string> History { get; set; } = new();
}

public static class StateStore
{
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    public static string BaseDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CoworkStudio");

    private static string PathFor(string root, string plugin)
    {
        var hash = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(root.ToLowerInvariant())))[..10];
        return Path.Combine(BaseDir, "state", hash, plugin + ".json");
    }

    public static PluginState Load(string root, string plugin)
    {
        var path = PathFor(root, plugin);
        try { return File.Exists(path) ? JsonSerializer.Deserialize<PluginState>(File.ReadAllText(path)) ?? new() : new(); }
        catch { return new(); }
    }

    public static void Save(string root, string plugin, PluginState state)
    {
        var path = PathFor(root, plugin);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        if (state.History.Count > 200) state.History = state.History.TakeLast(200).ToList();
        File.WriteAllText(path, JsonSerializer.Serialize(state, Json));
    }

    public static void WriteCrash(Exception ex)
    {
        try
        {
            Directory.CreateDirectory(BaseDir);
            File.AppendAllText(Path.Combine(BaseDir, "crash.log"), $"[{DateTime.Now:O}] {ex}\n\n");
        }
        catch { }
    }
}

using System.IO;
using System.Text.RegularExpressions;

namespace CoworkStudio.Core;

/// <summary>リポジトリ ルートの .env。秘密の値はコンソールに出す前に伏せる。</summary>
public sealed class EnvFile
{
    private static readonly Regex SecretKey = new("SECRET|PASSWORD|TICKET|TOKEN|_KEY$|CONNECTION_STRING", RegexOptions.IgnoreCase);

    public string FilePath { get; }
    public Dictionary<string, string> Values { get; } = new(StringComparer.OrdinalIgnoreCase);

    public EnvFile(string path)
    {
        FilePath = path;
        Reload();
    }

    public bool Exists => File.Exists(FilePath);

    public void Reload()
    {
        Values.Clear();
        if (!File.Exists(FilePath)) return;
        foreach (var raw in File.ReadAllLines(FilePath))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            var i = line.IndexOf('=');
            if (i <= 0) continue;
            Values[line[..i].Trim()] = line[(i + 1)..].Trim().Trim('"', '\'');
        }
    }

    public string Get(string key) => Values.TryGetValue(key, out var v) ? v : "";

    public IReadOnlyList<string> SecretValues() =>
        Values.Where(kv => SecretKey.IsMatch(kv.Key) && kv.Value.Length >= 6).Select(kv => kv.Value).ToList();

    public string DataverseHost()
    {
        var url = Get("DATAVERSE_URL");
        return Uri.TryCreate(url, UriKind.Absolute, out var u) ? u.Host : "";
    }

    public static string Mask(string value) => string.IsNullOrEmpty(value) ? "" : value.Length <= 6 ? "••••" : "…" + value[^4..];
}

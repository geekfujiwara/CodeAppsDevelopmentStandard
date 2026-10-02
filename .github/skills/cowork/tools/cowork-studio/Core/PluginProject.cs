using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows.Media.Imaging;

namespace CoworkStudio.Core;

public enum IssueLevel { Ok, Warn, Error }

public sealed record Issue(IssueLevel Level, string Text);

public enum FileKind { Manifest, Skill, ToolsJson, Icon, Markdown, Script, Other }

public sealed record ProjectFile(FileKind Kind, string RelPath, string FullPath)
{
    public bool IsText => Kind is not FileKind.Icon;
}

/// <summary>Cowork プラグインのフォルダ（manifest.json・skills・アイコン・ツール説明）。</summary>
public sealed class PluginProject
{
    public const string Placeholder = "__COWORK_OAUTH_REGISTRATION_ID__";
    private static readonly JsonSerializerOptions WriteOptions = new() { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    public string Dir { get; }
    public string Name => new DirectoryInfo(Dir).Name;
    public string ManifestPath => Path.Combine(Dir, "manifest.json");
    public JsonObject? Manifest { get; private set; }
    public string? LoadError { get; private set; }

    public PluginProject(string dir) => Dir = dir;

    public void Load()
    {
        try
        {
            Manifest = JsonNode.Parse(File.ReadAllText(ManifestPath), documentOptions: new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip })?.AsObject();
            LoadError = Manifest == null ? "manifest.json が空です" : null;
        }
        catch (Exception ex)
        {
            Manifest = null;
            LoadError = ex.Message;
        }
    }

    public string Get(string path)
    {
        JsonNode? node = Manifest;
        foreach (var part in path.Split('.'))
        {
            if (node is not JsonObject obj || !obj.TryGetPropertyValue(part, out node)) return "";
        }
        return node is JsonValue v && v.TryGetValue<string>(out var s) ? s : node?.ToJsonString() ?? "";
    }

    public void Set(string path, string value)
    {
        if (Manifest == null) return;
        var parts = path.Split('.');
        JsonObject obj = Manifest;
        foreach (var part in parts[..^1])
        {
            if (obj[part] is not JsonObject child)
            {
                child = new JsonObject();
                obj[part] = child;
            }
            obj = child;
        }
        obj[parts[^1]] = value;
    }

    public string ToJson() => (Manifest?.ToJsonString(WriteOptions) ?? "{}") + "\n";

    public void Save() => File.WriteAllText(ManifestPath, ToJson(), new UTF8Encoding(false));

    public string ShortName => Get("name.short") is { Length: > 0 } s ? s : Name;
    public string Version => Get("version");

    public static string BumpPatch(string version)
    {
        var m = Regex.Match(version, @"^(\d+)\.(\d+)\.(\d+)$");
        return m.Success ? $"{m.Groups[1].Value}.{m.Groups[2].Value}.{int.Parse(m.Groups[3].Value) + 1}" : version;
    }

    public IReadOnlyList<string> SkillFolders() =>
        (Manifest?["agentSkills"] as JsonArray)?.Select(n => n?["folder"]?.GetValue<string>() ?? "")
            .Where(s => s.Length > 0).Select(s => s.TrimStart('.', '/', '\\')).ToList() ?? new List<string>();

    public IEnumerable<JsonObject> Connectors() => (Manifest?["agentConnectors"] as JsonArray)?.OfType<JsonObject>() ?? Enumerable.Empty<JsonObject>();

    public List<ProjectFile> Files()
    {
        var list = new List<ProjectFile>();
        void Add(FileKind kind, string full)
        {
            if (File.Exists(full)) list.Add(new ProjectFile(kind, Path.GetRelativePath(Dir, full).Replace('\\', '/'), full));
        }
        Add(FileKind.Manifest, ManifestPath);
        foreach (var folder in SkillFolders()) Add(FileKind.Skill, Path.Combine(Dir, folder, "SKILL.md"));
        foreach (var c in Connectors())
        {
            var file = c["toolSource"]?["remoteMcpServer"]?["mcpToolDescription"]?["file"]?.GetValue<string>();
            if (!string.IsNullOrEmpty(file)) Add(FileKind.ToolsJson, Path.Combine(Dir, file));
        }
        Add(FileKind.Icon, Path.Combine(Dir, Get("icons.color") is { Length: > 0 } col ? col : "color.png"));
        Add(FileKind.Icon, Path.Combine(Dir, Get("icons.outline") is { Length: > 0 } outl ? outl : "outline.png"));
        foreach (var md in Directory.EnumerateFiles(Dir, "*.md").OrderBy(f => f)) Add(FileKind.Markdown, md);
        var scripts = Path.Combine(Dir, "scripts");
        if (Directory.Exists(scripts))
            foreach (var s in Directory.EnumerateFiles(scripts).OrderBy(f => f)) Add(FileKind.Script, s);
        return list.DistinctBy(f => f.FullPath.ToLowerInvariant()).ToList();
    }

    public FileInfo? LatestZip()
    {
        var dist = Path.Combine(Dir, "dist");
        return Directory.Exists(dist) ? new DirectoryInfo(dist).GetFiles("*.zip").OrderByDescending(f => f.LastWriteTimeUtc).FirstOrDefault() : null;
    }

    public DateTime SourcesNewestUtc()
    {
        var files = Files().Where(f => f.Kind is FileKind.Manifest or FileKind.Skill or FileKind.ToolsJson or FileKind.Icon).Select(f => f.FullPath).ToList();
        foreach (var folder in SkillFolders())
        {
            var d = Path.Combine(Dir, folder);
            if (Directory.Exists(d)) files.AddRange(Directory.EnumerateFiles(d, "*", SearchOption.AllDirectories));
        }
        return files.Select(f => File.GetLastWriteTimeUtc(f)).DefaultIfEmpty(DateTime.MinValue).Max();
    }

    public static (int W, int H)? ImageSize(string path)
    {
        try
        {
            using var s = File.OpenRead(path);
            var frame = BitmapDecoder.Create(s, BitmapCreateOptions.DelayCreation, BitmapCacheOption.None).Frames[0];
            return (frame.PixelWidth, frame.PixelHeight);
        }
        catch { return null; }
    }

    public static Dictionary<string, string> FrontMatter(string text)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var lines = text.Replace("\r\n", "\n").Split('\n');
        if (lines.Length == 0 || lines[0].Trim() != "---") return map;
        for (var i = 1; i < lines.Length && lines[i].Trim() != "---"; i++)
        {
            var idx = lines[i].IndexOf(':');
            if (idx > 0 && !lines[i].StartsWith(' ')) map[lines[i][..idx].Trim()] = lines[i][(idx + 1)..].Trim().Trim('"', '\'');
        }
        return map;
    }

    /// <summary>公開前に止めるべき点（Teams / Cowork の manifest 制約とビルドの前提）。</summary>
    public List<Issue> Validate(EnvFile env)
    {
        var r = new List<Issue>();
        if (Manifest == null)
        {
            r.Add(new(IssueLevel.Error, $"manifest.json を読めません: {LoadError}"));
            return r;
        }
        void Len(string path, string label, int max, bool required = true)
        {
            var v = Get(path);
            if (required && v.Length == 0) r.Add(new(IssueLevel.Error, $"{label} が空です"));
            else if (v.Length > max) r.Add(new(IssueLevel.Error, $"{label} が {v.Length} 文字です（{max} 文字以内）"));
            else if (v.Length > 0) r.Add(new(IssueLevel.Ok, $"{label}（{v.Length}/{max}）"));
        }
        if (!Regex.IsMatch(Version, @"^\d+\.\d+\.\d+$")) r.Add(new(IssueLevel.Error, $"version「{Version}」は x.y.z 形式にする"));
        else r.Add(new(IssueLevel.Ok, $"version {Version}"));
        if (!Guid.TryParse(Get("id"), out _)) r.Add(new(IssueLevel.Error, "id が GUID ではありません"));
        Len("name.short", "短い名前", 30);
        Len("name.full", "正式名", 100);
        Len("description.short", "短い説明", 80);
        Len("description.full", "詳しい説明", 4000);
        if (!Regex.IsMatch(Get("accentColor"), "^#[0-9A-Fa-f]{6}$")) r.Add(new(IssueLevel.Warn, "accentColor は #RRGGBB にする"));

        foreach (var (key, size) in new[] { ("color", 192), ("outline", 32) })
        {
            var file = Get($"icons.{key}");
            var full = Path.Combine(Dir, file.Length > 0 ? file : key + ".png");
            var dim = File.Exists(full) ? ImageSize(full) : null;
            if (dim == null) r.Add(new(IssueLevel.Error, $"アイコン {key} がありません"));
            else if (dim.Value.W != size || dim.Value.H != size) r.Add(new(IssueLevel.Error, $"アイコン {key} は {dim.Value.W}×{dim.Value.H}（{size}×{size} にする）"));
            else r.Add(new(IssueLevel.Ok, $"アイコン {key} {size}×{size}"));
        }

        var skills = SkillFolders();
        if (skills.Count == 0) r.Add(new(IssueLevel.Warn, "agentSkills がありません"));
        foreach (var folder in skills)
        {
            var md = Path.Combine(Dir, folder, "SKILL.md");
            if (!File.Exists(md)) { r.Add(new(IssueLevel.Error, $"{folder}/SKILL.md がありません")); continue; }
            var fm = FrontMatter(File.ReadAllText(md));
            var leaf = Path.GetFileName(folder.TrimEnd('/'));
            if (!fm.TryGetValue("name", out var n) || n != leaf) r.Add(new(IssueLevel.Warn, $"{leaf}: frontmatter の name をフォルダ名に合わせる"));
            else if (!fm.ContainsKey("description")) r.Add(new(IssueLevel.Warn, $"{leaf}: description がありません"));
            else r.Add(new(IssueLevel.Ok, $"スキル {leaf}"));
        }

        foreach (var c in Connectors())
        {
            var server = c["toolSource"]?["remoteMcpServer"];
            var reference = server?["authorization"]?["referenceId"]?.GetValue<string>() ?? "";
            var id = c["id"]?.GetValue<string>() ?? "connector";
            if (reference == Placeholder) r.Add(new(IssueLevel.Ok, $"{id}: referenceId はプレースホルダー（ビルドで注入）"));
            else if (reference.Length > 0) r.Add(new(IssueLevel.Warn, $"{id}: referenceId に実値が入っています（{Placeholder} に戻す）"));
            var toolFile = server?["mcpToolDescription"]?["file"]?.GetValue<string>();
            if (!string.IsNullOrEmpty(toolFile))
            {
                var full = Path.Combine(Dir, toolFile);
                try
                {
                    if (!File.Exists(full)) r.Add(new(IssueLevel.Error, $"{toolFile} がありません"));
                    else { JsonNode.Parse(File.ReadAllText(full)); r.Add(new(IssueLevel.Ok, $"{toolFile} は JSON として正しい")); }
                }
                catch (JsonException ex) { r.Add(new(IssueLevel.Error, $"{toolFile} の JSON が壊れています: {ex.Message}")); }
            }
            var url = server?["mcpServerUrl"]?.GetValue<string>() ?? "";
            var host = env.DataverseHost();
            if (host.Length > 0 && Uri.TryCreate(url, UriKind.Absolute, out var u) && u.Host.Contains(".crm") && !u.Host.Equals(host, StringComparison.OrdinalIgnoreCase))
                r.Add(new(IssueLevel.Warn, $"{id}: MCP の URL（{u.Host}）が .env の DATAVERSE_URL（{host}）と違います"));
        }

        if (env.Get("TENANT_ID").Length == 0) r.Add(new(IssueLevel.Error, ".env に TENANT_ID がありません（ビルドに必要）"));
        if (env.Get("COWORK_OAUTH_CLIENT_ID").Length == 0) r.Add(new(IssueLevel.Warn, ".env に COWORK_OAUTH_CLIENT_ID がありません（Entra アプリが未作成）"));
        return r;
    }

    public static string Sha256(string path)
    {
        using var s = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(s)).ToLowerInvariant();
    }

    /// <summary>ZIP をビルド後に検証する（manifest がルート・プレースホルダーが残っていない）。</summary>
    public static List<Issue> InspectZip(string path)
    {
        var r = new List<Issue>();
        try
        {
            using var zip = ZipFile.OpenRead(path);
            var manifest = zip.GetEntry("manifest.json");
            if (manifest == null) { r.Add(new(IssueLevel.Error, "ZIP のルートに manifest.json がありません")); return r; }
            using var reader = new StreamReader(manifest.Open());
            var text = reader.ReadToEnd();
            r.Add(text.Contains(Placeholder) ? new(IssueLevel.Error, "referenceId がプレースホルダーのままです") : new(IssueLevel.Ok, "referenceId を注入済み"));
            r.Add(new(IssueLevel.Ok, $"{zip.Entries.Count} ファイル"));
        }
        catch (Exception ex) { r.Add(new(IssueLevel.Error, $"ZIP を読めません: {ex.Message}")); }
        return r;
    }
}

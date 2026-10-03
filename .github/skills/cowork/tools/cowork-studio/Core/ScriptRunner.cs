using System.IO;
using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;

namespace CoworkStudio.Core;

public sealed class RunResult
{
    public int ExitCode { get; set; } = -1;
    public List<string> Lines { get; } = new();
    public TimeSpan Elapsed { get; set; }
    public bool Ok => ExitCode == 0;
    public string Text => string.Join("\n", Lines);

    public string? PlanHash => Lines.Select(l => Regex.Match(l, @"^PLAN_HASH=([0-9a-f]{64})")).FirstOrDefault(m => m.Success)?.Groups[1].Value;

    /// <summary>dry-run が出した plan（PLAN_HASH の直前の JSON）。</summary>
    public string PlanText
    {
        get
        {
            var end = Lines.FindIndex(l => l.StartsWith("PLAN_HASH="));
            if (end < 0) return "";
            var start = Lines.FindIndex(l => l.StartsWith("{"));
            return start >= 0 && start < end ? string.Join("\n", Lines.Skip(start).Take(end - start)) : "";
        }
    }

    /// <summary>出力のうち、最初の [ または { から最後までを JSON として取り出す（auth_helper の行を除く）。</summary>
    public string JsonTail()
    {
        var body = Lines.Where(l => !l.StartsWith("[auth_helper]")).ToList();
        var start = body.FindIndex(l => l.TrimStart().StartsWith("[") || l.TrimStart().StartsWith("{"));
        return start < 0 ? "" : string.Join("\n", body.Skip(start));
    }
}

/// <summary>スキルのスクリプト（Python / PowerShell）を子プロセスで動かし、1 行ずつ返す。秘密は返す前に伏せる。</summary>
public static class ScriptRunner
{
    public static readonly Regex DeviceCode = new(@"コード\s+([A-Z0-9]{6,12})\s*を入力");

    public static string Python => Environment.GetEnvironmentVariable("COWORK_STUDIO_PYTHON") is { Length: > 0 } p ? p : "python";

    public static string Pwsh
    {
        get
        {
            foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
            {
                try { if (File.Exists(Path.Combine(dir.Trim(), "pwsh.exe"))) return "pwsh"; } catch { }
            }
            return "powershell";
        }
    }

    public static async Task<RunResult> RunAsync(string file, IEnumerable<string> args, string cwd, IReadOnlyList<string> secrets, Action<string, bool> onLine, CancellationToken ct = default, IReadOnlyDictionary<string, string>? env = null)
    {
        var result = new RunResult();
        var psi = new ProcessStartInfo(file)
        {
            WorkingDirectory = cwd,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        foreach (var a in args) psi.ArgumentList.Add(a);
        // スクリプトの多くは .env を自分で読まず環境変数を見る（例: COWORK_OAUTH_CLIENT_ID）。ルートの .env を渡す
        if (env != null) foreach (var (k, v) in env) psi.Environment[k] = v;
        psi.Environment["PYTHONIOENCODING"] = "utf-8";
        psi.Environment["PYTHONUTF8"] = "1";
        psi.Environment["PYTHONUNBUFFERED"] = "1";

        string Mask(string line)
        {
            foreach (var s in secrets) if (line.Contains(s)) line = line.Replace(s, "••••••");
            return line;
        }

        var sw = Stopwatch.StartNew();
        using var p = new Process { StartInfo = psi, EnableRaisingEvents = true };
        var gate = new object();
        void Handle(string? data, bool err)
        {
            if (data == null) return;
            var line = Mask(data);
            lock (gate) result.Lines.Add(line);
            onLine(line, err);
        }
        p.OutputDataReceived += (_, e) => Handle(e.Data, false);
        p.ErrorDataReceived += (_, e) => Handle(e.Data, true);
        try
        {
            p.Start();
        }
        catch (Exception ex)
        {
            Handle($"起動できません: {file}（{ex.Message}）", true);
            result.ExitCode = 127;
            return result;
        }
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        using (ct.Register(() => { try { p.Kill(entireProcessTree: true); } catch { } }))
        {
            await p.WaitForExitAsync(CancellationToken.None);
        }
        p.WaitForExit();
        result.ExitCode = ct.IsCancellationRequested ? 130 : p.ExitCode;
        result.Elapsed = sw.Elapsed;
        return result;
    }
}

using System.Diagnostics;
using System.IO;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows;
using CoworkStudio.Core;

namespace CoworkStudio;

public partial class MainWindow
{
    private const string Scripts = ".github/skills/cowork/scripts/";
    private CancellationTokenSource? _runCts;
    private bool _busy;
    private DeviceCodeWindow? _deviceWindow;

    // ---------------------------------------------------------------- 実行の土台

    private async Task<RunResult?> RunPy(string title, string script, IEnumerable<string> args, StepModel? step = null) =>
        await Run(title, ScriptRunner.Python, new[] { Path.Combine(_root!, script) }.Concat(args), step);

    private async Task<RunResult?> Run(string title, string file, IEnumerable<string> args, StepModel? step = null)
    {
        if (_root == null || _env == null) return null;
        if (_busy)
        {
            SetStatus("別の処理が実行中です。終わってから実行してください");
            return null;
        }
        _busy = true;
        _runCts = new CancellationTokenSource();
        CancelRun.IsEnabled = true;
        BusyBar.Visibility = Visibility.Visible;
        SetStatus(title + " …");
        if (BottomLeftTabs.SelectedItem == ProjectTab) BottomLeftTabs.SelectedItem = ConsoleTab;
        var previous = step?.State ?? StepState.Unknown;
        if (step != null)
        {
            step.State = StepState.Running;
            RenderTimeline();
        }
        Log("▶ " + title, LogKind.Header);
        var lines = new List<string>();
        RunResult result;
        try
        {
            result = await ScriptRunner.RunAsync(file, args, _root, _env.SecretValues(), (line, err) => Dispatcher.BeginInvoke(() =>
            {
                lines.Add(line);
                Log(line, Classify(line, err));
                var m = ScriptRunner.DeviceCode.Match(line);
                if (m.Success) ShowDeviceCode(m.Groups[1].Value, title);
                if (line.Contains("認証レコードを保存") || line.Contains("認証キャッシュをロード")) CloseDeviceCode();
            }), _runCts.Token, _env.Values);
        }
        finally
        {
            _busy = false;
            CancelRun.IsEnabled = false;
            BusyBar.Visibility = Visibility.Collapsed;
            CloseDeviceCode();
        }
        await Dispatcher.InvokeAsync(() => { }, System.Windows.Threading.DispatcherPriority.Background);
        Log($"■ {(result.Ok ? "完了" : $"終了コード {result.ExitCode}")}（{result.Elapsed.TotalSeconds:0.0} 秒）", result.Ok ? LogKind.Ok : LogKind.Error);
        SetStatus($"{title}: {(result.Ok ? "完了" : "失敗")}（{result.Elapsed.TotalSeconds:0.0} 秒）");
        if (step != null)
        {
            step.LastOutput = result.Lines.TakeLast(14).ToList();
            if (step.State == StepState.Running) step.State = previous;
        }
        _state.History.Add($"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {title} → {(result.Ok ? "OK" : "exit " + result.ExitCode)}");
        SaveState();
        return result;
    }

    private void ShowDeviceCode(string code, string context)
    {
        if (App.Options.Unattended) return;
        CloseDeviceCode();
        _deviceWindow = new DeviceCodeWindow(this, code, $"「{context}」が Microsoft のサインインを待っています。");
        _deviceWindow.Show();
    }

    private void CloseDeviceCode()
    {
        _deviceWindow?.Close();
        _deviceWindow = null;
    }

    private void OnCancelRun(object sender, RoutedEventArgs e) => _runCts?.Cancel();

    private void SaveState()
    {
        if (_root != null && _plugin != null) StateStore.Save(_root, _plugin.Name, _state);
    }

    private StepModel Step(string id) => _steps.First(s => s.Id == id);

    private void RefreshStepViews(StepModel? focus = null)
    {
        RenderTimeline();
        var target = focus ?? _selectedStep;
        if (target != null && _selectedFile == null)
        {
            BuildInspectorForStep(target);
            ShowProgramForStep(target);
        }
    }

    // ---------------------------------------------------------------- 状態の判定

    /// <summary>ネットワークを使わずに分かる状態（.env・ZIP・保存済みの記録）。</summary>
    private void EvaluateLocal()
    {
        if (_plugin == null || _env == null) return;
        var oauth = Step("oauth");
        if (oauth.CheckedAt == null && oauth.State is not StepState.Running)
        {
            var reg = _env.Get("COWORK_OAUTH_REGISTRATION_ID");
            oauth.State = reg.Length > 0 ? StepState.Done : StepState.Pending;
            oauth.Detail = reg.Length > 0 ? $"登録 ID {EnvFile.Mask(reg)}（.env）" : ".env に COWORK_OAUTH_REGISTRATION_ID がありません";
        }

        var build = Step("build");
        var zip = _plugin.LatestZip();
        if (zip == null) { build.State = StepState.Pending; build.Detail = "dist に ZIP がありません"; }
        else
        {
            var stale = _plugin.SourcesNewestUtc() > zip.LastWriteTimeUtc;
            var problems = PluginProject.InspectZip(zip.FullName).Where(i => i.Level == IssueLevel.Error).ToList();
            build.State = problems.Count > 0 ? StepState.Error : stale ? StepState.Warning : StepState.Done;
            build.Detail = problems.Count > 0 ? problems[0].Text
                : $"{zip.Name}（{zip.Length / 1024.0:0.0} KB・{zip.LastWriteTime:MM/dd HH:mm}）" + (stale ? " — ソースの方が新しい" : "");
        }

        var personal = Step("personal");
        if (personal.State != StepState.Error)
        {
            if (string.IsNullOrEmpty(_state.PersonalTitleId)) { personal.State = StepState.Pending; personal.Detail = "まだインストールしていません"; }
            else
            {
                var old = _state.InstalledVersion != null && _state.InstalledVersion != _plugin.Version;
                personal.State = old ? StepState.Warning : StepState.Done;
                personal.Detail = $"titleId {_state.PersonalTitleId}・v{_state.InstalledVersion}" + (old ? $"（manifest は v{_plugin.Version}）" : "");
            }
        }

        var publish = Step("publish");
        if (_state.Published)
        {
            var old = _state.PublishedVersion != _plugin.Version;
            publish.State = old ? StepState.Warning : StepState.Done;
            publish.Detail = $"v{_state.PublishedVersion} を公開済み（{_state.PublishedAt:yyyy/MM/dd}）" + (old ? $"・manifest は v{_plugin.Version}" : "");
        }
        else { publish.State = StepState.Manual; publish.Detail = "管理センターで公開する（ブラウザ）"; }

        foreach (var id in new[] { "entra", "consent", "mcp" })
        {
            var s = Step(id);
            if (s.State == StepState.Unknown)
                s.Detail = _env.Get("COWORK_OAUTH_CLIENT_ID").Length == 0 ? ".env に COWORK_OAUTH_CLIENT_ID がありません" : "未確認 — 「全体を確認」(F5) で診断";
        }
    }

    private async Task RefreshAllAsync()
    {
        if (_plugin == null || _env == null || _busy) return;
        _env.Reload();
        UpdateEnvChip();
        await DiagnoseAsync();
        await CheckOAuthListAsync();
        if (!string.IsNullOrEmpty(_state.PersonalTitleId)) await PersonalStatusAsync();
        EvaluateLocal();
        var now = DateTime.Now;
        foreach (var s in _steps) s.CheckedAt ??= now;
        RefreshStepViews();
        SetStatus($"全体を確認しました（完了 {_steps.Count(s => s.State == StepState.Done)}/{_steps.Count}）");
    }

    private async Task DiagnoseAsync()
    {
        if (_env!.Get("COWORK_OAUTH_CLIENT_ID").Length == 0)
        {
            foreach (var id in new[] { "entra", "consent", "mcp" }) { Step(id).State = StepState.Pending; }
            Step("entra").Detail = ".env に COWORK_OAUTH_CLIENT_ID がありません。Entra アプリを作成してください";
            return;
        }
        var r = await RunPy("診断（Entra・同意・MCP 許可）", Scripts + "diagnose_cowork_connector.py", Array.Empty<string>());
        if (r == null) return;
        var ids = new[] { "entra", "consent", "mcp" };
        var parsed = 0;
        for (var i = 0; i < r.Lines.Count; i++)
        {
            var m = Regex.Match(r.Lines[i], @"^(✅|❌|❓)\s*レイヤー(\d)");
            if (!m.Success) continue;
            parsed++;
            var step = Step(ids[int.Parse(m.Groups[2].Value) - 1]);
            step.State = m.Groups[1].Value switch { "✅" => StepState.Done, "❌" => StepState.Error, _ => StepState.Warning };
            step.Detail = i + 1 < r.Lines.Count ? r.Lines[i + 1].Trim() : "";
            var fix = i + 2 < r.Lines.Count && r.Lines[i + 2].Contains("対処") ? " " + r.Lines[i + 2].Trim() : "";
            step.Detail += fix;
            step.CheckedAt = DateTime.Now;
            step.LastOutput = r.Lines.Skip(i).Take(3).ToList();
        }
        if (parsed == 0)
        {
            // スクリプト自体が落ちた（ネットワーク・認証）。工程の結果ではないので「要確認」にして理由を出す
            var reason = r.Lines.LastOrDefault(l => Regex.IsMatch(l, @"^\w+(\.\w+)*(Error|Exception)\b")) ?? r.Lines.LastOrDefault(l => l.Trim().Length > 0) ?? "出力がありません";
            foreach (var id in ids)
            {
                var step = Step(id);
                step.State = StepState.Warning;
                step.Detail = "診断できませんでした: " + reason.Trim();
                step.CheckedAt = DateTime.Now;
                step.LastOutput = r.Lines.TakeLast(6).ToList();
            }
        }
    }

    private async Task CheckOAuthListAsync()
    {
        var clientId = _env!.Get("COWORK_OAUTH_CLIENT_ID");
        if (clientId.Length == 0) return;
        var step = Step("oauth");
        var r = await RunPy("OAuth 登録の一覧", Scripts + "manage_oauth_registration_api.py", new[] { "list" }, step);
        if (r == null) return;
        step.CheckedAt = DateTime.Now;
        if (!r.Ok) { step.State = StepState.Error; step.Detail = r.Lines.LastOrDefault() ?? "一覧を取得できません"; return; }
        try
        {
            var items = JsonNode.Parse(r.JsonTail())?.AsArray() ?? new JsonArray();
            var mine = items.Where(i => i?["clientId"]?.GetValue<string>() == clientId).ToList();
            var reg = _env.Get("COWORK_OAUTH_REGISTRATION_ID");
            if (mine.Count > 0 && reg.Length > 0) { step.State = StepState.Done; step.Detail = $"「{mine[0]?["description"]}」（ID {mine[0]?["id"]}）・.env と一致"; }
            else if (mine.Count > 0) { step.State = StepState.Warning; step.Detail = "ポータルに登録はありますが .env に COWORK_OAUTH_REGISTRATION_ID がありません"; }
            else if (reg.Length > 0) { step.State = StepState.Warning; step.Detail = ".env に ID がありますが、ポータルに同じクライアント ID の登録が見つかりません"; }
            else { step.State = StepState.Pending; step.Detail = "未登録"; }
        }
        catch (Exception ex) { step.State = StepState.Warning; step.Detail = "一覧を読めません: " + ex.Message; }
    }

    private async Task PersonalStatusAsync()
    {
        var step = Step("personal");
        var r = await RunPy("個人インストールの状態", Scripts + "install_agent_package_personal.py", new[] { "status", "--title-id", _state.PersonalTitleId! }, step);
        if (r == null) return;
        step.CheckedAt = DateTime.Now;
        if (r.Lines.Any(l => l.Contains("インストールされていません")))
        {
            _state.PersonalTitleId = null;
            _state.InstalledVersion = null;
            SaveState();
            return;
        }
        if (!r.Ok) { step.State = StepState.Error; step.Detail = r.Lines.LastOrDefault() ?? ""; return; }
        try
        {
            var info = JsonNode.Parse(r.JsonTail());
            _state.InstalledVersion = info?["version"]?.GetValue<string>() ?? _state.InstalledVersion;
            if (info?["blockStatus"]?.GetValue<bool>() == true) { step.State = StepState.Error; step.Detail = "テナントのポリシーでブロックされています"; }
            SaveState();
        }
        catch { }
    }

    // ---------------------------------------------------------------- ステップの操作

    private void OnRefreshAll(object sender, RoutedEventArgs e) => _ = RefreshAllAsync();

    private void OnRunSelected(object sender, RoutedEventArgs e)
    {
        if (_selectedStep != null) _ = RunPrimaryAsync(_selectedStep);
        else SelectStep(PlayheadStep());
    }

    /// <summary>ダブルクリック・Ctrl+Enter の主な操作。変更系は必ず計画（dry-run）から。</summary>
    private async Task RunPrimaryAsync(StepModel step)
    {
        switch (step.Id)
        {
            case "entra":
            case "consent":
            case "mcp":
                await DiagnoseAsync();
                RefreshStepViews(step);
                break;
            case "oauth":
                if (_plan?.StepId == "oauth") await ApplyPlanAsync();
                else await PlanOAuthAsync();
                break;
            case "build":
                await BuildAsync();
                break;
            case "personal":
                if (_plan?.StepId == "personal") await ApplyPlanAsync();
                else await PlanInstallAsync();
                break;
            case "publish":
                OpenUrl("https://admin.cloud.microsoft/#/agents/tools/all");
                break;
        }
    }

    private string OAuthName => _fieldValues.TryGetValue("oauth.name", out var v) && v.Length > 0 ? v : $"Dataverse MCP OAuth ({_plugin!.ShortName})";
    private string OAuthBase => _fieldValues.TryGetValue("oauth.base", out var v) && v.Length > 0 ? v : _env!.Get("DATAVERSE_URL").TrimEnd('/');
    private string OAuthScopes => _fieldValues.TryGetValue("oauth.scopes", out var v) && v.Length > 0 ? v : $"{OAuthBase}/.default,offline_access";
    private string OutputName => _fieldValues.TryGetValue("build.name", out var v) && v.Length > 0 ? v : _state.OutputName ?? (_plugin!.LatestZip() is { } z ? Path.GetFileNameWithoutExtension(z.Name) : _plugin.Name);

    private async Task PlanOAuthAsync()
    {
        var step = Step("oauth");
        if (OAuthBase.Length == 0) { StudioDialog.Info(this, "Base URL がありません", ".env に DATAVERSE_URL を設定してください。"); return; }
        var args = new[] { "create", "--name", OAuthName, "--base-url", OAuthBase, "--scopes", OAuthScopes };
        await MakePlanAsync(step, "oauth-create", Scripts + "manage_oauth_registration_api.py", args, $"OAuth 登録「{OAuthName}」を作成し、ID を .env に保存");
    }

    private async Task PlanInstallAsync()
    {
        var step = Step("personal");
        var zip = _plugin!.LatestZip();
        if (zip == null) { StudioDialog.Info(this, "ZIP がありません", "先に「パッケージ」ステップでビルドしてください。"); return; }
        if (Step("build").State == StepState.Warning &&
            !StudioDialog.Confirm(this, "ZIP が古い", "ソースの方が ZIP より新しくなっています。このままの ZIP でインストールの計画を作りますか？", zip.FullName, "このまま続ける"))
            return;
        await MakePlanAsync(step, "install", Scripts + "install_agent_package_personal.py", new[] { "install", "--package", zip.FullName }, $"{zip.Name} を自分だけにインストール");
    }

    private async Task PlanUninstallAsync()
    {
        if (string.IsNullOrEmpty(_state.PersonalTitleId)) return;
        await MakePlanAsync(Step("personal"), "uninstall", Scripts + "install_agent_package_personal.py", new[] { "uninstall", "--title-id", _state.PersonalTitleId }, $"titleId {_state.PersonalTitleId} をアンインストール");
    }

    private async Task MakePlanAsync(StepModel step, string kind, string script, string[] args, string summary)
    {
        var r = await RunPy($"計画（dry-run）: {summary}", script, args, step);
        if (r == null) return;
        if (!r.Ok || r.PlanHash == null)
        {
            step.State = StepState.Error;
            step.Detail = r.Lines.LastOrDefault(l => l.Trim().Length > 0) ?? "計画を作れませんでした";
            _plan = null;
        }
        else
        {
            _plan = new PendingPlan { StepId = step.Id, Kind = kind, Script = script, Args = args, Hash = r.PlanHash, Text = r.PlanText, Summary = summary };
            SetStatus($"計画を作りました。内容を確認して「承認して実行」を押してください（PLAN_HASH {r.PlanHash[..12]}…）");
        }
        RefreshStepViews(step);
    }

    private async Task ApplyPlanAsync()
    {
        if (_plan == null || _plugin == null || _env == null) return;
        var plan = _plan;
        var step = Step(plan.StepId);
        if (!StudioDialog.Confirm(this, "承認して実行", plan.Summary + "\n\nこの計画のとおりに変更します。", $"PLAN_HASH {plan.Hash}", "承認して実行"))
            return;
        var args = plan.Args.Concat(new[] { "--expected-hash", plan.Hash, "--apply" }).ToList();
        if (plan.Kind == "oauth-create") args.AddRange(new[] { "--write-env", _env.FilePath });
        var r = await RunPy($"実行: {plan.Summary}", plan.Script, args, step);
        if (r == null) return;
        _plan = null;
        if (!r.Ok)
        {
            step.State = StepState.Error;
            step.Detail = r.Lines.LastOrDefault(l => l.Trim().Length > 0) ?? "失敗しました";
            RefreshStepViews(step);
            return;
        }
        switch (plan.Kind)
        {
            case "oauth-create":
                _env.Reload();
                UpdateEnvChip();
                step.State = StepState.Done;
                step.Detail = r.Lines.LastOrDefault(l => l.Contains("✅")) ?? "作成しました";
                break;
            case "install":
                var id = Regex.Match(r.Text, "\"titleId\":\\s*\"([^\"]+)\"");
                _state.PersonalTitleId = id.Success ? id.Groups[1].Value : _state.PersonalTitleId;
                _state.InstalledVersion = _plugin.Version;
                SaveState();
                step.State = StepState.Done;
                break;
            case "uninstall":
                _state.PersonalTitleId = null;
                _state.InstalledVersion = null;
                SaveState();
                step.State = StepState.Pending;
                break;
        }
        step.CheckedAt = DateTime.Now;
        EvaluateLocal();
        RefreshStepViews(step);
    }

    private void DiscardPlan()
    {
        _plan = null;
        if (_selectedStep != null) RefreshStepViews(_selectedStep);
        SetStatus("計画を破棄しました");
    }

    private async Task<string?> BuildAsync()
    {
        var step = Step("build");
        if (_plugin == null || _env == null) return null;
        if (_manifestDirty) SaveManifest();
        var errors = _plugin.Validate(_env).Where(i => i.Level == IssueLevel.Error).ToList();
        if (errors.Count > 0 &&
            !StudioDialog.Confirm(this, "検証でエラーがあります", "manifest の検証でエラーがあります。このままビルドしますか？", string.Join("\n", errors.Select(e => "・" + e.Text)), "ビルドする", danger: true))
            return null;
        if (_env.Get("COWORK_OAUTH_REGISTRATION_ID").Length == 0)
        {
            StudioDialog.Info(this, "OAuth 登録がまだです", "referenceId に入れる登録 ID が .env にありません。先に「OAuth 登録」ステップを完了してください。");
            return null;
        }
        _state.OutputName = OutputName;
        var script = Path.Combine(_root!, Scripts, "build_agent_package.ps1").Replace('/', '\\');
        var command = $"[Console]::OutputEncoding=[Text.Encoding]::UTF8; & '{script}' -PluginRoot '{_plugin.Dir}' -OutputName '{OutputName}' -EnvPath '{_env.FilePath}'";
        var r = await Run($"ビルド: {OutputName}.zip", ScriptRunner.Pwsh, new[] { "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command }, step);
        if (r == null) return null;
        var zip = r.Lines.Select(l => Regex.Match(l, @"パッケージ生成:\s*(.+\.zip)")).FirstOrDefault(m => m.Success)?.Groups[1].Value.Trim();
        if (!r.Ok || zip == null)
        {
            step.State = StepState.Error;
            step.Detail = r.Lines.LastOrDefault(l => l.Trim().Length > 0) ?? "ビルドに失敗しました";
        }
        else
        {
            var issues = PluginProject.InspectZip(zip);
            foreach (var i in issues) Log((i.Level == IssueLevel.Ok ? "✓ " : "✖ ") + i.Text, i.Level == IssueLevel.Ok ? LogKind.Ok : LogKind.Error);
            step.State = issues.Any(i => i.Level == IssueLevel.Error) ? StepState.Error : StepState.Done;
            step.CheckedAt = DateTime.Now;
            EvaluateLocal();
        }
        RefreshStepViews(step);
        PopulateFiles();
        return step.State == StepState.Done ? zip : null;
    }

    private async Task CreateEntraAppAsync(string displayName)
    {
        var existing = _env!.Get("COWORK_OAUTH_CLIENT_ID");
        var msg = existing.Length > 0
            ? $".env には既にクライアント ID（{EnvFile.Mask(existing)}）があります。新しい Entra アプリを作ると .env の値が置き換わります。"
            : "Entra アプリを作成し、クライアント ID とシークレットを .env に書き込みます。";
        if (!StudioDialog.Confirm(this, "Entra アプリを作成", msg, $"表示名: {displayName}", "作成する", danger: existing.Length > 0)) return;
        var r = await RunPy($"Entra アプリを作成: {displayName}", Scripts + "setup_entra_oauth_graph.py", new[] { "--display-name", displayName, "--env-path", _env.FilePath }, Step("entra"));
        _env.Reload();
        UpdateEnvChip();
        if (r?.Ok == true) await DiagnoseAsync();
        RefreshStepViews(Step("entra"));
    }

    private async Task RegisterMcpClientAsync(string name)
    {
        if (!StudioDialog.Confirm(this, "MCP クライアントを登録", "Dataverse 環境の allowedmcpclients に Entra アプリを登録して有効にします。", $"表示名: {name}\n環境: {_env!.Get("DATAVERSE_URL")}", "登録する")) return;
        var r = await RunPy($"MCP クライアントを登録: {name}", Scripts + "register_mcp_client.py", new[] { "--name", name }, Step("mcp"));
        if (r?.Ok == true) await DiagnoseAsync();
        RefreshStepViews(Step("mcp"));
    }

    private void MarkPublished(bool published)
    {
        if (_plugin == null) return;
        _state.Published = published;
        _state.PublishedVersion = published ? _plugin.Version : null;
        _state.PublishedAt = published ? DateTime.Now : null;
        SaveState();
        EvaluateLocal();
        RefreshStepViews(Step("publish"));
    }

    private static void OpenUrl(string url) => Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });

    private void RevealFile(string path) => Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{path}\"") { UseShellExecute = true });
}

using Azure.Core;
using GitHub.Copilot;

/// <summary>
/// Owns the single copilot-runtime child process (B3). Sessions are created per turn and always
/// run BYOK: inference stays on the tenant's own Foundry / Azure OpenAI resource, authenticated
/// with the app's managed identity instead of a stored key.
/// </summary>
public sealed class CopilotRuntime(
    TokenCredential credential,
    IConfiguration configuration,
    ILogger<CopilotRuntime> logger) : IAsyncDisposable
{
    private const string InferenceScope = "https://ai.azure.com/.default";

    private readonly SemaphoreSlim _gate = new(1, 1);
    private CopilotClient? _client;

    public string Model =>
        configuration["AzureOpenAI:Deployment"] is { Length: > 0 } deployment
            ? deployment
            : throw new InvalidOperationException("AzureOpenAI:Deployment is required for BYOK.");

    /// <summary>Configuration holds the resource URL only; the OpenAI-compatible path is added here.</summary>
    private string BaseUrl =>
        configuration["AzureOpenAI:Endpoint"] is { Length: > 0 } endpoint
            ? $"{endpoint.TrimEnd('/')}/openai/v1/"
            : throw new InvalidOperationException("AzureOpenAI:Endpoint is required for BYOK.");

    private string WorkingDirectory =>
        configuration["Copilot:WorkingDirectory"] is { Length: > 0 } configured
            ? configured
            : Path.Combine(Path.GetTempPath(), "copilot-workspace");

    private string BaseDirectory =>
        configuration["Copilot:BaseDirectory"] is { Length: > 0 } configured
            ? configured
            : Path.Combine(WorkingDirectory, ".copilot");

    /// <summary>Built-in tools that would run on the agent host itself, so they stay off.</summary>
    public string[] ExcludedTools =>
        configuration.GetSection("Copilot:ExcludedTools").Get<string[]>() is { Length: > 0 } configured
            ? configured
            : ["bash", "edit", "write"];

    /// <summary>
    /// Skill folders shipped with the agent. Host discovery stays off, so this is the only way a
    /// SKILL.md reaches the runtime: an agent must not inherit whatever sits on its host.
    /// Returns empty when the folder has no skills, which keeps <c>EnableSkills</c> honest.
    /// </summary>
    public string[] SkillDirectories
    {
        get
        {
            if (!configuration.GetValue("Skills:Enabled", true))
            {
                return [];
            }

            string configured = configuration["Skills:Directory"] is { Length: > 0 } value
                ? value
                : Path.Combine(AppContext.BaseDirectory, "skills");
            string resolved = Path.IsPathRooted(configured)
                ? configured
                : Path.Combine(AppContext.BaseDirectory, configured);
            if (!Directory.Exists(resolved) || !Directory.EnumerateFiles(resolved, "SKILL.md", SearchOption.AllDirectories).Any())
            {
                logger.LogWarning("Skills are enabled but {Directory} holds no SKILL.md; running without skills", resolved);
                return [];
            }

            return [resolved];
        }
    }

    public ProviderConfig CreateProvider() => new()
    {
        Type = "openai",
        BaseUrl = BaseUrl,
        WireApi = "responses",
        BearerTokenProvider = async _ =>
            (await credential.GetTokenAsync(new TokenRequestContext([InferenceScope]), default)).Token,
    };

    public async Task<CopilotSession> CreateSessionAsync(SessionConfig config, CancellationToken cancellationToken)
    {
        CopilotClient client = await ClientAsync(cancellationToken);
        return await client.CreateSessionAsync(config);
    }

    private async Task<CopilotClient> ClientAsync(CancellationToken cancellationToken)
    {
        if (_client is not null)
        {
            return _client;
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_client is null)
            {
                // The runtime does not create these; a missing directory fails child-process start.
                Directory.CreateDirectory(WorkingDirectory);
                Directory.CreateDirectory(BaseDirectory);
                EnsureRuntimeIsExecutable();

                var client = new CopilotClient(new CopilotClientOptions
                {
                    WorkingDirectory = WorkingDirectory,
                    BaseDirectory = BaseDirectory,
                    Logger = logger,
                });
                await client.StartAsync();
                _client = client;
                logger.LogInformation(
                    "copilot-runtime started. model={Model} workdir={WorkingDirectory}", Model, WorkingDirectory);
            }
        }
        finally
        {
            _gate.Release();
        }

        return _client;
    }

    /// <summary>Zip deployment drops the execute bit, which the runtime binary needs on Linux.</summary>
    private void EnsureRuntimeIsExecutable()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        string native = Path.Combine(AppContext.BaseDirectory, "runtimes");
        if (!Directory.Exists(native))
        {
            return;
        }

        foreach (string file in Directory.EnumerateFiles(native, "copilot*", SearchOption.AllDirectories))
        {
            File.SetUnixFileMode(file, File.GetUnixFileMode(file) | UnixFileMode.UserExecute);
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_client is null)
        {
            return;
        }

        try
        {
            await _client.StopAsync();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "copilot-runtime did not stop gracefully; forcing");
            await _client.ForceStopAsync();
        }
        finally
        {
            await _client.DisposeAsync();
            _client = null;
        }
    }
}

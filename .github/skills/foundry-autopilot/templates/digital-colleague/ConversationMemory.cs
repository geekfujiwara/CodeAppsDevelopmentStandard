using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

/// <summary>
/// Conversation history that outlives restarts and deployments.
/// App Service keeps %HOME% on a shared volume, so the transcript survives a container swap;
/// the in-process turn state does not.
/// </summary>
public sealed class ConversationMemory
{
    private static readonly JsonSerializerOptions SerializerOptions = new() { WriteIndented = false };

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly string _root;
    private readonly int _maxStored;
    private readonly ILogger<ConversationMemory> _logger;

    public ConversationMemory(IConfiguration configuration, ILogger<ConversationMemory> logger)
    {
        _logger = logger;
        _maxStored = Math.Clamp(configuration.GetValue("Conversation:MaxStoredMessages", 400), 20, 5000);
        MaxPromptMessages = Math.Clamp(configuration.GetValue("Conversation:MaxPromptMessages", 60), 4, _maxStored);

        string home = configuration["Conversation:StatePath"]
            ?? Path.Combine(Environment.GetEnvironmentVariable("HOME") ?? AppContext.BaseDirectory, "data");
        _root = Path.Combine(home, "conversations");
        Directory.CreateDirectory(_root);

        logger.LogInformation(
            "Conversation memory at {Root} (store {Stored}, prompt {Prompt})", _root, _maxStored, MaxPromptMessages);
    }

    /// <summary>How many of the stored turns are replayed to the model.</summary>
    public int MaxPromptMessages { get; }

    public async Task<List<ChatTurn>> LoadAsync(string conversationId, CancellationToken cancellationToken)
    {
        string path = PathFor(conversationId);
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (!File.Exists(path))
            {
                return [];
            }

            await using FileStream stream = File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync<List<ChatTurn>>(stream, SerializerOptions, cancellationToken)
                ?? [];
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not read conversation memory; continuing without history");
            return [];
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task SaveAsync(string conversationId, List<ChatTurn> history, CancellationToken cancellationToken)
    {
        if (history.Count > _maxStored)
        {
            history.RemoveRange(0, history.Count - _maxStored);
        }

        string path = PathFor(conversationId);
        string temporary = path + ".tmp";

        await _gate.WaitAsync(cancellationToken);
        try
        {
            await using (FileStream stream = File.Create(temporary))
            {
                await JsonSerializer.SerializeAsync(stream, history, SerializerOptions, cancellationToken);
            }

            File.Move(temporary, path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not persist conversation memory");
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>Hashes the conversation id so an untrusted value can never escape the state directory.</summary>
    private string PathFor(string conversationId)
    {
        byte[] digest = SHA256.HashData(Encoding.UTF8.GetBytes(conversationId));
        return Path.Combine(_root, Convert.ToHexString(digest) + ".json");
    }
}

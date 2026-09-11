/// <summary>
/// Records that each background loop is still ticking, and answers a cheap anonymous request.
///
/// Two problems this solves at once:
///
/// 1. Without Always On the app is unloaded a few minutes after the last request. An external
///    ping every few minutes keeps it loaded, and that ping needs an endpoint that answers
///    before any credential, MCP client or model call has warmed up.
/// 2. When a <see cref="BackgroundService"/> stops, nothing is logged and nothing fails — the
///    next visitor still gets a healthy-looking answer. The only outward sign is that these
///    timestamps stop moving.
/// </summary>
public sealed class AgentHealth
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, DateTimeOffset> _beats = new(StringComparer.Ordinal);
    private readonly DateTimeOffset _startedAt = DateTimeOffset.UtcNow;

    /// <summary>Call once per loop iteration, after the work — not before it.</summary>
    public void Beat(string worker) => _beats[worker] = DateTimeOffset.UtcNow;

    /// <summary>Marks a loop as deliberately switched off so a missing beat is not read as a fault.</summary>
    public void Disabled(string worker) => _beats[worker] = DateTimeOffset.MinValue;

    public object Snapshot()
    {
        DateTimeOffset now = DateTimeOffset.UtcNow;
        return new
        {
            status = "ok",
            startedAt = _startedAt,
            uptimeSeconds = (long)(now - _startedAt).TotalSeconds,
            workers = _beats
                .OrderBy(beat => beat.Key, StringComparer.Ordinal)
                .ToDictionary(
                    beat => beat.Key,
                    beat => beat.Value == DateTimeOffset.MinValue
                        ? (object)"disabled"
                        : new { lastBeat = beat.Value, agoSeconds = (long)(now - beat.Value).TotalSeconds }),
        };
    }
}

// エージェント自身の ID（B2）。会話ターンの外（ワーカー）でも自分としてトークンを取るための最小実装。
// 必要なアプリ設定: Agentic__TenantId / Agentic__InstanceId / Agentic__UserId。

using Microsoft.Agents.Authentication;
using Microsoft.Agents.Core.Models;

public sealed record AgenticIdentity(string TenantId, string InstanceId, string UserId);

/// <summary>
/// Background jobs have no ITurnContext, so the agentic identity that normally arrives on the
/// activity is kept here. Seeded from configuration and refreshed from every real turn.
/// </summary>
public sealed class AgenticIdentityStore
{
    private AgenticIdentity? _current;

    public AgenticIdentityStore(IConfiguration configuration)
    {
        string? tenantId = configuration["Agentic:TenantId"]
            ?? configuration["Connections:ServiceConnection:Settings:TenantId"];
        string? instanceId = configuration["Agentic:InstanceId"];
        string? userId = configuration["Agentic:UserId"];

        if (!string.IsNullOrEmpty(tenantId) && !string.IsNullOrEmpty(instanceId) && !string.IsNullOrEmpty(userId))
        {
            _current = new AgenticIdentity(tenantId, instanceId, userId);
        }
    }

    public AgenticIdentity? Current => Volatile.Read(ref _current);

    public void Observe(IActivity activity)
    {
        ChannelAccount? recipient = activity.Recipient;
        if (recipient?.AgenticUserId is not { Length: > 0 } userId
            || recipient.AgenticAppId is not { Length: > 0 } instanceId)
        {
            return;
        }

        string? tenantId = recipient.TenantId ?? activity.Conversation?.TenantId;
        if (string.IsNullOrEmpty(tenantId))
        {
            return;
        }

        Volatile.Write(ref _current, new AgenticIdentity(tenantId, instanceId, userId));
    }
}

/// <summary>Acquires agentic user tokens without a turn, for background work.</summary>
public sealed class AgenticTokenSource(IConnections connections, AgenticIdentityStore identities)
{
    public AgenticIdentity? Identity => identities.Current;

    public async Task<string?> GetTokenAsync(string scope, CancellationToken cancellationToken)
    {
        if (identities.Current is not { } id)
        {
            return null;
        }

        if (connections.GetDefaultConnection() is not IAgenticTokenProvider provider)
        {
            throw new InvalidOperationException(
                "既定の接続が IAgenticTokenProvider ではありません。AuthType を ClientSecret にしてください。");
        }

        return await provider.GetAgenticUserTokenAsync(
            id.TenantId, id.InstanceId, id.UserId, [scope], cancellationToken);
    }
}

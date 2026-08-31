using System.Net.Http.Headers;
using System.Text;
using Azure.Core;

public sealed class PresenceWorker(
    TokenCredential credential,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<PresenceWorker> logger) : BackgroundService
{
    private static readonly TimeSpan RefreshInterval = TimeSpan.FromHours(2);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        string? userId = configuration["Agentic:UserId"];
        string? sessionId = configuration["Presence:SessionId"];
        if (!configuration.GetValue("Presence:Enabled", true)
            || string.IsNullOrWhiteSpace(userId)
            || string.IsNullOrWhiteSpace(sessionId))
        {
            logger.LogInformation("Presence heartbeat disabled or missing user/session ID");
            return;
        }

        using var timer = new PeriodicTimer(RefreshInterval);
        do
        {
            try
            {
                await SetAvailableAsync(userId, sessionId, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Could not refresh Teams presence for agentic user");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task SetAvailableAsync(string userId, string sessionId, CancellationToken cancellationToken)
    {
        AccessToken token = await credential.GetTokenAsync(
            new TokenRequestContext(["https://graph.microsoft.com/.default"]),
            cancellationToken);

        using HttpClient http = httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"https://graph.microsoft.com/v1.0/users/{Uri.EscapeDataString(userId)}/presence/setPresence");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);
        request.Content = new StringContent(
            $$"""{"sessionId":"{{sessionId}}","availability":"Available","activity":"Available","expirationDuration":"PT4H"}""",
            Encoding.UTF8,
            "application/json");

        using HttpResponseMessage response = await http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            string body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException(
                $"Graph setPresence returned HTTP {(int)response.StatusCode}: {Truncate(body, 500)}");
        }

        logger.LogInformation("Teams presence refreshed for agentic user {UserId}", userId);
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max] + " ...";
}
/// <summary>
/// Polls for automated tests the review app (AI チームメイト評価Hub) addressed to this teammate.
/// Same shape as <see cref="EvaluationWorker"/>: the always-on app is what makes "テストを開始" in
/// the UI actually produce an answer, without the app ever holding agent credentials.
/// </summary>
public sealed class TestWorker(
    TestRunner runner,
    IConfiguration configuration,
    ILogger<TestWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!runner.Enabled)
        {
            logger.LogInformation("Automated tests are disabled");
            return;
        }

        TimeSpan interval = TimeSpan.FromSeconds(Math.Max(10, configuration.GetValue("Evaluation:TestPollSeconds", 20)));
        using var timer = new PeriodicTimer(interval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Drain the queue so a test sent to this teammate twice is not spread over minutes.
                while (await runner.RunOnceAsync(stoppingToken))
                {
                }
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Could not poll for automated tests");
            }

            if (!await timer.WaitForNextTickAsync(stoppingToken))
            {
                return;
            }
        }
    }
}

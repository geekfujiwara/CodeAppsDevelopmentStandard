/// <summary>
/// Polls for jobs the review app (AI チームメイト評価Hub) queued. Living in the always-on app rather
/// than a scheduled task on someone's laptop is what makes "再実行" in the UI actually do something.
/// </summary>
public sealed class EvaluationWorker(
    EvaluationRunner runner,
    IConfiguration configuration,
    ILogger<EvaluationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!runner.Enabled)
        {
            logger.LogInformation("Evaluation jobs are disabled");
            return;
        }

        TimeSpan interval = TimeSpan.FromSeconds(Math.Max(15, configuration.GetValue("Evaluation:PollSeconds", 60)));
        using var timer = new PeriodicTimer(interval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Keep draining while work remains so a burst of queued jobs is not spread over hours.
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
                logger.LogWarning(ex, "Could not poll for evaluation jobs");
            }

            if (!await timer.WaitForNextTickAsync(stoppingToken))
            {
                return;
            }
        }
    }
}

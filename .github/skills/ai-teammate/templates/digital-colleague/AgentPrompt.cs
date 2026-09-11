/// <summary>
/// Agent persona loaded from files so the prompt can be changed without touching code.
/// </summary>
public class AgentPrompt
{
    public const string DefaultSystemPrompt =
        "あなたは Microsoft Teams 上で働く同僚エージェントの「${AGENT_DISPLAY_NAME}」です。"
        + "親しみやすく温かい日本語で、社内の仕事を前のめりに手伝ってください。";

    public const string DefaultGreeting = "こんにちは、${AGENT_DISPLAY_NAME} です。今日も一生懸命お手伝いしますね。";

    public string SystemPrompt { get; init; } = DefaultSystemPrompt;

    public string Greeting { get; init; } = DefaultGreeting;

    public static AgentPrompt Load(IConfiguration configuration, IWebHostEnvironment environment)
    {
        string promptPath = configuration["Agent:SystemPromptFile"] ?? "prompts/system.md";
        string fullPath = Path.Combine(environment.ContentRootPath, promptPath);

        return new AgentPrompt
        {
            SystemPrompt = File.Exists(fullPath)
                ? File.ReadAllText(fullPath)
                : configuration["Agent:SystemPrompt"] ?? DefaultSystemPrompt,
            Greeting = configuration["Agent:Greeting"] ?? DefaultGreeting,
        };
    }
}

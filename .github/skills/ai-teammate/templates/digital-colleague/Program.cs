using Azure.AI.OpenAI;
using Azure.Core;
using Azure.Identity;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using Microsoft.Agents.Hosting.AspNetCore;
using Microsoft.Agents.Storage;
using OpenTelemetry.Trace;

var builder = WebApplication.CreateBuilder(args);

// Without this the model calls leave no span at all, so a slow or looping turn is invisible.
AppContext.SetSwitch("OpenAI.Experimental.EnableOpenTelemetry", true);

builder.Services.AddHttpClient();
builder.Services.AddOpenTelemetry()
    .UseAzureMonitor()
    .WithTracing(tracing => tracing.AddSource("OpenAI.*"));

builder.Services.AddSingleton<TokenCredential>(sp =>
{
    IConfigurationSection cfg = builder.Configuration.GetSection("AzureOpenAI");
    return new DefaultAzureCredential(new DefaultAzureCredentialOptions
    {
        ManagedIdentityClientId = cfg["ManagedIdentityClientId"],
    });
});
builder.Services.AddSingleton(sp =>
{
    IConfigurationSection cfg = builder.Configuration.GetSection("AzureOpenAI");
    TokenCredential credential = sp.GetRequiredService<TokenCredential>();
    return new AzureOpenAIClient(new Uri(cfg["Endpoint"]!), credential)
        .GetChatClient(cfg["Deployment"]!);
});
builder.Services.AddSingleton(sp =>
    AgentPrompt.Load(builder.Configuration, sp.GetRequiredService<IWebHostEnvironment>()));
builder.Services.AddSingleton<McpClient>();
builder.Services.AddSingleton<Audience>();
builder.Services.AddSingleton<ConversationMemory>();
builder.Services.AddSingleton<AgentHealth>();
builder.Services.AddSingleton<AgenticIdentityStore>();
builder.Services.AddSingleton<AgenticTokenSource>();

// B15: usage/cost accounting. Required — cannot be added later without losing past history.
builder.Services.AddSingleton<UsageStore>();
builder.Services.AddSingleton<UsageTools>();

// Evaluation Hub (required): mirrors every turn into Dataverse and runs queued judge jobs.
builder.Services.AddSingleton<EvaluationDataverse>();
builder.Services.AddSingleton<EvaluationLog>();
builder.Services.AddSingleton<EvaluationRunner>();
builder.Services.AddHostedService<EvaluationWorker>();

// GEEK:BLOCK:B6:START
builder.Services.AddSingleton<MailTools>();
builder.Services.AddHostedService<MailboxWorker>();
// GEEK:BLOCK:B6:END

// GEEK:BLOCK:B7:START
builder.Services.AddHostedService<PresenceWorker>();
// GEEK:BLOCK:B7:END

// GEEK:BLOCK:B9:START
builder.Services.AddSingleton<TeamsChatTools>();
// GEEK:BLOCK:B9:END

// GEEK:BLOCK:B10:START
builder.Services.AddSingleton<WebSearchTools>();
// GEEK:BLOCK:B10:END

// GEEK:BLOCK:B11:START
builder.Services.AddSingleton<ScheduleStore>();
builder.Services.AddSingleton<ScheduleTools>();
builder.Services.AddHostedService<ScheduleWorker>();
// GEEK:BLOCK:B11:END

// GEEK:BLOCK:B12:START
builder.Services.AddSingleton<CodeSandbox>();
builder.Services.AddSingleton<SandboxTools>();
// GEEK:BLOCK:B12:END

// GEEK:BLOCK:B14:START
builder.Services.AddSingleton<DocumentLedger>();
builder.Services.AddSingleton<DocumentShareTools>();
builder.Services.AddSingleton<IFileDelivery, FileDelivery>();
// GEEK:BLOCK:B14:END

// GEEK:BLOCK:B16:START
builder.Services.AddSingleton<IncomingFiles>();
// GEEK:BLOCK:B16:END

// GEEK:BLOCK:B17:START
builder.Services.AddSingleton<ImageGenerationTools>();
// GEEK:BLOCK:B17:END

builder.Services.AddSingleton<AgentBrain>();

builder.AddAgent<Agent>();
builder.Services.AddSingleton<IStorage, MemoryStorage>();
builder.Services.AddAgentAspNetAuthentication(builder.Configuration);
builder.Services.AddAuthorization();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

// Kept anonymous and free of downstream calls: this is also the request that keeps the app
// loaded on plans where Always On is unavailable, so it has to answer before anything warms up.
app.MapGet("/health", (AgentHealth health) => Results.Json(health.Snapshot())).AllowAnonymous();

app.MapAgentRootEndpoint();
app.MapAgentApplicationEndpoints(requireAuth: !app.Environment.IsDevelopment());

app.Run();

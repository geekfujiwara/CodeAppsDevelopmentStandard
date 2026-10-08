// Azure OpenAI の Responses API に組み込まれた `web_search` ツール（Grounding with Bing）を
// エージェントのローカル ツールとして公開する。
//
// 追加の Azure リソース（Bing アカウント / プロジェクト接続）は要らない。LLM に使っている
// Azure OpenAI リソースと、App Service の UAMI（Cognitive Services OpenAI User）だけで動く。
// Web IQ の招待が下りていないテナントでも、この経路なら Web 検索を持たせられる。
// 設計判断と切り分けは references/web-grounding.md。
//
// 前提となるプロジェクト側の型:
//   LocalTool          … MCP 以外のツールを同じツール ループへ載せるための型
//                        record LocalTool(McpToolDefinition Definition,
//                                         Func<JsonElement, CancellationToken, Task<string>> Invoke)
//   McpToolDefinition  … (Name, Description, InputSchema)
//   McpToolset         … AddLocal(IEnumerable<LocalTool>)
//
// Program.cs:
//   builder.Services.AddSingleton<WebSearchTools>();
//
// AgentBrain のツール接続時（UAMI で動くので会話ターンのトークンは不要）:
//   if (configuration.GetValue("WebSearch:Enabled", true) && webSearch.IsConfigured)
//   {
//       toolset.AddLocal(webSearch.CreateTools());
//   }
//
// アプリ設定（__ が階層区切り）:
//   WebSearch__Enabled    = true
//   WebSearch__Deployment = 省略可。未設定なら AzureOpenAI__Deployment を使う

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Azure.Core;

public sealed class WebSearchTools(
    IHttpClientFactory httpClientFactory,
    TokenCredential credential,
    IConfiguration configuration,
    ILogger<WebSearchTools> logger)
{
    private const string CognitiveServicesScope = "https://cognitiveservices.azure.com/.default";
    private const int MaxResultLength = 6000;

    private readonly string? _endpoint = configuration["AzureOpenAI:Endpoint"]?.TrimEnd('/');
    private readonly string? _deployment = configuration["WebSearch:Deployment"] ?? configuration["AzureOpenAI:Deployment"];

    public bool IsConfigured => !string.IsNullOrEmpty(_endpoint) && !string.IsNullOrEmpty(_deployment);

    public IReadOnlyList<LocalTool> CreateTools() =>
    [
        new LocalTool(
            new McpToolDefinition(
                "web_search",
                "Web を検索して最新の情報を調べる。社外の情報、ニュース、製品仕様、一般的な事実に使う。"
                + "URL を渡すとそのページの内容も読める。結果には出典のタイトルと URL が付く。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "query": {
                          "type": "string",
                          "description": "調べたいことを文で書く。特定のページを読むときは URL を含める。"
                        },
                        "include_images": {
                          "type": "boolean",
                          "description": "画像も欲しいときに true。画像の直リンク URL を探して結果に含める。"
                        }
                      },
                      "required": ["query"]
                    }
                    """)),
            SearchAsync),
    ];

    private async Task<string> SearchAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        string query = arguments.TryGetProperty("query", out JsonElement q) ? q.GetString() ?? string.Empty : string.Empty;
        if (query.Trim().Length == 0)
        {
            return "query を指定してください。";
        }

        bool includeImages = arguments.TryGetProperty("include_images", out JsonElement images)
            && images.ValueKind == JsonValueKind.True;

        string instructions = includeImages
            ? "日本語で簡潔にまとめてください。あわせて、内容に合う画像の直リンク URL"
              + "（https で始まり .jpg / .jpeg / .png / .webp / .gif で終わるもの）を最大 3 件、"
              + "`![説明](URL)` の形式で本文の最後に並べてください。直リンクが見つからない画像は挙げないでください。"
            : "日本語で簡潔にまとめてください。";

        // tool_choice: required を外すと、モデルが検索せず自分の知識だけで答えることがある。
        string payload = JsonSerializer.Serialize(new
        {
            model = _deployment,
            instructions,
            input = query,
            tools = new object[] { new { type = "web_search" } },
            tool_choice = "required",
        });

        AccessToken token = await credential.GetTokenAsync(
            new TokenRequestContext([CognitiveServicesScope]), cancellationToken);

        using HttpClient http = httpClientFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(120);
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);

        using var content = new StringContent(payload, Encoding.UTF8, "application/json");
        using HttpResponseMessage response = await http.PostAsync($"{_endpoint}/openai/v1/responses", content, cancellationToken);
        string body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("Web search returned {Status}: {Body}", (int)response.StatusCode, Truncate(body, 500));
            return $"ツールがエラーを返しました: Web 検索が HTTP {(int)response.StatusCode} を返しました。";
        }

        return Summarize(body);
    }

    /// <summary>Bing の Use and Display 要件により、出典 URL と検索リンクを本文と一緒に残す。</summary>
    private static string Summarize(string body)
    {
        using JsonDocument document = JsonDocument.Parse(body);
        if (!document.RootElement.TryGetProperty("output", out JsonElement output))
        {
            return "(空の結果)";
        }

        var text = new StringBuilder();
        var citations = new List<string>();
        var searched = new List<string>();

        foreach (JsonElement item in output.EnumerateArray())
        {
            string type = item.TryGetProperty("type", out JsonElement t) ? t.GetString() ?? string.Empty : string.Empty;

            if (type == "web_search_call"
                && item.TryGetProperty("action", out JsonElement action)
                && action.TryGetProperty("queries", out JsonElement queries))
            {
                searched.AddRange(queries.EnumerateArray().Select(x => x.GetString() ?? string.Empty));
                continue;
            }

            if (type != "message" || !item.TryGetProperty("content", out JsonElement parts))
            {
                continue;
            }

            foreach (JsonElement part in parts.EnumerateArray())
            {
                if (part.TryGetProperty("text", out JsonElement partText))
                {
                    text.AppendLine(partText.GetString());
                }

                if (!part.TryGetProperty("annotations", out JsonElement annotations))
                {
                    continue;
                }

                foreach (JsonElement annotation in annotations.EnumerateArray())
                {
                    if (annotation.TryGetProperty("url", out JsonElement url)
                        && annotation.TryGetProperty("title", out JsonElement title))
                    {
                        string entry = $"- [{title.GetString()}]({url.GetString()})";
                        if (!citations.Contains(entry))
                        {
                            citations.Add(entry);
                        }
                    }
                }
            }
        }

        var result = new StringBuilder(Truncate(text.ToString().Trim(), MaxResultLength));
        if (citations.Count > 0)
        {
            result.AppendLine().AppendLine().AppendLine("出典:");
            result.AppendLine(string.Join("\n", citations.Take(5)));
        }

        if (searched.Count > 0)
        {
            result.AppendLine($"Bing 検索: https://www.bing.com/search?q={Uri.EscapeDataString(searched[0])}");
        }

        return result.Length == 0 ? "(空の結果)" : result.ToString();
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max] + "…";

    private static JsonElement Schema(string json) => JsonDocument.Parse(json).RootElement.Clone();
}

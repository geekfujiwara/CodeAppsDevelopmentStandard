// Azure OpenAI の画像生成モデルをローカル ツールとして公開し、生成物を OneDrive 台帳経路（B14）で保存する（B17）。
// アプリ設定: ImageGeneration__Enabled / ImageGeneration__Deployment / ImageGeneration__TimeoutSeconds。

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Azure.Core;

/// <summary>Generates one PNG with Azure OpenAI and saves it through the shared OneDrive delivery path.</summary>
public sealed class ImageGenerationTools(
    IHttpClientFactory httpClientFactory,
    TokenCredential credential,
    IFileDelivery delivery,
    IConfiguration configuration,
    ILogger<ImageGenerationTools> logger)
{
    private const string CognitiveServicesScope = "https://cognitiveservices.azure.com/.default";
    private const int MaxPromptLength = 4000;
    private static readonly HashSet<string> Sizes = ["1024x1024", "1536x1024", "1024x1536"];
    private static readonly HashSet<string> Qualities = ["low", "medium", "high"];
    private static readonly HashSet<string> Backgrounds = ["auto", "opaque", "transparent"];

    private readonly string? _endpoint = configuration["AzureOpenAI:Endpoint"]?.TrimEnd('/');
    private readonly string? _deployment = configuration["ImageGeneration:Deployment"];

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_endpoint) && !string.IsNullOrWhiteSpace(_deployment);

    public IReadOnlyList<LocalTool> CreateTools(string graphToken, string? authenticatedUserEmail) =>
    [
        new LocalTool(
            new McpToolDefinition(
                "generate_image",
                "依頼に合わせた画像を1枚生成し、エージェントの OneDrive に PNG として保存する。"
                + "生成は費用が発生するため、用途・構図・縦横比を利用者に提示して承認を得てから呼ぶ。"
                + "グラフ、表、正確な数値の可視化には使わず run_python を使う。"
                + "返された共有リンクは書き換えず、ファイル名をリンク文字列にして利用者へ渡す。",
                Schema("""
                    {
                      "type": "object",
                      "properties": {
                        "prompt": {
                          "type": "string",
                          "description": "生成する画像の具体的な説明。主題、構図、色、光、画風、入れない要素まで書く。"
                        },
                        "filename": {
                          "type": "string",
                          "description": "拡張子を除く保存名。日本語可。"
                        },
                        "size": {
                          "type": "string",
                          "enum": ["1024x1024", "1536x1024", "1024x1536"],
                          "description": "正方形、横長、縦長。既定は 1024x1024。"
                        },
                        "quality": {
                          "type": "string",
                          "enum": ["low", "medium", "high"],
                          "description": "既定は medium。試作は low、最終成果物は high。"
                        },
                        "background": {
                          "type": "string",
                          "enum": ["auto", "opaque", "transparent"],
                          "description": "既定は auto。アイコンや素材は transparent。"
                        },
                        "owner": {
                          "type": "string",
                          "description": "依頼者のメールアドレス。認証済みの話者が分かる場合はコード側でその値に固定される。"
                        },
                        "sensitivity": {
                          "type": "string",
                          "enum": ["public", "internal", "personal"],
                          "description": "生成物の取り扱い区分。迷ったら厳しい方を選ぶ。"
                        }
                      },
                      "required": ["prompt", "sensitivity"]
                    }
                    """)),
            (arguments, cancellationToken) => GenerateAsync(
                graphToken, authenticatedUserEmail, arguments, cancellationToken)),
    ];

    private async Task<string> GenerateAsync(
        string graphToken,
        string? authenticatedUserEmail,
        JsonElement arguments,
        CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return "ツールがエラーを返しました: 画像生成モデルが構成されていません。";
        }

        string prompt = ReadString(arguments, "prompt")?.Trim() ?? string.Empty;
        if (prompt.Length == 0)
        {
            return "ツールがエラーを返しました: prompt が必要です。";
        }
        if (prompt.Length > MaxPromptLength)
        {
            return $"ツールがエラーを返しました: prompt は {MaxPromptLength:N0} 文字以内にしてください。";
        }

        string size = Allowed(arguments, "size", Sizes, "1024x1024");
        string quality = Allowed(arguments, "quality", Qualities, "medium");
        string background = Allowed(arguments, "background", Backgrounds, "auto");
        string sensitivity = ReadString(arguments, "sensitivity")?.ToLowerInvariant() ?? string.Empty;
        if (Sensitivity.Normalize(sensitivity) is null)
        {
            return "ツールがエラーを返しました: sensitivity は public / internal / personal のいずれかです。";
        }

        string payload = JsonSerializer.Serialize(new
        {
            model = _deployment,
            prompt,
            n = 1,
            size,
            quality,
            background,
            output_format = "png",
        });

        AccessToken token = await credential.GetTokenAsync(
            new TokenRequestContext([CognitiveServicesScope]), cancellationToken);

        using HttpClient http = httpClientFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(configuration.GetValue("ImageGeneration:TimeoutSeconds", 300));
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);

        using var content = new StringContent(payload, Encoding.UTF8, "application/json");
        using HttpResponseMessage response = await http.PostAsync(
            $"{_endpoint}/openai/v1/images/generations", content, cancellationToken);
        string body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning(
                "Image generation returned {Status}: {Body}",
                (int)response.StatusCode,
                AgentBrain.Truncate(body, 500));
            return $"ツールがエラーを返しました: 画像生成が HTTP {(int)response.StatusCode} を返しました。";
        }

        byte[]? image = ReadImage(body);
        if (image is null || image.Length == 0)
        {
            return "ツールがエラーを返しました: 画像生成の応答に画像データがありませんでした。";
        }

        string baseName = SafeFileName(ReadString(arguments, "filename") ?? $"generated-{DateTimeOffset.UtcNow:yyyyMMdd-HHmmss}");
        string fileName = (baseName.Length == 0 ? $"generated-{DateTimeOffset.UtcNow:yyyyMMdd-HHmmss}" : baseName) + ".png";
        JsonElement deliveryArguments = JsonSerializer.SerializeToElement(new
        {
            title = prompt.Length <= 160 ? prompt : prompt[..160],
            owner = authenticatedUserEmail ?? ReadString(arguments, "owner"),
            sensitivity,
            delivery = "link",
        });

        string delivered = await delivery.DeliverAsync(
            graphToken, fileName, "image/png", image, deliveryArguments, cancellationToken);
        logger.LogInformation(
            "Generated image {File} with {Deployment} ({Size}, {Quality}, {Bytes} bytes)",
            fileName, _deployment, size, quality, image.Length);
        return delivered + $"\n生成条件: {size} / {quality} / 背景 {background}";
    }

    private static byte[]? ReadImage(string body)
    {
        using JsonDocument document = JsonDocument.Parse(body);
        if (!document.RootElement.TryGetProperty("data", out JsonElement data)
            || data.ValueKind != JsonValueKind.Array
            || data.GetArrayLength() == 0)
        {
            return null;
        }

        JsonElement first = data[0];
        string? encoded = ReadString(first, "b64_json");
        return encoded is { Length: > 0 } ? Convert.FromBase64String(encoded) : null;
    }

    private static string Allowed(
        JsonElement arguments, string name, HashSet<string> allowed, string fallback)
    {
        string? value = ReadString(arguments, name)?.ToLowerInvariant();
        return value is not null && allowed.Contains(value) ? value : fallback;
    }

    private static string SafeFileName(string value)
    {
        var invalid = new HashSet<char>(Path.GetInvalidFileNameChars())
            { '/', '\\', ':', '#', '%', '?', '*', '"', '<', '>', '|' };
        string cleaned = new(value.Where(character => !invalid.Contains(character) && !char.IsControl(character)).ToArray());
        cleaned = cleaned.Trim().Trim('.');
        return cleaned.Length > 80 ? cleaned[..80] : cleaned;
    }

    private static JsonElement Schema(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static string? ReadString(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(name, out JsonElement value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}

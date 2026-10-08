using System.Text.RegularExpressions;
using Microsoft.Agents.Core.Models;

/// <summary>
/// Turns the image links the model writes into Teams attachments.
/// Teams does not render Markdown images inside a bot's message text, so the links are
/// lifted out of the reply and re-sent as image attachments, which Teams shows inline.
/// </summary>
public static partial class ReplyImages
{
    private const int MaxImages = 5;

    public static (string Text, List<Attachment> Attachments) Split(string reply)
    {
        var attachments = new List<Attachment>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        string text = MarkdownImage().Replace(reply, match =>
        {
            string url = match.Groups["url"].Value.TrimEnd('.', ',', '。', '、');
            string alt = match.Groups["alt"].Value.Trim();

            if (!IsDisplayableImageUrl(url) || attachments.Count >= MaxImages || !seen.Add(url))
            {
                return alt;
            }

            attachments.Add(new Attachment
            {
                ContentType = ContentTypeFor(url),
                ContentUrl = url,
                Name = alt.Length == 0 ? null : alt,
            });

            return alt;
        });

        return (CollapseBlankLines(text).Trim(), attachments);
    }

    /// <summary>Only plain https images are forwarded; data:, javascript: and http: links are dropped.</summary>
    private static bool IsDisplayableImageUrl(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out Uri? uri)
        && uri.Scheme == Uri.UriSchemeHttps
        && url.Length <= 2000;

    private static string ContentTypeFor(string url) =>
        Path.GetExtension(new Uri(url).AbsolutePath).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".bmp" => "image/bmp",
            _ => "image/png",
        };

    private static string CollapseBlankLines(string text) =>
        BlankLines().Replace(text, "\n\n");

    [GeneratedRegex(@"!\[(?<alt>[^\]\n]*)\]\(\s*(?<url>[^\s)]+)\s*\)", RegexOptions.None, 1000)]
    private static partial Regex MarkdownImage();

    [GeneratedRegex(@"(\r?\n){3,}", RegexOptions.None, 1000)]
    private static partial Regex BlankLines();
}

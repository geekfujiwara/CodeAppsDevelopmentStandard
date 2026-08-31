// モデルが自然に書く Markdown を、Teams チャットと Outlook の**両方**が解釈できる HTML へ変換する。
//
// なぜ要るのか:
//   Teams も Outlook も、プレーン テキストで送ると URL がただの文字列になり、箇条書きも表も潰れる。
//   一方でモデルに「HTML で書け」と指示すると、タグの閉じ忘れとエスケープ漏れが必ず出る。
//   **モデルには Markdown を書かせ、変換はコードでやる**のが唯一安定する形。
//
// 安全性:
//   最初に必ず HtmlEncode してからタグを組み立てる。したがって、Web ページや受信メール、
//   取り込んだファイル由来の文字列がそのまま本文に混ざっても、マークアップとしては成立しない。
//   リンクは \u0001n\u0001 のプレースホルダーへ退避してから太字などの置換を通すので、
//   href の中身が後段の正規表現で壊れることもない。
//
// 使いどころ（同じ変換を両方で使うこと。チャネルごとに書き分けると必ず片方が腐る）:
//   Teams  … POST /chats/{id}/messages   body = { contentType = "html", content = FromMarkdown(text) }
//   メール … POST /me/messages/{id}/reply message.body = { contentType = "HTML", content = FromMarkdown(text) }
//
// 対応する記法: 見出し / 箇条書き・番号付き（入れ子可）/ 引用 / 水平線 / 表 /
//               **強調** / ~~打ち消し~~ / `コード` / [表示文字](URL) / 裸の URL
//
// 名前空間だけプロジェクトに合わせて置き換える。

using System.Text;
using System.Text.RegularExpressions;

namespace <RootNamespace>;

/// <summary>
/// Converts the Markdown the model naturally writes into the HTML subset Teams chat and Outlook
/// both render. Everything is HTML-encoded before any tag is added, so tool output can never
/// inject markup.
/// </summary>
public static partial class MessageHtml
{
    private const int MaxLinkTextLength = 60;

    private static readonly HashSet<string> DocumentExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".docx", ".doc", ".xlsx", ".xls", ".xlsm", ".csv", ".pptx", ".ppt", ".pdf",
        ".txt", ".md", ".json", ".xml", ".zip", ".png", ".jpg", ".jpeg", ".gif", ".svg",
    };

    public static string FromMarkdown(string? markdown)
    {
        string[] lines = (markdown ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Split('\n');

        var html = new StringBuilder();
        var lists = new List<ListLevel>();
        var table = new List<string[]>();

        foreach (string line in lines)
        {
            if (TableRow().IsMatch(line))
            {
                table.Add(SplitCells(line));
                continue;
            }

            FlushTable(html, table);

            if (line.Trim().Length == 0)
            {
                CloseLists(html, lists, 0, closeAll: true);
                continue;
            }

            if (Divider().IsMatch(line))
            {
                CloseLists(html, lists, 0, closeAll: true);
                html.Append("<hr>");
                continue;
            }

            Match heading = Heading().Match(line);
            if (heading.Success)
            {
                CloseLists(html, lists, 0, closeAll: true);
                string tag = heading.Groups[1].Value.Length <= 2 ? "h3" : "p";
                string inner = Inline(heading.Groups[2].Value);
                html.Append($"<{tag}>{(tag == "p" ? $"<b>{inner}</b>" : inner)}</{tag}>");
                continue;
            }

            Match quote = Quote().Match(line);
            if (quote.Success)
            {
                CloseLists(html, lists, 0, closeAll: true);
                html.Append($"<blockquote>{Inline(quote.Groups[1].Value)}</blockquote>");
                continue;
            }

            Match bullet = Bullet().Match(line);
            Match numbered = Numbered().Match(line);
            if (bullet.Success || numbered.Success)
            {
                Match item = bullet.Success ? bullet : numbered;
                string tag = bullet.Success ? "ul" : "ol";
                int indent = IndentOf(item.Groups[1].Value);
                OpenList(html, lists, tag, indent);
                html.Append($"<li>{Inline(item.Groups[^1].Value)}");
                lists[^1].ItemOpen = true;
                continue;
            }

            // 箇条書きの続き（インデントされた行）は、直前の項目に折り返しとしてぶら下げる。
            if (lists.Count > 0 && lists[^1].ItemOpen && char.IsWhiteSpace(line[0]))
            {
                html.Append($"<br>{Inline(line)}");
                continue;
            }

            CloseLists(html, lists, 0, closeAll: true);
            html.Append($"<p>{Inline(line)}</p>");
        }

        FlushTable(html, table);
        CloseLists(html, lists, 0, closeAll: true);
        return html.ToString();
    }

    private sealed class ListLevel(string tag, int indent)
    {
        public string Tag { get; } = tag;

        public int Indent { get; } = indent;

        public bool ItemOpen { get; set; }
    }

    private static int IndentOf(string leading) =>
        leading.Replace("\t", "  ", StringComparison.Ordinal).Length / 2;

    private static void OpenList(StringBuilder html, List<ListLevel> lists, string tag, int indent)
    {
        CloseLists(html, lists, indent, closeAll: false);

        if (lists.Count > 0 && lists[^1].Indent == indent)
        {
            CloseItem(html, lists[^1]);

            if (lists[^1].Tag != tag)
            {
                html.Append($"</{lists[^1].Tag}>");
                lists.RemoveAt(lists.Count - 1);
            }
        }

        if (lists.Count == 0 || lists[^1].Indent < indent)
        {
            html.Append($"<{tag}>");
            lists.Add(new ListLevel(tag, indent));
        }
    }

    private static void CloseLists(StringBuilder html, List<ListLevel> lists, int indent, bool closeAll)
    {
        while (lists.Count > 0 && (closeAll || lists[^1].Indent > indent))
        {
            ListLevel level = lists[^1];
            CloseItem(html, level);
            html.Append($"</{level.Tag}>");
            lists.RemoveAt(lists.Count - 1);

            // 入れ子だった場合、親の <li> は子リストを抱えたまま開いているので閉じる。
            if (lists.Count > 0)
            {
                CloseItem(html, lists[^1]);
            }
        }
    }

    private static void CloseItem(StringBuilder html, ListLevel level)
    {
        if (level.ItemOpen)
        {
            html.Append("</li>");
            level.ItemOpen = false;
        }
    }

    private static void FlushTable(StringBuilder html, List<string[]> rows)
    {
        if (rows.Count == 0)
        {
            return;
        }

        var body = rows.Where(row => !row.All(cell => TableDividerCell().IsMatch(cell))).ToList();
        bool hasHeader = rows.Count > 1 && rows[1].All(cell => TableDividerCell().IsMatch(cell));

        html.Append("<table>");
        for (int index = 0; index < body.Count; index++)
        {
            string cellTag = hasHeader && index == 0 ? "th" : "td";
            html.Append("<tr>");
            foreach (string cell in body[index])
            {
                html.Append($"<{cellTag}>{Inline(cell)}</{cellTag}>");
            }

            html.Append("</tr>");
        }

        html.Append("</table>");
        rows.Clear();
    }

    private static string[] SplitCells(string line)
    {
        string trimmed = line.Trim().Trim('|');
        return [.. trimmed.Split('|').Select(cell => cell.Trim())];
    }

    private static string Inline(string text)
    {
        string escaped = System.Net.WebUtility.HtmlEncode(text.Trim());
        var links = new List<string>();

        string result = MarkdownLink().Replace(escaped, match =>
            Placeholder(links, Anchor(match.Groups[2].Value, match.Groups[1].Value)));

        result = BareUrl().Replace(result, match =>
        {
            string url = match.Value.TrimEnd('.', ',', ';', ':', ')', ']', '}', '。', '、', '）', '】');
            string tail = match.Value[url.Length..];
            return Placeholder(links, Anchor(url, LinkLabel(url))) + tail;
        });

        result = Bold().Replace(result, "<b>$1</b>");
        result = Strike().Replace(result, "<s>$1</s>");
        result = Code().Replace(result, "<code>$1</code>");

        for (int index = 0; index < links.Count; index++)
        {
            result = result.Replace($"\u0001{index}\u0001", links[index], StringComparison.Ordinal);
        }

        return result;
    }

    private static string Placeholder(List<string> links, string anchor)
    {
        links.Add(anchor);
        return $"\u0001{links.Count - 1}\u0001";
    }

    private static string Anchor(string href, string label)
    {
        string text = label.Trim();
        if (text.Length == 0 || text.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            || text.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            text = LinkLabel(href);
        }

        return $"""<a href="{href}">{Shorten(text)}</a>""";
    }

    private static string Shorten(string text)
    {
        if (text.Length <= MaxLinkTextLength)
        {
            return text;
        }

        string cut = text[..MaxLinkTextLength];
        int entity = cut.LastIndexOf('&');

        // HTML エンティティの途中で切ると壊れた文字が出るので、その手前まで戻す。
        return (entity >= 0 && !cut[entity..].Contains(';', StringComparison.Ordinal) ? cut[..entity] : cut) + "…";
    }

    /// <summary>
    /// 生の URL を人が読める見出しに変える。ファイル名が読み取れればファイル名、
    /// 取れなければサイト名を使う。URL 自体は本文に出さず、リンクの飛び先だけに残す。
    /// </summary>
    private static string LinkLabel(string encodedUrl)
    {
        string url = System.Net.WebUtility.HtmlDecode(encodedUrl);
        if (!Uri.TryCreate(url, UriKind.Absolute, out Uri? uri))
        {
            return encodedUrl;
        }

        return System.Net.WebUtility.HtmlEncode(FileNameOf(uri) ?? SiteNameOf(uri));
    }

    private static string? FileNameOf(Uri uri)
    {
        // SharePoint / OneDrive の共有リンクは、パスではなくクエリにファイル名が入っていることがある。
        foreach (string key in (string[])["file", "filename"])
        {
            string? value = QueryValue(uri, key);
            if (value is { Length: > 0 } && DocumentExtensions.Contains(Path.GetExtension(value)))
            {
                return value;
            }
        }

        string last = Uri.UnescapeDataString(uri.Segments.Length > 0 ? uri.Segments[^1] : string.Empty).Trim('/');
        return last.Length > 0 && DocumentExtensions.Contains(Path.GetExtension(last)) ? last : null;
    }

    private static string SiteNameOf(Uri uri)
    {
        string host = uri.Host.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? uri.Host[4..] : uri.Host;
        return host.EndsWith("sharepoint.com", StringComparison.OrdinalIgnoreCase)
               || host.Equals("1drv.ms", StringComparison.OrdinalIgnoreCase)
            ? "共有ファイル"
            : host;
    }

    private static string? QueryValue(Uri uri, string key)
    {
        foreach (string pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            int separator = pair.IndexOf('=', StringComparison.Ordinal);
            if (separator > 0 && pair[..separator].Equals(key, StringComparison.OrdinalIgnoreCase))
            {
                return Uri.UnescapeDataString(pair[(separator + 1)..]);
            }
        }

        return null;
    }

    [GeneratedRegex(@"^(#{1,6})\s+(.*)$")]
    private static partial Regex Heading();

    [GeneratedRegex(@"^(\s*)[-*・]\s+(.*)$")]
    private static partial Regex Bullet();

    [GeneratedRegex(@"^(\s*)\d+[.)]\s+(.*)$")]
    private static partial Regex Numbered();

    [GeneratedRegex(@"^\s*>\s?(.*)$")]
    private static partial Regex Quote();

    [GeneratedRegex(@"^\s*(-{3,}|\*{3,}|_{3,})\s*$")]
    private static partial Regex Divider();

    [GeneratedRegex(@"^\s*\|.*\|\s*$")]
    private static partial Regex TableRow();

    [GeneratedRegex(@"^:?-{2,}:?$")]
    private static partial Regex TableDividerCell();

    [GeneratedRegex(@"\[([^\]]+)\]\((https?://[^\s)]+)\)")]
    private static partial Regex MarkdownLink();

    [GeneratedRegex(@"https?://[^\s<>""']+")]
    private static partial Regex BareUrl();

    [GeneratedRegex(@"\*\*([^*]+)\*\*")]
    private static partial Regex Bold();

    [GeneratedRegex(@"~~([^~]+)~~")]
    private static partial Regex Strike();

    [GeneratedRegex(@"`([^`]+)`")]
    private static partial Regex Code();
}


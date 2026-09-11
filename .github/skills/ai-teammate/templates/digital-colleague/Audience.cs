using System.Text.RegularExpressions;

/// <summary>
/// Tells the agent whether it is talking to a colleague or to someone outside the company,
/// which decides the honorific, the tone, and whether an emoji is appropriate.
/// </summary>
public sealed partial class Audience(IConfiguration configuration)
{
    private readonly string[] _internalDomains =
        (configuration["Organization:InternalDomains"] ?? string.Empty)
            .Split([',', ';', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(domain => domain.TrimStart('@').ToLowerInvariant())
            .ToArray();

    public bool IsConfigured => _internalDomains.Length > 0;

    /// <summary>Returns null when the address is missing or the internal domains are not configured.</summary>
    public bool? IsInternal(string? address)
    {
        string? domain = DomainOf(address);
        if (domain is null || !IsConfigured)
        {
            return null;
        }

        return _internalDomains.Any(known =>
            domain.Equals(known, StringComparison.OrdinalIgnoreCase)
            || domain.EndsWith("." + known, StringComparison.OrdinalIgnoreCase));
    }

    public string Label(string? address) => IsInternal(address) switch
    {
        true => "社内",
        false => "社外",
        _ => "不明",
    };

    /// <summary>The tone rules, restated per turn because the right answer depends on who is on the other side.</summary>
    public string ToneRules(string? address)
    {
        return IsInternal(address) switch
        {
            true => "相手は**社内**の人。敬語のまま少し打ち解けた調子で、「さん」付けで呼ぶ。絵文字は 1 つだけ添えてよい。",
            false => "相手は**社外**の人。「様」付けで、丁寧なビジネス文体を通す。絵文字・砕けた表現・内輪の略語は使わない。",
            _ => "相手が社内か社外か判別できない。**社外向けの丁寧な文体**（「様」付け・絵文字なし）で書く。",
        };
    }

    private static string? DomainOf(string? address)
    {
        if (string.IsNullOrWhiteSpace(address))
        {
            return null;
        }

        Match match = MailAddress().Match(address);
        return match.Success ? match.Groups[1].Value.ToLowerInvariant() : null;
    }

    [GeneratedRegex(@"@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})")]
    private static partial Regex MailAddress();
}

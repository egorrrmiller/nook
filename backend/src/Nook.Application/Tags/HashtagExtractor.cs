using System.Text.Json;
using System.Text.RegularExpressions;
using Nook.Application.Documents;

namespace Nook.Application.Tags;

/// <summary>
/// Collects inline <c>#hashtag</c> tokens from projected blocks (contracts §9.2): unicode letters/digits/<c>_</c>/<c>-</c>,
/// at least 2 chars, not inside code (<c>codeBlock</c> blocks and <c>styles.code</c> runs are skipped), not part of a URL.
/// Purely numeric tokens (<c>#42</c>) are ignored. Returns distinct names (first spelling wins; comparison is case-insensitive).
/// </summary>
public static partial class HashtagExtractor
{
    [GeneratedRegex(@"(?<![\p{L}\p{N}_/&#-])#(?<name>[\p{L}\p{N}_-]{2,64})(?![\p{L}\p{N}_-])")]
    private static partial Regex Hashtag();

    public static IReadOnlyList<string> Extract(IEnumerable<FlatBlock> blocks)
    {
        var names = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var block in blocks)
        {
            if (block.Type is "codeBlock") continue;
            foreach (var text in TextRuns(block.Content))
                CollectFrom(text, names, seen);
        }
        return names;
    }

    public static IReadOnlyList<string> ExtractFromText(string text)
    {
        var names = new List<string>();
        CollectFrom(text, names, new HashSet<string>(StringComparer.OrdinalIgnoreCase));
        return names;
    }

    private static void CollectFrom(string text, List<string> names, HashSet<string> seen)
    {
        foreach (Match m in Hashtag().Matches(text))
        {
            var name = m.Groups["name"].Value.TrimEnd('-', '_');
            if (name.Length < 2 || name.All(char.IsDigit)) continue;
            if (seen.Add(name)) names.Add(name);
        }
    }

    /// <summary>Non-code text runs of an inline-content array (or table content), recursively.</summary>
    private static IEnumerable<string> TextRuns(JsonElement? content)
    {
        if (content is not { } c) yield break;
        switch (c.ValueKind)
        {
            case JsonValueKind.Array:
                foreach (var item in c.EnumerateArray())
                {
                    if (item.ValueKind != JsonValueKind.Object) continue;
                    var type = item.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
                    if (type == "text")
                    {
                        if (item.TryGetProperty("styles", out var styles) && styles.ValueKind == JsonValueKind.Object
                            && styles.TryGetProperty("code", out var code) && code.ValueKind == JsonValueKind.True) continue;
                        if (item.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String) yield return text.GetString()!;
                    }
                    else if (type == "link" && item.TryGetProperty("content", out var linkContent))
                    {
                        foreach (var s in TextRuns(linkContent)) yield return s;
                    }
                }
                break;
            case JsonValueKind.Object:
                if (c.TryGetProperty("rows", out var rows) && rows.ValueKind == JsonValueKind.Array)
                {
                    foreach (var row in rows.EnumerateArray())
                    {
                        if (!row.TryGetProperty("cells", out var cells) || cells.ValueKind != JsonValueKind.Array) continue;
                        foreach (var cell in cells.EnumerateArray())
                        {
                            if (cell.ValueKind == JsonValueKind.Array) { foreach (var s in TextRuns(cell)) yield return s; }
                            else if (cell.ValueKind == JsonValueKind.Object && cell.TryGetProperty("content", out var cc)) { foreach (var s in TextRuns(cc)) yield return s; }
                        }
                    }
                }
                break;
        }
    }
}

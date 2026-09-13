using System.Text;
using System.Text.RegularExpressions;

namespace Nook.Application.Search;

/// <summary>
/// Contracts §9.5 query grammar: whitespace-separated terms are AND-ed with prefix matching, <c>"quoted phrase"</c> is a
/// phrase, <c>-term</c> excludes, <c>title:foo</c> restricts to titles. Produces a <c>to_tsquery</c> expression
/// (same string for the russian and english configurations — each normalises lexemes itself).
/// </summary>
public sealed partial class SearchQueryParser
{
    public sealed record Parsed(
        /// <summary>Text for <c>to_tsquery(cfg, …)</c>; empty when the query has no content terms.</summary>
        string TsQuery,
        /// <summary>Plain terms (unquoted, non-negated, non-title) joined by spaces — for trigram similarity / ILIKE.</summary>
        string Raw,
        IReadOnlyList<string> Terms,
        IReadOnlyList<string> Phrases,
        IReadOnlyList<string> Excluded,
        IReadOnlyList<string> TitleTerms)
    {
        public bool HasContentQuery => TsQuery.Length > 0;
        public bool IsEmpty => Terms.Count == 0 && Phrases.Count == 0 && TitleTerms.Count == 0;
    }

    [GeneratedRegex(@"(?<neg>-)?(?:(?<field>title):)?(?:""(?<phrase>[^""]*)""|(?<term>\S+))", RegexOptions.CultureInvariant)]
    private static partial Regex Token();

    [GeneratedRegex(@"[&|!()<>:*'\\]+")]
    private static partial Regex Unsafe();

    public static Parsed Parse(string? query)
    {
        var terms = new List<string>();
        var phrases = new List<string>();
        var excluded = new List<string>();
        var titleTerms = new List<string>();
        var parts = new List<string>();

        foreach (Match m in Token().Matches(query ?? ""))
        {
            var negated = m.Groups["neg"].Success;
            var isTitle = m.Groups["field"].Success;
            if (m.Groups["phrase"].Success)
            {
                var words = Words(m.Groups["phrase"].Value);
                if (words.Count == 0) continue;
                if (isTitle) { titleTerms.Add(string.Join(' ', words)); continue; }
                var phrase = words.Count == 1 ? $"'{words[0]}'" : "(" + string.Join(" <-> ", words.Select(w => $"'{w}'")) + ")";
                if (negated) { excluded.Add(string.Join(' ', words)); parts.Add("!" + phrase); }
                else { phrases.Add(string.Join(' ', words)); parts.Add(phrase); }
                continue;
            }
            var raw = m.Groups["term"].Value;
            if (raw == "-" || raw.Length == 0) continue;
            var cleaned = Words(raw);
            if (cleaned.Count == 0) continue;
            if (isTitle) { titleTerms.Add(string.Join(' ', cleaned)); continue; }
            if (negated)
            {
                excluded.AddRange(cleaned);
                parts.AddRange(cleaned.Select(w => $"!'{w}'"));
            }
            else
            {
                terms.AddRange(cleaned);
                parts.AddRange(cleaned.Select(w => $"'{w}':*"));
            }
        }

        // A query made only of exclusions matches nothing useful; drop them so "-foo" alone yields an empty tsquery.
        var positive = terms.Count > 0 || phrases.Count > 0;
        var ts = positive ? string.Join(" & ", parts) : "";
        return new Parsed(ts, string.Join(' ', terms.Concat(phrases)), terms, phrases, excluded, titleTerms);
    }

    /// <summary>Splits on whitespace/punctuation and strips tsquery syntax characters. Keeps letters, digits, <c>_</c>, <c>-</c>, <c>#</c>.</summary>
    private static List<string> Words(string s)
    {
        var result = new List<string>();
        var sb = new StringBuilder();
        foreach (var ch in Unsafe().Replace(s, " "))
        {
            if (char.IsLetterOrDigit(ch) || ch is '_' or '-' or '#' or '@' or '.')
            {
                sb.Append(ch);
            }
            else if (sb.Length > 0)
            {
                Flush(sb, result);
            }
        }
        if (sb.Length > 0) Flush(sb, result);
        return result;

        static void Flush(StringBuilder sb, List<string> into)
        {
            var w = sb.ToString().Trim('-', '.', '#', '@', '_');
            sb.Clear();
            if (w.Length > 0 && w.Length <= 100) into.Add(w.ToLowerInvariant());
        }
    }
}

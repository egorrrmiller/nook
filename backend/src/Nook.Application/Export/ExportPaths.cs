using System.Text;
using System.Text.RegularExpressions;

namespace Nook.Application.Export;

/// <summary>File-name sanitising and relative-path helpers for the Notion-like zip layout.</summary>
public static partial class ExportPaths
{
    public const int MaxNameLength = 120;

    [GeneratedRegex(@"[\x00-\x1f<>:""/\\|?*]+")]
    private static partial Regex Forbidden();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();

    public static string SafeName(string? title, string fallback = "Untitled")
    {
        var s = Forbidden().Replace(title ?? "", " ");
        s = Spaces().Replace(s, " ").Trim().Trim('.');
        if (s.Length == 0) s = fallback;
        if (s.Length > MaxNameLength) s = s[..MaxNameLength].TrimEnd();
        return s;
    }

    /// <summary>Makes <paramref name="name"/> unique within <paramref name="taken"/> (case-insensitive) by appending <c> (2)</c>, <c> (3)</c>, …</summary>
    public static string Unique(string name, ISet<string> taken)
    {
        var candidate = name;
        var i = 2;
        while (!taken.Add(candidate)) candidate = $"{name} ({i++})";
        return candidate;
    }

    /// <summary>Relative path from the directory containing <paramref name="fromFile"/> to <paramref name="toFile"/> ('/' separated, url-encoded segments).</summary>
    public static string Relative(string fromFile, string toFile)
    {
        var from = fromFile.Split('/', StringSplitOptions.RemoveEmptyEntries);
        var to = toFile.Split('/', StringSplitOptions.RemoveEmptyEntries);
        var fromDir = from.Length > 0 ? from[..^1] : [];
        var common = 0;
        while (common < fromDir.Length && common < to.Length - 1 && string.Equals(fromDir[common], to[common], StringComparison.Ordinal)) common++;
        var sb = new StringBuilder();
        for (var i = common; i < fromDir.Length; i++) sb.Append("../");
        for (var i = common; i < to.Length; i++)
        {
            if (i > common) sb.Append('/');
            sb.Append(Uri.EscapeDataString(to[i]));
        }
        return sb.Length == 0 ? Uri.EscapeDataString(to[^1]) : sb.ToString();
    }
}

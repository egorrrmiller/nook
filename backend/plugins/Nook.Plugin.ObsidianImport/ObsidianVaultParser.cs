using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Nook.Plugin.ObsidianImport;

/// <summary>
/// Pure, side-effect-free Obsidian vault parser. It deliberately produces a host-neutral import plan.
/// </summary>
public sealed class ObsidianVaultParser
{
    private static readonly Regex Heading = new(@"^\s*(?<marks>#{1,6})\s+(?<text>.+?)\s*#*\s*$", RegexOptions.Compiled);
    private static readonly Regex WikiLink = new(@"(?<embed>!)?\[\[(?<target>[^\]|#]+)?(?:#(?<heading>[^\]|]+))?(?:\|(?<display>[^\]]+))?\]\]", RegexOptions.Compiled);
    private static readonly Regex MarkdownLink = new(@"(?<embed>!)?\[(?<display>[^\]]*)\]\((?<target>[^)\s]+)(?:\s+[^)]*)?\)", RegexOptions.Compiled);
    private static readonly Regex Tag = new(@"(?<![\w/#])#(?<tag>[\p{L}\p{N}_][\p{L}\p{N}_-]*)", RegexOptions.Compiled);
    private static readonly Regex Callout = new(@"^\s*>\s*\[!(?<type>[A-Za-z0-9_-]+)\](?<fold>[+-])?\s*(?<title>.*)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex Key = new(@"^(?<indent>\s*)(?<key>[A-Za-z_][A-Za-z0-9_.:/-]*)\s*:\s*(?<value>.*)$", RegexOptions.Compiled);

    private static readonly HashSet<string> PageExtensions = new(StringComparer.OrdinalIgnoreCase) { ".md", ".markdown" };
    private static readonly HashSet<string> KnownFrontmatter = new(StringComparer.OrdinalIgnoreCase)
    {
        "title", "tags", "aliases", "cssclasses", "publish", "draft", "date", "created", "updated",
    };

    public ObsidianImportPlan Parse(IReadOnlyList<ObsidianVaultFile> inputFiles)
    {
        var diagnostics = new List<ObsidianImportDiagnostic>();
        var files = new Dictionary<string, ObsidianVaultFile>(StringComparer.OrdinalIgnoreCase);

        foreach (var input in inputFiles)
        {
            var path = NormalizePath(input.RawPath);
            if (path is null)
            {
                diagnostics.Add(Error("path.unsafe", input.RawPath, "The vault path is absolute, traverses outside the vault, or contains an invalid segment; the file was skipped."));
                continue;
            }

            if (IsIgnoredPath(path))
            {
                diagnostics.Add(Warning("path.ignored", path, "Obsidian metadata or a macOS helper file was skipped."));
                continue;
            }

            if (!files.TryAdd(path, input with { RawPath = path }))
            {
                diagnostics.Add(Error("path.duplicate", path, "Two vault files normalize to the same path; the first file was kept."));
            }
        }

        var pages = files.Values
            .Where(f => PageExtensions.Contains(Path.GetExtension(f.RawPath)))
            .OrderBy(f => f.RawPath, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var pagePaths = pages.Select(p => p.RawPath).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var allPaths = files.Keys.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var folders = BuildFolders(allPaths);
        var pagePlans = new List<ObsidianPagePlan>(pages.Count);
        var attachmentRefs = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);

        foreach (var file in pages)
        {
            var page = ParsePage(file, pagePaths, allPaths, diagnostics);
            pagePlans.Add(page);
            foreach (var reference in page.References)
            {
                if (reference.ResolvedPath is null || !allPaths.Contains(reference.ResolvedPath)) continue;
                if (PageExtensions.Contains(Path.GetExtension(reference.ResolvedPath))) continue;
                if (!attachmentRefs.TryGetValue(reference.ResolvedPath, out var owners))
                {
                    owners = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    attachmentRefs.Add(reference.ResolvedPath, owners);
                }
                owners.Add(page.Path);
            }
        }

        foreach (var page in pagePlans)
        {
            foreach (var reference in page.References.Where(r => r.IsBroken))
            {
                diagnostics.Add(Warning("link.broken", page.Path, $"Could not resolve '{reference.Raw}'. The reference was preserved in the import plan."));
            }
        }

        var attachments = files.Values
            .Where(f => !PageExtensions.Contains(Path.GetExtension(f.RawPath)) && !f.RawPath.EndsWith(".canvas", StringComparison.OrdinalIgnoreCase))
            .OrderBy(f => f.RawPath, StringComparer.OrdinalIgnoreCase)
            .Select(f => new ObsidianAttachmentPlan(
                f.RawPath,
                Path.GetFileName(f.RawPath),
                MimeFor(f.RawPath),
                f.Content.LongLength,
                f.Content,
                attachmentRefs.GetValueOrDefault(f.RawPath)?.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray() ?? []))
            .ToList();

        foreach (var file in files.Values.Where(f => f.RawPath.EndsWith(".canvas", StringComparison.OrdinalIgnoreCase)))
        {
            diagnostics.Add(Warning("canvas.unsupported", file.RawPath, ".canvas was intentionally skipped; Canvas import is not part of this wave."));
        }

        return new ObsidianImportPlan(folders, pagePlans, attachments, diagnostics);
    }

    public static string? NormalizePath(string? rawPath)
    {
        if (string.IsNullOrWhiteSpace(rawPath) || rawPath.Contains('\0')) return null;
        var raw = rawPath.Replace('\\', '/');
        if (raw.StartsWith('/') || Regex.IsMatch(raw, "^[A-Za-z]:/")) return null;

        var segments = new List<string>();
        foreach (var segment in raw.Split('/', StringSplitOptions.RemoveEmptyEntries))
        {
            if (segment is ".") continue;
            if (segment is "..")
            {
                if (segments.Count == 0) return null;
                segments.RemoveAt(segments.Count - 1);
                continue;
            }
            if (segment.Length > 255 || segment.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || segment.Any(c => c < 32 || c == ':')) return null;
            segments.Add(segment);
        }

        return segments.Count == 0 ? null : string.Join('/', segments);
    }

    private ObsidianPagePlan ParsePage(
        ObsidianVaultFile file,
        IReadOnlySet<string> pagePaths,
        IReadOnlySet<string> allPaths,
        List<ObsidianImportDiagnostic> diagnostics)
    {
        var markdown = DecodeUtf8(file.Content);
        var frontmatter = ParseFrontmatter(markdown, file.RawPath, diagnostics);
        var body = frontmatter.Body;
        var title = frontmatter.Title ?? FirstHeading(body) ?? Path.GetFileNameWithoutExtension(file.RawPath);
        var references = ExtractReferences(body, file.RawPath, pagePaths, allPaths, diagnostics);
        var tags = frontmatter.Tags.Concat(ExtractTags(body)).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray();

        return new ObsidianPagePlan(
            file.RawPath,
            Limit(title.Trim(), 1000, "Untitled"),
            Parent(file.RawPath),
            frontmatter.Properties,
            tags,
            body,
            ExtractBlocks(body),
            references);
    }

    private static IReadOnlyList<ObsidianFolderPlan> BuildFolders(IEnumerable<string> paths)
    {
        var allFolders = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in paths)
        {
            var parent = Parent(path);
            while (!string.IsNullOrEmpty(parent))
            {
                allFolders.Add(parent);
                parent = Parent(parent);
            }
        }

        return allFolders
            .OrderBy(p => p.Count(c => c == '/'))
            .ThenBy(p => p, StringComparer.OrdinalIgnoreCase)
            .Select(p => new ObsidianFolderPlan(p, LastSegment(p), Parent(p)))
            .ToArray();
    }

    private static FrontmatterResult ParseFrontmatter(string markdown, string path, List<ObsidianImportDiagnostic> diagnostics)
    {
        var text = markdown.TrimStart('\uFEFF');
        if (!text.StartsWith("---", StringComparison.Ordinal) || (text.Length > 3 && text[3] is not '\r' and not '\n'))
            return new FrontmatterResult(null, new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase), [], markdown);

        var lines = text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        var closing = Array.FindIndex(lines, 1, line => line.Trim() is "---" or "...");
        if (closing < 0)
        {
            diagnostics.Add(Warning("frontmatter.unclosed", path, "Frontmatter starts with '---' but has no closing delimiter; it was left in the Markdown body."));
            return new FrontmatterResult(null, new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase), [], markdown);
        }

        var properties = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
        var tags = new List<string>();
        string? title = null;
        for (var i = 1; i < closing; i++)
        {
            var line = lines[i];
            if (string.IsNullOrWhiteSpace(line) || line.TrimStart().StartsWith('#')) continue;
            var match = Key.Match(line);
            if (!match.Success)
            {
                diagnostics.Add(Warning("frontmatter.invalid", path, $"Could not parse frontmatter line {i + 1}; the line was ignored."));
                continue;
            }

            var key = match.Groups["key"].Value.Trim();
            var valueText = StripYamlComment(match.Groups["value"].Value.Trim());
            if (properties.ContainsKey(key))
            {
                diagnostics.Add(Warning("frontmatter.duplicate", path, $"Frontmatter key '{key}' appears more than once; the last value was kept."));
            }
            if (!KnownFrontmatter.Contains(key))
            {
                diagnostics.Add(Warning("frontmatter.unknown", path, $"Unknown frontmatter key '{key}' was preserved as a page property."));
            }

            if (valueText.Length == 0 && i + 1 < closing && lines[i + 1].TrimStart().StartsWith("- ", StringComparison.Ordinal))
            {
                var values = new List<JsonElement>();
                while (i + 1 < closing && lines[i + 1].TrimStart().StartsWith("- ", StringComparison.Ordinal))
                {
                    i++;
                    values.Add(ParseYamlScalar(StripYamlComment(lines[i].TrimStart()[2..].Trim())));
                }
                properties[key] = JsonSerializer.SerializeToElement(values.Select(v => v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString()).ToArray());
            }
            else
            {
                properties[key] = ParseYamlScalar(valueText);
            }

            if (string.Equals(key, "title", StringComparison.OrdinalIgnoreCase) && properties[key].ValueKind == JsonValueKind.String)
                title = properties[key].GetString();
            if (string.Equals(key, "tags", StringComparison.OrdinalIgnoreCase)) tags.AddRange(ExtractPropertyTags(properties[key]));
        }

        var body = string.Join('\n', lines[(closing + 1)..]);
        return new FrontmatterResult(title, properties, tags, body);
    }

    private static JsonElement ParseYamlScalar(string value)
    {
        if (value.Length == 0) return JsonSerializer.SerializeToElement("");
        if (value is "null" or "~") return JsonSerializer.SerializeToElement<object?>(null);
        if (value.Equals("true", StringComparison.OrdinalIgnoreCase)) return JsonSerializer.SerializeToElement(true);
        if (value.Equals("false", StringComparison.OrdinalIgnoreCase)) return JsonSerializer.SerializeToElement(false);
        if (decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var number)) return JsonSerializer.SerializeToElement(number);
        if (value.StartsWith('[') && value.EndsWith(']'))
        {
            var items = SplitYamlList(value[1..^1]).Select(item => ParseYamlScalar(item.Trim())).ToArray();
            return JsonSerializer.SerializeToElement(items.Select(v => v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString()).ToArray());
        }
        if (value.StartsWith('{') && value.EndsWith('}'))
        {
            // Keep inline maps lossless as text rather than pretending this small parser implements YAML.
            return JsonSerializer.SerializeToElement(value);
        }
        if ((value.StartsWith('"') && value.EndsWith('"')) || (value.StartsWith('\'') && value.EndsWith('\'')))
            return JsonSerializer.SerializeToElement(value[1..^1].Replace("\\\"", "\"").Replace("\\'", "'"));
        return JsonSerializer.SerializeToElement(value);
    }

    private static IEnumerable<string> SplitYamlList(string value)
    {
        var start = 0;
        var quote = '\0';
        for (var i = 0; i < value.Length; i++)
        {
            if (value[i] is '\'' or '"') quote = quote == '\0' ? value[i] : quote == value[i] ? '\0' : quote;
            if (value[i] == ',' && quote == '\0')
            {
                yield return value[start..i];
                start = i + 1;
            }
        }
        yield return value[start..];
    }

    private static string StripYamlComment(string value)
    {
        var quote = '\0';
        for (var i = 0; i < value.Length; i++)
        {
            if (value[i] is '\'' or '"') quote = quote == '\0' ? value[i] : quote == value[i] ? '\0' : quote;
            if (value[i] == '#' && quote == '\0' && (i == 0 || char.IsWhiteSpace(value[i - 1]))) return value[..i].TrimEnd();
        }
        return value;
    }

    private static IReadOnlyList<string> ExtractPropertyTags(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Array => value.EnumerateArray().SelectMany(ExtractPropertyTags).ToArray(),
        JsonValueKind.String => value.GetString()!.Split([',', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(t => t.TrimStart('#')).Where(t => t.Length > 0).ToArray(),
        _ => [],
    };

    private static IReadOnlyList<ObsidianReference> ExtractReferences(
        string body,
        string sourcePath,
        IReadOnlySet<string> pagePaths,
        IReadOnlySet<string> allPaths,
        List<ObsidianImportDiagnostic> diagnostics)
    {
        var references = new List<ObsidianReference>();
        var fenced = false;
        foreach (var line in body.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n'))
        {
            if (line.TrimStart().StartsWith("```", StringComparison.Ordinal) || line.TrimStart().StartsWith("~~~", StringComparison.Ordinal))
            {
                fenced = !fenced;
                continue;
            }
            if (fenced) continue;

            foreach (Match match in WikiLink.Matches(line))
            {
                var rawTarget = match.Groups["target"].Value.Trim();
                var heading = match.Groups["heading"].Success ? match.Groups["heading"].Value.Trim() : null;
                var target = string.IsNullOrEmpty(rawTarget) ? sourcePath : rawTarget;
                var resolved = ResolveTarget(target, sourcePath, pagePaths, allPaths, diagnostics);
                references.Add(new ObsidianReference(
                    match.Groups["embed"].Success ? "embed" : "wikilink",
                    match.Value,
                    rawTarget,
                    match.Groups["display"].Success ? match.Groups["display"].Value.Trim() : null,
                    heading,
                    resolved,
                    IsExternalTarget(rawTarget),
                    resolved is null && !IsExternalTarget(rawTarget)));
            }

            foreach (Match match in MarkdownLink.Matches(line))
            {
                var rawTarget = match.Groups["target"].Value.Trim();
                var resolved = ResolveTarget(rawTarget, sourcePath, pagePaths, allPaths, diagnostics);
                references.Add(new ObsidianReference(
                    match.Groups["embed"].Success ? "image" : "markdown-link",
                    match.Value,
                    match.Groups["target"].Value,
                    match.Groups["display"].Value,
                    null,
                    resolved,
                    IsExternalTarget(match.Groups["target"].Value),
                    resolved is null && !IsExternalTarget(match.Groups["target"].Value)));
            }
        }
        return references;
    }

    private static string? ResolveTarget(
        string target,
        string sourcePath,
        IReadOnlySet<string> pagePaths,
        IReadOnlySet<string> allPaths,
        List<ObsidianImportDiagnostic> diagnostics)
    {
        if (IsExternalTarget(target)) return null;
        var hash = target.IndexOfAny(['#', '^']);
        var pathPart = hash >= 0 ? target[..hash] : target;
        if (string.IsNullOrWhiteSpace(pathPart)) return sourcePath;
        var normalized = NormalizePath(Path.Combine(Parent(sourcePath), pathPart).Replace('\\', '/'));
        if (normalized is null) return null;
        if (allPaths.Contains(normalized)) return normalized;

        if (string.IsNullOrEmpty(Path.GetExtension(normalized)))
        {
            foreach (var extension in new[] { ".md", ".markdown" })
            {
                if (allPaths.Contains(normalized + extension)) return normalized + extension;
            }
        }

        var name = Path.GetFileNameWithoutExtension(normalized);
        var matches = pagePaths.Where(p => string.Equals(Path.GetFileNameWithoutExtension(p), name, StringComparison.OrdinalIgnoreCase)).ToArray();
        if (matches.Length == 1) return matches[0];
        if (matches.Length > 1)
            diagnostics.Add(Warning("link.ambiguous", sourcePath, $"'{target}' matches multiple pages; it was left unresolved."));
        return null;
    }

    private static IReadOnlyList<ObsidianBlockPlan> ExtractBlocks(string body)
    {
        var blocks = new List<ObsidianBlockPlan>();
        var lines = body.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        for (var i = 0; i < lines.Length; i++)
        {
            if (string.IsNullOrWhiteSpace(lines[i])) continue;
            var callout = Callout.Match(lines[i]);
            if (callout.Success)
            {
                var content = new List<string>();
                var first = callout.Groups["title"].Value.Trim();
                if (first.Length > 0) content.Add(first);
                var j = i + 1;
                while (j < lines.Length && (lines[j].TrimStart().StartsWith(">", StringComparison.Ordinal)))
                {
                    content.Add(lines[j].TrimStart()[1..].TrimStart());
                    j++;
                }
                blocks.Add(new ObsidianBlockPlan("callout", string.Join('\n', content).Trim(), callout.Groups["type"].Value.ToLowerInvariant(), first.Length == 0 ? null : first, callout.Groups["fold"].Value == "-") );
                i = j - 1;
                continue;
            }

            if (lines[i].TrimStart().StartsWith("```", StringComparison.Ordinal) || lines[i].TrimStart().StartsWith("~~~", StringComparison.Ordinal))
            {
                var marker = lines[i].TrimStart()[..3];
                var code = new List<string>();
                i++;
                while (i < lines.Length && !lines[i].TrimStart().StartsWith(marker, StringComparison.Ordinal))
                {
                    code.Add(lines[i]);
                    i++;
                }
                blocks.Add(new ObsidianBlockPlan("code", string.Join('\n', code)));
                continue;
            }

            var heading = Heading.Match(lines[i]);
            if (heading.Success)
            {
                blocks.Add(new ObsidianBlockPlan($"heading{heading.Groups["marks"].Length}", heading.Groups["text"].Value.Trim()));
                continue;
            }

            var paragraph = new List<string> { lines[i].Trim() };
            while (i + 1 < lines.Length && !string.IsNullOrWhiteSpace(lines[i + 1]) && !Heading.IsMatch(lines[i + 1]) && !Callout.IsMatch(lines[i + 1]))
            {
                if (lines[i + 1].TrimStart().StartsWith("```", StringComparison.Ordinal) || lines[i + 1].TrimStart().StartsWith("~~~", StringComparison.Ordinal)) break;
                paragraph.Add(lines[++i].Trim());
            }
            blocks.Add(new ObsidianBlockPlan("paragraph", string.Join('\n', paragraph)));
        }
        return blocks;
    }

    private static IReadOnlyList<string> ExtractTags(string body)
    {
        var tags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var fenced = false;
        foreach (var sourceLine in body.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n'))
        {
            var line = sourceLine.TrimStart();
            if (line.StartsWith("```", StringComparison.Ordinal) || line.StartsWith("~~~", StringComparison.Ordinal)) { fenced = !fenced; continue; }
            if (fenced) continue;
            line = WikiLink.Replace(line, "");
            line = Regex.Replace(line, "https?://\\S+", "", RegexOptions.IgnoreCase);
            if (Regex.IsMatch(line, "^#{1,6}\\s")) line = Regex.Replace(line, "^#{1,6}\\s+", "");
            foreach (Match tag in Tag.Matches(line)) tags.Add(tag.Groups["tag"].Value);
        }
        return tags.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static string? FirstHeading(string body)
    {
        foreach (var line in body.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n'))
        {
            var heading = Heading.Match(line);
            if (heading.Success) return Regex.Replace(heading.Groups["text"].Value.Trim(), "[*_`]", "");
        }
        return null;
    }

    private static bool IsExternalTarget(string target) =>
        Uri.TryCreate(target, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" or "mailto";

    private static bool IsIgnoredPath(string path) =>
        path.Equals(".DS_Store", StringComparison.OrdinalIgnoreCase) || path.Split('/').Any(s => s.Equals(".obsidian", StringComparison.OrdinalIgnoreCase) || s.Equals("__MACOSX", StringComparison.OrdinalIgnoreCase));

    private static string DecodeUtf8(byte[] bytes) => Encoding.UTF8.GetString(bytes);

    private static ObsidianImportDiagnostic Warning(string code, string? path, string message) => new("warning", code, path, message);
    private static ObsidianImportDiagnostic Error(string code, string? path, string message) => new("error", code, path, message);
    private static string Parent(string path) => path.Contains('/') ? path[..path.LastIndexOf('/')] : "";
    private static string LastSegment(string path) => path[(path.LastIndexOf('/') + 1)..];
    private static string Limit(string value, int max, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback : value.Length <= max ? value : value[..max];

    public static string MimeFor(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".svg" => "image/svg+xml",
        ".avif" => "image/avif",
        ".pdf" => "application/pdf",
        ".mp4" => "video/mp4",
        ".webm" => "video/webm",
        ".mp3" => "audio/mpeg",
        ".wav" => "audio/wav",
        ".txt" => "text/plain",
        _ => "application/octet-stream",
    };

    private sealed record FrontmatterResult(
        string? Title,
        IReadOnlyDictionary<string, JsonElement> Properties,
        IReadOnlyList<string> Tags,
        string Body);
}

using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Collab;
using Nook.Application.Common;
using Nook.Application.Documents;
using Nook.Application.Knowledge;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Plugins.Sdk;

namespace Nook.Application.Export;

/// <summary>
/// Shared engine of the built-in <c>markdown</c> and <c>html</c> exporters (contracts §9.8): Notion-like layout, YAML
/// frontmatter, relative internal links, attachments under <c>files/</c>, block conversion through the collab service with
/// <see cref="IBlockTypeDefinition.RenderMarkdown"/>/<see cref="IBlockTypeDefinition.RenderHtml"/> for custom block types.
/// </summary>
public sealed partial class ZipExportWriter(
    IAppDbContext db,
    ICollabClient collab,
    BlobReader blobs,
    IEnumerable<IBlockTypeDefinition> blockTypes)
{
    public static readonly HashSet<string> DefaultBlockTypes = new(StringComparer.Ordinal)
    {
        "paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "quote", "codeBlock",
        "table", "image", "video", "audio", "file", "divider", "pageBreak",
    };

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [GeneratedRegex(@"\]\((?<href>[^)\s]+)\)")]
    private static partial Regex MarkdownLink();

    [GeneratedRegex(@"(?<attr>href|src)=""(?<href>[^""]+)""")]
    private static partial Regex HtmlLink();

    public async Task WriteAsync(Guid workspaceId, IReadOnlyList<Guid> nodeIds, bool includeChildren, bool includeFiles, string format, Stream output, CancellationToken ct)
    {
        var markdown = format == "markdown";
        var extension = markdown ? ".md" : ".html";

        var all = await db.Nodes.AsNoTracking().Where(n => n.WorkspaceId == workspaceId && n.DeletedAt == null).ToListAsync(ct);
        var byId = all.ToDictionary(n => n.Id);
        var childrenOf = all.Where(n => n.ParentId is not null).GroupBy(n => n.ParentId!.Value)
            .ToDictionary(g => g.Key, g => g.OrderBy(n => n.Position, StringComparer.Ordinal).ThenBy(n => n.CreatedAt).ToList());

        var roots = new List<Node>();
        foreach (var id in nodeIds.Distinct())
        {
            if (byId.TryGetValue(id, out var n)) roots.Add(n);
        }
        if (includeChildren)
        {
            // Drop roots that sit inside another selected root's subtree.
            var rootIds = roots.Select(r => r.Id).ToHashSet();
            roots = roots.Where(r => !Ancestors(r, byId).Any(rootIds.Contains)).ToList();
        }

        var items = ExportPlan.Build(roots, childrenOf, includeChildren, extension);
        var pathByNode = items.ToDictionary(i => i.Node.Id, i => i.FilePath);
        var customTypes = blockTypes.ToDictionary(b => b.TypeName, b => b, StringComparer.Ordinal);

        using var zip = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true);
        var tagsByNode = await TagsAsync(items.Select(i => i.Node.Id).ToArray(), ct);
        var aliasesByNode = await AliasesAsync(items.Select(i => i.Node.Id).ToArray(), ct);

        foreach (var item in items)
        {
            ct.ThrowIfCancellationRequested();
            var node = item.Node;
            var rows = await db.Blocks.AsNoTracking().Where(b => b.NodeId == node.Id).ToListAsync(ct);
            var tree = BlockTreeBuilder.Build(rows);
            var prepared = PrepareBlocks(tree, byId);

            var fileMap = new Dictionary<Guid, string>();
            if (includeFiles)
            {
                var attachments = await db.Attachments.AsNoTracking().Where(a => a.NodeId == node.Id).ToListAsync(ct);
                foreach (var a in attachments)
                {
                    await using var stream = blobs.Open(a.BlobSha);
                    if (stream is null) continue;
                    var fileName = $"{a.BlobSha[..Math.Min(8, a.BlobSha.Length)]}-{ExportPaths.SafeName(a.Filename, "file")}";
                    var filePath = (item.ChildDir.Contains('/') ? item.ChildDir[..item.ChildDir.LastIndexOf('/')] + "/" : "") + "files/" + fileName;
                    if (!fileMap.ContainsValue(filePath))
                    {
                        var entry = zip.CreateEntry(filePath, CompressionLevel.Optimal);
                        await using var es = entry.Open();
                        await stream.CopyToAsync(es, ct);
                    }
                    fileMap[a.Id] = filePath;
                }
            }

            var body = markdown
                ? await RenderMarkdownAsync(prepared, customTypes, ct)
                : await RenderHtmlAsync(prepared, customTypes, ct);
            body = RewriteLinks(body, markdown, item.FilePath, pathByNode, fileMap);

            var content = markdown
                ? Frontmatter(node, tagsByNode.GetValueOrDefault(node.Id) ?? [], aliasesByNode.GetValueOrDefault(node.Id) ?? []) + "\n" + body.TrimEnd() + "\n"
                : HtmlDocument(node, tagsByNode.GetValueOrDefault(node.Id) ?? [], aliasesByNode.GetValueOrDefault(node.Id) ?? [], body);

            var pageEntry = zip.CreateEntry(item.FilePath, CompressionLevel.Optimal);
            await using var ps = pageEntry.Open();
            await ps.WriteAsync(Encoding.UTF8.GetBytes(content), ct);
        }
    }

    // --- blocks -------------------------------------------------------------------------------------------------------

    /// <summary>Custom inline <c>mention</c>s become links (<c>nook://node/{id}</c>) so converters keep them; other inline types are untouched.</summary>
    private static JsonElement PrepareBlocks(JsonElement blocks, IReadOnlyDictionary<Guid, Node> nodes)
    {
        using var stream = new MemoryStream();
        using (var w = new Utf8JsonWriter(stream))
        {
            WriteBlocks(w, blocks, nodes);
        }
        stream.Position = 0;
        using var doc = JsonDocument.Parse(stream);
        return doc.RootElement.Clone();
    }

    private static void WriteBlocks(Utf8JsonWriter w, JsonElement blocks, IReadOnlyDictionary<Guid, Node> nodes)
    {
        w.WriteStartArray();
        if (blocks.ValueKind == JsonValueKind.Array)
        {
            foreach (var b in blocks.EnumerateArray())
            {
                if (b.ValueKind != JsonValueKind.Object) continue;
                w.WriteStartObject();
                foreach (var p in b.EnumerateObject())
                {
                    if (p.Name == "children") { w.WritePropertyName("children"); WriteBlocks(w, p.Value, nodes); }
                    else if (p.Name == "content" && p.Value.ValueKind == JsonValueKind.Array) { w.WritePropertyName("content"); WriteInline(w, p.Value, nodes); }
                    else p.WriteTo(w);
                }
                w.WriteEndObject();
            }
        }
        w.WriteEndArray();
    }

    private static void WriteInline(Utf8JsonWriter w, JsonElement content, IReadOnlyDictionary<Guid, Node> nodes)
    {
        w.WriteStartArray();
        foreach (var item in content.EnumerateArray())
        {
            var type = item.ValueKind == JsonValueKind.Object && item.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
            if (type is "text" or "link" or null)
            {
                item.WriteTo(w);
                continue;
            }
            var props = item.TryGetProperty("props", out var pr) && pr.ValueKind == JsonValueKind.Object ? pr : default;
            var nodeId = props.ValueKind == JsonValueKind.Object && props.TryGetProperty("nodeId", out var nid) && nid.ValueKind == JsonValueKind.String && Guid.TryParse(nid.GetString(), out var g) ? g : (Guid?)null;
            if (nodeId is null) { item.WriteTo(w); continue; }
            var label = props.TryGetProperty("label", out var l) && l.ValueKind == JsonValueKind.String ? l.GetString() : null;
            label ??= props.TryGetProperty("title", out var tt) && tt.ValueKind == JsonValueKind.String ? tt.GetString() : null;
            label ??= nodes.TryGetValue(nodeId.Value, out var n) ? n.Title : nodeId.Value.ToString();
            if (string.IsNullOrWhiteSpace(label)) label = "Untitled";
            var blockId = props.TryGetProperty("blockId", out var bid) && bid.ValueKind == JsonValueKind.String ? bid.GetString() : null;
            var href = $"nook://node/{nodeId}" + (string.IsNullOrEmpty(blockId) ? "" : $"#b-{blockId}");
            w.WriteStartObject();
            w.WriteString("type", "link");
            w.WriteString("href", href);
            w.WritePropertyName("content");
            w.WriteStartArray();
            w.WriteStartObject();
            w.WriteString("type", "text");
            w.WriteString("text", label);
            w.WritePropertyName("styles");
            w.WriteStartObject();
            w.WriteEndObject();
            w.WriteEndObject();
            w.WriteEndArray();
            w.WriteEndObject();
        }
        w.WriteEndArray();
    }

    /// <summary>Converts runs of default blocks through collab; custom types are rendered per block (definition or plain-text fallback).</summary>
    private async Task<string> RenderMarkdownAsync(JsonElement blocks, IReadOnlyDictionary<string, IBlockTypeDefinition> customTypes, CancellationToken ct)
    {
        var sb = new StringBuilder();
        foreach (var (isDefault, run) in Runs(blocks))
        {
            if (isDefault)
            {
                var md = await collab.ConvertToMarkdownAsync(run, ct);
                sb.Append(md.TrimEnd()).Append("\n\n");
                continue;
            }
            foreach (var block in run.EnumerateArray())
            {
                var type = block.GetProperty("type").GetString() ?? "";
                var rendered = customTypes.TryGetValue(type, out var def) ? def.RenderMarkdown(block) : null;
                sb.Append((rendered ?? FallbackMarkdown(block, type, customTypes)).TrimEnd()).Append("\n\n");
            }
        }
        return sb.ToString();
    }

    private async Task<string> RenderHtmlAsync(JsonElement blocks, IReadOnlyDictionary<string, IBlockTypeDefinition> customTypes, CancellationToken ct)
    {
        var sb = new StringBuilder();
        foreach (var (isDefault, run) in Runs(blocks))
        {
            if (isDefault)
            {
                sb.Append(await collab.ConvertToHtmlAsync(run, "lossy", ct)).Append('\n');
                continue;
            }
            foreach (var block in run.EnumerateArray())
            {
                var type = block.GetProperty("type").GetString() ?? "";
                var rendered = customTypes.TryGetValue(type, out var def) ? def.RenderHtml(block) : null;
                sb.Append(rendered ?? FallbackHtml(block, type, customTypes)).Append('\n');
            }
        }
        return sb.ToString();
    }

    private static IEnumerable<(bool IsDefault, JsonElement Run)> Runs(JsonElement blocks)
    {
        if (blocks.ValueKind != JsonValueKind.Array) yield break;
        var current = new List<JsonElement>();
        bool? currentDefault = null;
        foreach (var b in blocks.EnumerateArray())
        {
            var type = b.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() ?? "" : "paragraph";
            var isDefault = DefaultBlockTypes.Contains(type);
            if (currentDefault is not null && currentDefault != isDefault)
            {
                yield return (currentDefault.Value, JsonSerializer.SerializeToElement(current, Json));
                current = [];
            }
            currentDefault = isDefault;
            current.Add(b);
        }
        if (current.Count > 0) yield return (currentDefault ?? true, JsonSerializer.SerializeToElement(current, Json));
    }

    private static string FallbackMarkdown(JsonElement block, string type, IReadOnlyDictionary<string, IBlockTypeDefinition> customTypes)
    {
        var props = block.TryGetProperty("props", out var p) && p.ValueKind == JsonValueKind.Object ? p : default;
        var nodeId = props.ValueKind == JsonValueKind.Object && props.TryGetProperty("nodeId", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() : null;
        var text = BlockTextExtractor.Extract(block, customTypes);
        if (type is "pageLink" or "pageEmbed" && nodeId is not null)
            return $"[{(text.Length > 0 ? text : nodeId)}](nook://node/{nodeId})";
        return text;
    }

    private static string FallbackHtml(JsonElement block, string type, IReadOnlyDictionary<string, IBlockTypeDefinition> customTypes)
    {
        var props = block.TryGetProperty("props", out var p) && p.ValueKind == JsonValueKind.Object ? p : default;
        var nodeId = props.ValueKind == JsonValueKind.Object && props.TryGetProperty("nodeId", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() : null;
        var text = WebUtility.HtmlEncode(BlockTextExtractor.Extract(block, customTypes));
        if (type is "pageLink" or "pageEmbed" && nodeId is not null)
            return $"<p><a href=\"nook://node/{nodeId}\">{(text.Length > 0 ? text : nodeId)}</a></p>";
        return $"<div data-block-type=\"{WebUtility.HtmlEncode(type)}\">{text}</div>";
    }

    // --- links --------------------------------------------------------------------------------------------------------

    /// <summary>Rewrites internal hrefs (<c>/w/{ws}/p/{id}</c>, <c>nook://node/{id}</c>) to relative paths and <c>/api/files/{id}</c> to bundled files.</summary>
    public static string RewriteLinks(string body, bool markdown, string filePath, IReadOnlyDictionary<Guid, string> pathByNode, IReadOnlyDictionary<Guid, string> fileMap)
    {
        string Map(string href)
        {
            var link = LinkExtractor.FromHref(Guid.Empty, null, href);
            if (link.Kind == LinkKind.Mention && link.TargetNodeId is { } target && pathByNode.TryGetValue(target, out var targetPath))
            {
                var rel = ExportPaths.Relative(filePath, targetPath);
                return link.TargetBlockId is { } b ? rel + "#block-" + b : rel;
            }
            if (href.StartsWith("/api/files/", StringComparison.OrdinalIgnoreCase))
            {
                var idPart = href["/api/files/".Length..].Split('/', '?', '#')[0];
                if (Guid.TryParse(idPart, out var aid) && fileMap.TryGetValue(aid, out var filePath2))
                    return ExportPaths.Relative(filePath, filePath2);
            }
            return href;
        }

        return markdown
            ? MarkdownLink().Replace(body, m => "](" + Map(m.Groups["href"].Value) + ")")
            : HtmlLink().Replace(body, m => $"{m.Groups["attr"].Value}=\"{WebUtility.HtmlEncode(Map(WebUtility.HtmlDecode(m.Groups["href"].Value)))}\"");
    }

    // --- metadata -----------------------------------------------------------------------------------------------------

    public static string Frontmatter(Node node, IReadOnlyList<string> tags, IReadOnlyList<string> aliases)
    {
        var sb = new StringBuilder();
        sb.Append("---\n");
        sb.Append("title: ").Append(YamlString(node.Title)).Append('\n');
        sb.Append("id: ").Append(node.Id).Append('\n');
        sb.Append("created: ").Append(node.CreatedAt.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")).Append('\n');
        sb.Append("updated: ").Append(node.UpdatedAt.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")).Append('\n');
        sb.Append("tags: [").Append(string.Join(", ", tags.Select(YamlString))).Append("]\n");
        sb.Append("aliases: [").Append(string.Join(", ", aliases.Select(YamlString))).Append("]\n");
        if (node.Properties is { ValueKind: JsonValueKind.Object } props && props.GetPropertyCount() > 0)
        {
            sb.Append("properties:\n");
            foreach (var p in props.EnumerateObject())
                sb.Append("  ").Append(YamlString(p.Name)).Append(": ").Append(p.Value.GetRawText().Replace("\n", " ")).Append('\n');
        }
        sb.Append("---\n");
        return sb.ToString();
    }

    public static string HtmlDocument(Node node, IReadOnlyList<string> tags, IReadOnlyList<string> aliases, string body)
    {
        var meta = new
        {
            title = node.Title, id = node.Id, created = node.CreatedAt, updated = node.UpdatedAt, tags, aliases,
            properties = node.Properties is { ValueKind: JsonValueKind.Object } p ? p : (JsonElement?)null,
        };
        var sb = new StringBuilder();
        sb.Append("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n");
        sb.Append("<title>").Append(WebUtility.HtmlEncode(node.Title.Length == 0 ? "Untitled" : node.Title)).Append("</title>\n");
        sb.Append("<meta name=\"nook:id\" content=\"").Append(node.Id).Append("\">\n");
        sb.Append("<script type=\"application/json\" id=\"nook-frontmatter\">").Append(JsonSerializer.Serialize(meta, Json).Replace("</", "<\\/")).Append("</script>\n");
        sb.Append("<style>").Append(MinimalStylesheet).Append("</style>\n</head>\n<body>\n<article>\n");
        sb.Append("<h1 class=\"nook-title\">").Append(WebUtility.HtmlEncode(node.Title.Length == 0 ? "Untitled" : node.Title)).Append("</h1>\n");
        sb.Append(body.TrimEnd()).Append("\n</article>\n</body>\n</html>\n");
        return sb.ToString();
    }

    public const string MinimalStylesheet =
        "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#222}" +
        "h1.nook-title{font-size:2rem;margin-bottom:1rem}img,video{max-width:100%}pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}" +
        "pre{background:#f5f5f5;padding:.75rem;overflow:auto}blockquote{border-left:3px solid #ddd;margin:0;padding-left:1rem;color:#555}" +
        "table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:.25rem .5rem}a{color:#2563eb}";

    private static string YamlString(string s) =>
        "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "") + "\"";

    private async Task<Dictionary<Guid, List<string>>> TagsAsync(Guid[] nodeIds, CancellationToken ct)
    {
        if (nodeIds.Length == 0) return [];
        var rows = await (from nt in db.NodeTags.AsNoTracking()
                          join t in db.Tags.AsNoTracking() on nt.TagId equals t.Id
                          where nodeIds.Contains(nt.NodeId)
                          select new { nt.NodeId, t.Name }).Distinct().ToListAsync(ct);
        return rows.GroupBy(r => r.NodeId).ToDictionary(g => g.Key, g => g.Select(r => r.Name).OrderBy(n => n, StringComparer.OrdinalIgnoreCase).ToList());
    }

    private async Task<Dictionary<Guid, List<string>>> AliasesAsync(Guid[] nodeIds, CancellationToken ct)
    {
        if (nodeIds.Length == 0) return [];
        var rows = await db.Aliases.AsNoTracking().Where(a => nodeIds.Contains(a.NodeId)).Select(a => new { a.NodeId, a.Value }).ToListAsync(ct);
        return rows.GroupBy(r => r.NodeId).ToDictionary(g => g.Key, g => g.Select(r => r.Value).OrderBy(v => v, StringComparer.Ordinal).ToList());
    }

    private static IEnumerable<Guid> Ancestors(Node node, IReadOnlyDictionary<Guid, Node> byId)
    {
        var current = node.ParentId;
        var seen = new HashSet<Guid>();
        while (current is { } id && seen.Add(id))
        {
            yield return id;
            current = byId.TryGetValue(id, out var p) ? p.ParentId : null;
        }
    }
}

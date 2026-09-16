using System.Text.Json;
using System.Text.RegularExpressions;
using Nook.Domain.Entities;
using Nook.Domain.Enums;

namespace Nook.Application.Documents;

/// <summary>
/// Derives <c>links</c> rows from projected blocks (contracts §9.1). Recognises:
/// inline <c>mention</c> (<c>props.nodeId</c>, optional <c>props.blockId</c>); inline <c>link</c> hrefs
/// <c>/w/{ws}/p/{nodeId}[#b-{blockId}]</c>, <c>nook://node/{id}</c>, <c>nook://block/{id}</c> (→ <c>mention</c>);
/// blocks <c>pageLink</c> (mention), <c>pageEmbed</c>/any block with <c>props.nodeId</c> (embed), <c>syncedBlock</c> (synced);
/// unresolved <c>[[Title]]</c> tokens in non-code text (<c>wikilink</c>, href <c>[[Title]]</c>); every other href → <c>url</c>.
/// </summary>
public static partial class LinkExtractor
{
    [GeneratedRegex(@"\[\[(?<title>[^\[\]\n|#]{1,200})(?:#(?<block>[^\[\]\n|]{1,80}))?(?:\|[^\[\]\n]*)?\]\]")]
    private static partial Regex Wikilink();

    [GeneratedRegex(@"^/w/[^/]+/p/(?<node>[0-9a-fA-F-]{36})(?:/)?(?:\?[^#]*)?(?:#(?:b-(?<block>[^/?#\s]+)|page=\d+))?$")]
    private static partial Regex PagePath();

    public static IReadOnlyList<Link> Extract(Guid sourceNodeId, IReadOnlyList<FlatBlock> blocks)
    {
        var links = new List<Link>();
        foreach (var block in blocks)
        {
            ExtractBlockLevel(sourceNodeId, block, links);

            if (block.Content is { ValueKind: JsonValueKind.Array } content)
                ExtractInline(sourceNodeId, block, content, links);
            else if (block.Content is { ValueKind: JsonValueKind.Object } table && table.TryGetProperty("rows", out var rows) && rows.ValueKind == JsonValueKind.Array)
            {
                foreach (var row in rows.EnumerateArray())
                {
                    if (!row.TryGetProperty("cells", out var cells) || cells.ValueKind != JsonValueKind.Array) continue;
                    foreach (var cell in cells.EnumerateArray())
                    {
                        if (cell.ValueKind == JsonValueKind.Array) ExtractInline(sourceNodeId, block, cell, links);
                        else if (cell.ValueKind == JsonValueKind.Object && cell.TryGetProperty("content", out var cc) && cc.ValueKind == JsonValueKind.Array) ExtractInline(sourceNodeId, block, cc, links);
                    }
                }
            }
        }
        return Dedupe(links);
    }

    private static void ExtractBlockLevel(Guid sourceNodeId, FlatBlock block, List<Link> links)
    {
        var hasNode = TryGuid(block.Props, "nodeId", out var nodeId);
        var hasBlock = TryBlockId(block.Props, "blockId", out var blockId);
        switch (block.Type)
        {
            case "pageLink":
                if (hasNode) links.Add(New(sourceNodeId, block.Id, nodeId, hasBlock ? blockId : null, LinkKind.Mention));
                break;
            case "syncedBlock":
                if (hasNode || hasBlock) links.Add(New(sourceNodeId, block.Id, hasNode ? nodeId : null, hasBlock ? blockId : null, LinkKind.Synced));
                break;
            default:
                if (hasNode) links.Add(New(sourceNodeId, block.Id, nodeId, hasBlock ? blockId : null, LinkKind.Embed));
                break;
        }
    }

    private static void ExtractInline(Guid sourceNodeId, FlatBlock block, JsonElement content, List<Link> links)
    {
        foreach (var item in content.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            var type = item.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
            switch (type)
            {
                case "text":
                    if (IsCode(item)) break;
                    if (item.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
                        ExtractWikilinks(sourceNodeId, block, text.GetString()!, links);
                    break;
                case "link":
                {
                    var href = item.TryGetProperty("href", out var h) && h.ValueKind == JsonValueKind.String ? h.GetString() : null;
                    if (!string.IsNullOrWhiteSpace(href)) links.Add(FromHref(sourceNodeId, block.Id, href.Trim()));
                    if (item.TryGetProperty("content", out var linkContent) && linkContent.ValueKind == JsonValueKind.Array)
                        ExtractInline(sourceNodeId, block, linkContent, links);
                    break;
                }
                case null:
                    break;
                default:
                    if (item.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object)
                    {
                        var hasNode = TryGuid(props, "nodeId", out var nodeId);
                        var hasBlock = TryBlockId(props, "blockId", out var blockId);
                        if (hasNode || hasBlock) links.Add(New(sourceNodeId, block.Id, hasNode ? nodeId : null, hasBlock ? blockId : null, LinkKind.Mention));
                    }
                    break;
            }
        }
    }

    private static void ExtractWikilinks(Guid sourceNodeId, FlatBlock block, string text, List<Link> links)
    {
        if (!text.Contains("[[", StringComparison.Ordinal)) return;
        foreach (Match m in Wikilink().Matches(text))
        {
            var title = m.Groups["title"].Value.Trim();
            if (title.Length == 0) continue;
            Guid? blockId = m.Groups["block"].Success ? BlockFlattener.ToGuid(m.Groups["block"].Value.Trim()) : null;
            links.Add(new Link { SourceNodeId = sourceNodeId, SourceBlockId = block.Id, TargetNodeId = null, TargetBlockId = blockId, Kind = LinkKind.Wikilink, Href = $"[[{title}]]" });
        }
    }

    /// <summary>Classifies an inline link href (public for tests and importers).</summary>
    public static Link FromHref(Guid sourceNodeId, Guid? sourceBlockId, string href)
    {
        if (href.StartsWith("nook://node/", StringComparison.OrdinalIgnoreCase))
        {
            var rest = href["nook://node/".Length..];
            var (nodePart, blockPart) = SplitAnchor(rest);
            if (Guid.TryParse(nodePart, out var node))
                return New(sourceNodeId, sourceBlockId, node, blockPart is null ? null : BlockFlattener.ToGuid(blockPart), LinkKind.Mention, href);
        }
        if (href.StartsWith("nook://block/", StringComparison.OrdinalIgnoreCase))
        {
            var rest = href["nook://block/".Length..].Trim('/');
            if (rest.Length > 0) return New(sourceNodeId, sourceBlockId, null, BlockFlattener.ToGuid(rest), LinkKind.Mention, href);
        }
        if (href.StartsWith("[[", StringComparison.Ordinal) && href.EndsWith("]]", StringComparison.Ordinal) && href.Length > 4)
            return new Link { SourceNodeId = sourceNodeId, SourceBlockId = sourceBlockId, Kind = LinkKind.Wikilink, Href = href };

        var path = href;
        if (Uri.TryCreate(href, UriKind.Absolute, out var abs) && abs.Scheme is "http" or "https")
            path = abs.PathAndQuery + abs.Fragment;
        var pm = PagePath().Match(path);
        if (pm.Success && Guid.TryParse(pm.Groups["node"].Value, out var target))
            return New(sourceNodeId, sourceBlockId, target, pm.Groups["block"].Success ? BlockFlattener.ToGuid(pm.Groups["block"].Value) : null, LinkKind.Mention, href);

        return new Link { SourceNodeId = sourceNodeId, SourceBlockId = sourceBlockId, Kind = LinkKind.Url, Href = href };
    }

    private static (string Node, string? Block) SplitAnchor(string rest)
    {
        rest = rest.Trim('/');
        var hash = rest.IndexOf('#');
        if (hash < 0) return (rest, null);
        var block = rest[(hash + 1)..];
        if (block.StartsWith("b-", StringComparison.Ordinal)) block = block[2..];
        return (rest[..hash], block.Length == 0 ? null : block);
    }

    private static Link New(Guid source, Guid? sourceBlock, Guid? target, Guid? targetBlock, LinkKind kind, string? href = null) =>
        new() { SourceNodeId = source, SourceBlockId = sourceBlock, TargetNodeId = target, TargetBlockId = targetBlock, Kind = kind, Href = href };

    private static bool IsCode(JsonElement textItem) =>
        textItem.TryGetProperty("styles", out var styles) && styles.ValueKind == JsonValueKind.Object
        && styles.TryGetProperty("code", out var code) && code.ValueKind == JsonValueKind.True;

    private static bool TryGuid(JsonElement props, string name, out Guid value)
    {
        value = default;
        return props.ValueKind == JsonValueKind.Object
               && props.TryGetProperty(name, out var v)
               && v.ValueKind == JsonValueKind.String
               && Guid.TryParse(v.GetString(), out value);
    }

    private static bool TryBlockId(JsonElement props, string name, out Guid value)
    {
        value = default;
        if (props.ValueKind != JsonValueKind.Object || !props.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.String) return false;
        var raw = v.GetString();
        if (string.IsNullOrWhiteSpace(raw)) return false;
        value = BlockFlattener.ToGuid(raw);
        return true;
    }

    private static List<Link> Dedupe(List<Link> links)
    {
        // Href is part of the key so a block that both mentions and links the same page keeps both rows (§9.1 returns href).
        var seen = new HashSet<(Guid?, Guid?, Guid?, LinkKind, string?)>();
        var result = new List<Link>(links.Count);
        foreach (var l in links)
        {
            if (seen.Add((l.SourceBlockId, l.TargetNodeId, l.TargetBlockId, l.Kind, l.Href?.ToLowerInvariant())))
                result.Add(l);
        }
        return result;
    }
}

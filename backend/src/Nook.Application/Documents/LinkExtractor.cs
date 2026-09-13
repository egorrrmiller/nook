using System.Text.Json;
using Nook.Domain.Entities;
using Nook.Domain.Enums;

namespace Nook.Application.Documents;

/// <summary>
/// Derives <c>links</c> rows from projected blocks. Wave 0 recognises: custom inline items and blocks carrying a
/// <c>nodeId</c> prop (mention / embed), and <c>link</c> inline items whose href contains a node id (wikilink).
/// </summary>
public static class LinkExtractor
{
    public static IReadOnlyList<Link> Extract(Guid sourceNodeId, IReadOnlyList<FlatBlock> blocks)
    {
        var links = new List<Link>();
        foreach (var block in blocks)
        {
            if (TryNodeId(block.Props, out var embedTarget))
                links.Add(new Link { SourceNodeId = sourceNodeId, SourceBlockId = block.Id, TargetNodeId = embedTarget, Kind = LinkKind.Embed });

            if (block.Content is { ValueKind: JsonValueKind.Array } content)
            {
                foreach (var item in content.EnumerateArray())
                {
                    if (item.ValueKind != JsonValueKind.Object) continue;
                    var type = item.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
                    if (type == "link")
                    {
                        var href = item.TryGetProperty("href", out var h) && h.ValueKind == JsonValueKind.String ? h.GetString() : null;
                        if (href is null) continue;
                        var target = FindGuid(href);
                        links.Add(new Link { SourceNodeId = sourceNodeId, SourceBlockId = block.Id, TargetNodeId = target, Kind = target is null ? LinkKind.Wikilink : LinkKind.Mention, Href = href });
                    }
                    else if (type is not null && type != "text" && item.TryGetProperty("props", out var props) && TryNodeId(props, out var mentionTarget))
                    {
                        links.Add(new Link { SourceNodeId = sourceNodeId, SourceBlockId = block.Id, TargetNodeId = mentionTarget, Kind = LinkKind.Mention });
                    }
                }
            }
        }
        return links;
    }

    private static bool TryNodeId(JsonElement props, out Guid nodeId)
    {
        nodeId = default;
        return props.ValueKind == JsonValueKind.Object
               && props.TryGetProperty("nodeId", out var v)
               && v.ValueKind == JsonValueKind.String
               && Guid.TryParse(v.GetString(), out nodeId);
    }

    private static Guid? FindGuid(string href)
    {
        foreach (var segment in href.Split(['/', '?', '#', '='], StringSplitOptions.RemoveEmptyEntries))
        {
            if (Guid.TryParse(segment, out var g)) return g;
        }
        return null;
    }
}

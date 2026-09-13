using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Nook.Plugins.Sdk;

namespace Nook.Application.Documents;

/// <summary>One row of the <c>blocks</c> projection, before persistence.</summary>
public sealed record FlatBlock(
    Guid Id,
    string RawId,
    Guid? ParentBlockId,
    int Position,
    string Type,
    JsonElement Props,
    JsonElement? Content,
    string PlainText);

/// <summary>Flattens a BlockNote document (nested <c>children</c>) depth-first into projection rows.</summary>
public static class BlockFlattener
{
    public static IReadOnlyList<FlatBlock> Flatten(JsonElement blocks, IReadOnlyDictionary<string, IBlockTypeDefinition>? customTypes = null)
    {
        var result = new List<FlatBlock>();
        if (blocks.ValueKind != JsonValueKind.Array) return result;
        var seen = new HashSet<Guid>();
        Walk(blocks, null, result, seen, customTypes);
        return result;
    }

    private static void Walk(JsonElement siblings, Guid? parent, List<FlatBlock> result, HashSet<Guid> seen, IReadOnlyDictionary<string, IBlockTypeDefinition>? customTypes)
    {
        var position = 0;
        foreach (var block in siblings.EnumerateArray())
        {
            if (block.ValueKind != JsonValueKind.Object) continue;
            var rawId = block.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.String ? idEl.GetString()! : "";
            if (rawId.Length == 0) continue;
            var id = ToGuid(rawId);
            if (!seen.Add(id)) continue; // duplicate ids are dropped (should not happen with BlockNote)

            var type = block.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString()! : "paragraph";
            var props = block.TryGetProperty("props", out var p) && p.ValueKind == JsonValueKind.Object ? p.Clone() : EmptyObject();
            JsonElement? content = block.TryGetProperty("content", out var c) && c.ValueKind is not (JsonValueKind.Undefined or JsonValueKind.Null) ? c.Clone() : null;
            var text = BlockTextExtractor.Extract(block, customTypes);

            result.Add(new FlatBlock(id, rawId, parent, position++, type, props, content, text));

            if (block.TryGetProperty("children", out var children) && children.ValueKind == JsonValueKind.Array)
                Walk(children, id, result, seen, customTypes);
        }
    }

    /// <summary>BlockNote ids are UUID v4; anything else is mapped deterministically (SHA-256 → 16 bytes).</summary>
    public static Guid ToGuid(string rawId)
    {
        if (Guid.TryParse(rawId, out var g)) return g;
        Span<byte> hash = stackalloc byte[32];
        SHA256.HashData(Encoding.UTF8.GetBytes(rawId), hash);
        return new Guid(hash[..16]);
    }

    private static JsonElement EmptyObject() => JsonSerializer.Deserialize<JsonElement>("{}");
}

using System.Text.Json;
using Nook.Domain.Entities;

namespace Nook.Application.Knowledge;

/// <summary>Rebuilds the nested §4 block JSON (<c>{id,type,props,content,children}</c>) from flat projection rows.</summary>
public static class BlockTreeBuilder
{
    public static JsonElement Build(IEnumerable<Block> rows, Guid? rootParent = null)
    {
        var list = rows.ToList();
        var byParent = list.GroupBy(b => b.ParentBlockId).ToDictionary(g => g.Key ?? Guid.Empty, g => g.OrderBy(b => b.Position).ToList());
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            WriteChildren(writer, byParent, rootParent ?? Guid.Empty, new HashSet<Guid>());
        }
        stream.Position = 0;
        using var doc = JsonDocument.Parse(stream);
        return doc.RootElement.Clone();
    }

    /// <summary>One block (with its subtree) as §4 JSON.</summary>
    public static JsonElement BuildSingle(Block block, IEnumerable<Block> descendants)
    {
        var all = descendants.ToList();
        var byParent = all.GroupBy(b => b.ParentBlockId).ToDictionary(g => g.Key ?? Guid.Empty, g => g.OrderBy(b => b.Position).ToList());
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            WriteBlock(writer, block, byParent, new HashSet<Guid>());
        }
        stream.Position = 0;
        using var doc = JsonDocument.Parse(stream);
        return doc.RootElement.Clone();
    }

    /// <summary>Counts blocks at every level of a §4 block array.</summary>
    public static int Count(JsonElement blocks)
    {
        if (blocks.ValueKind != JsonValueKind.Array) return 0;
        var n = 0;
        foreach (var b in blocks.EnumerateArray())
        {
            n++;
            if (b.ValueKind == JsonValueKind.Object && b.TryGetProperty("children", out var c)) n += Count(c);
        }
        return n;
    }

    private static void WriteChildren(Utf8JsonWriter w, Dictionary<Guid, List<Block>> byParent, Guid parent, HashSet<Guid> seen)
    {
        w.WriteStartArray();
        if (byParent.TryGetValue(parent, out var children))
        {
            foreach (var child in children)
            {
                if (!seen.Add(child.Id)) continue;
                WriteBlock(w, child, byParent, seen);
            }
        }
        w.WriteEndArray();
    }

    private static void WriteBlock(Utf8JsonWriter w, Block b, Dictionary<Guid, List<Block>> byParent, HashSet<Guid> seen)
    {
        w.WriteStartObject();
        w.WriteString("id", b.Id.ToString());
        w.WriteString("type", b.Type);
        w.WritePropertyName("props");
        if (b.Props.ValueKind == JsonValueKind.Object) b.Props.WriteTo(w); else { w.WriteStartObject(); w.WriteEndObject(); }
        if (b.Content is { ValueKind: not (JsonValueKind.Undefined or JsonValueKind.Null) } content)
        {
            w.WritePropertyName("content");
            content.WriteTo(w);
        }
        w.WritePropertyName("children");
        WriteChildren(w, byParent, b.Id, seen);
        w.WriteEndObject();
    }
}

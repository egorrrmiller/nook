using System.Text.Json;

namespace Nook.Application.Import;

/// <summary>Small builders and rewriters for §4 block JSON, shared by the built-in importers.</summary>
public static class BlockJson
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static JsonElement Empty => Parse("[]");

    public static JsonElement Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    public static JsonElement Paragraph(string text) => JsonSerializer.SerializeToElement(new object[]
    {
        new
        {
            id = Guid.NewGuid().ToString(),
            type = "paragraph",
            props = new { },
            content = text.Length == 0 ? [] : new object[] { new { type = "text", text, styles = new { } } },
            children = Array.Empty<object>(),
        },
    }, Json);

    /// <summary>A single <c>table</c> block; the first row is treated as the header row by BlockNote's renderer.</summary>
    public static JsonElement Table(IReadOnlyList<IReadOnlyList<string>> rows)
    {
        var columns = rows.Count == 0 ? 1 : rows.Max(r => r.Count);
        var tableRows = rows.Select(cells => new
        {
            cells = Enumerable.Range(0, columns).Select(i =>
            {
                var text = i < cells.Count ? cells[i] : "";
                return text.Length == 0 ? Array.Empty<object>() : [new { type = "text", text, styles = new { } }];
            }).ToArray(),
        }).ToArray();

        return JsonSerializer.SerializeToElement(new object[]
        {
            new
            {
                id = Guid.NewGuid().ToString(),
                type = "table",
                props = new { },
                content = new { type = "tableContent", columnWidths = Enumerable.Repeat((int?)null, columns).ToArray(), rows = tableRows },
                children = Array.Empty<object>(),
            },
        }, Json);
    }

    /// <summary>Rewrites every inline <c>link.href</c> and image <c>props.url</c> through <paramref name="map"/> (returning <c>null</c> keeps the original).</summary>
    public static JsonElement RewriteUrls(JsonElement blocks, Func<string, string?> map)
    {
        using var stream = new MemoryStream();
        using (var w = new Utf8JsonWriter(stream))
        {
            WriteArray(w, blocks, map);
        }
        stream.Position = 0;
        using var doc = JsonDocument.Parse(stream);
        return doc.RootElement.Clone();
    }

    private static void WriteArray(Utf8JsonWriter w, JsonElement blocks, Func<string, string?> map)
    {
        w.WriteStartArray();
        if (blocks.ValueKind == JsonValueKind.Array)
        {
            foreach (var b in blocks.EnumerateArray()) WriteValue(w, b, map, inProps: false);
        }
        w.WriteEndArray();
    }

    private static void WriteValue(Utf8JsonWriter w, JsonElement value, Func<string, string?> map, bool inProps)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.Object:
                w.WriteStartObject();
                foreach (var p in value.EnumerateObject())
                {
                    if ((p.Name is "href" || (inProps && p.Name is "url")) && p.Value.ValueKind == JsonValueKind.String)
                    {
                        var original = p.Value.GetString()!;
                        w.WriteString(p.Name, map(original) ?? original);
                        continue;
                    }
                    w.WritePropertyName(p.Name);
                    WriteValue(w, p.Value, map, inProps || p.Name == "props");
                }
                w.WriteEndObject();
                break;
            case JsonValueKind.Array:
                w.WriteStartArray();
                foreach (var item in value.EnumerateArray()) WriteValue(w, item, map, inProps);
                w.WriteEndArray();
                break;
            default:
                value.WriteTo(w);
                break;
        }
    }

    /// <summary>First heading/paragraph text of a document, used as the page title when a file has none.</summary>
    public static string? FirstHeading(JsonElement blocks)
    {
        if (blocks.ValueKind != JsonValueKind.Array) return null;
        foreach (var b in blocks.EnumerateArray())
        {
            if (b.ValueKind != JsonValueKind.Object) continue;
            var type = b.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
            if (type != "heading") continue;
            var text = Documents.BlockTextExtractor.Extract(b);
            if (!string.IsNullOrWhiteSpace(text)) return text;
        }
        return null;
    }

    /// <summary>Returns the document without its leading heading block (used when that heading became the page title).</summary>
    public static JsonElement DropFirstHeading(JsonElement blocks)
    {
        if (blocks.ValueKind != JsonValueKind.Array) return blocks;
        var list = blocks.EnumerateArray().ToList();
        var index = list.FindIndex(b => b.ValueKind == JsonValueKind.Object
            && b.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String && t.GetString() == "heading");
        if (index < 0) return blocks;
        if (list.Take(index).Any(b => !string.IsNullOrWhiteSpace(Documents.BlockTextExtractor.Extract(b)))) return blocks;
        list.RemoveRange(0, index + 1);
        return JsonSerializer.SerializeToElement(list, Json);
    }
}

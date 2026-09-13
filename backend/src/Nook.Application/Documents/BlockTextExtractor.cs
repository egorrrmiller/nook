using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Nook.Plugins.Sdk;

namespace Nook.Application.Documents;

/// <summary>
/// Extracts searchable plain text from a BlockNote block (its own text only — children are separate projection rows).
/// Unknown block types are handled generically: inline items in <c>content</c> (array or table content),
/// plus <c>props.caption</c>, <c>props.name</c> and <c>props.url</c>. Plugins can override per type via <see cref="IBlockTypeDefinition"/>.
/// </summary>
public static partial class BlockTextExtractor
{
    private static readonly string[] TextProps = ["caption", "name", "url"];
    private static readonly string[] InlineTextProps = ["text", "label", "name", "title"];

    public static string Extract(JsonElement block, IReadOnlyDictionary<string, IBlockTypeDefinition>? customTypes = null)
    {
        if (block.ValueKind != JsonValueKind.Object) return "";

        if (customTypes is { Count: > 0 }
            && block.TryGetProperty("type", out var typeEl) && typeEl.ValueKind == JsonValueKind.String
            && customTypes.TryGetValue(typeEl.GetString()!, out var def))
        {
            return Normalize(def.ExtractText(block));
        }

        var sb = new StringBuilder();
        if (block.TryGetProperty("content", out var content)) AppendContent(sb, content);
        if (block.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object)
        {
            foreach (var name in TextProps)
            {
                if (props.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String) Append(sb, v.GetString());
            }
        }
        return Normalize(sb.ToString());
    }

    public static void AppendContent(StringBuilder sb, JsonElement content)
    {
        switch (content.ValueKind)
        {
            case JsonValueKind.Array:
                foreach (var item in content.EnumerateArray()) AppendInline(sb, item);
                break;
            case JsonValueKind.Object:
                // TableContent: {type:"tableContent", rows:[{cells:[InlineContent[] | {type:"tableCell", content:[...]}]}]}
                if (content.TryGetProperty("rows", out var rows) && rows.ValueKind == JsonValueKind.Array)
                {
                    foreach (var row in rows.EnumerateArray())
                    {
                        if (!row.TryGetProperty("cells", out var cells) || cells.ValueKind != JsonValueKind.Array) continue;
                        foreach (var cell in cells.EnumerateArray())
                        {
                            if (cell.ValueKind == JsonValueKind.Array) AppendContent(sb, cell);
                            else if (cell.ValueKind == JsonValueKind.Object && cell.TryGetProperty("content", out var cc)) AppendContent(sb, cc);
                        }
                    }
                }
                else if (content.TryGetProperty("content", out var nested))
                {
                    AppendContent(sb, nested);
                }
                break;
            case JsonValueKind.String:
                Append(sb, content.GetString());
                break;
        }
    }

    private static void AppendInline(StringBuilder sb, JsonElement item)
    {
        if (item.ValueKind == JsonValueKind.String) { Append(sb, item.GetString()); return; }
        if (item.ValueKind != JsonValueKind.Object) return;

        var type = item.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
        switch (type)
        {
            case "text":
                if (item.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String) Append(sb, text.GetString());
                break;
            case "link":
                if (item.TryGetProperty("content", out var linkContent)) AppendContent(sb, linkContent);
                break;
            default:
                // Custom inline content (e.g. mention): take the first human-readable prop we can find.
                if (item.TryGetProperty("text", out var ownText) && ownText.ValueKind == JsonValueKind.String)
                {
                    Append(sb, ownText.GetString());
                }
                else if (item.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object)
                {
                    foreach (var name in InlineTextProps)
                    {
                        if (props.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String) { Append(sb, v.GetString()); break; }
                    }
                }
                if (item.TryGetProperty("content", out var inner)) AppendContent(sb, inner);
                break;
        }
    }

    private static void Append(StringBuilder sb, string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return;
        if (sb.Length > 0 && !char.IsWhiteSpace(sb[^1])) sb.Append(' ');
        sb.Append(text);
    }

    public static string Normalize(string? text) => string.IsNullOrWhiteSpace(text) ? "" : Whitespace().Replace(text, " ").Trim();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}

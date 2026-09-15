using System.Text;
using System.Text.Json;
using Nook.Application.Common;

namespace Nook.Plugin.Ai;

public sealed record AiBlockSnapshot(string Id, string Type, string Text, JsonElement Json);

/// <summary>
/// Validates and orders the selection without converting it to a known BlockNote union. Unknown JSON is retained as-is.
/// </summary>
public static class AiBlockSelection
{
    public static IReadOnlyList<AiBlockSnapshot> Select(IReadOnlyList<JsonElement>? blocks)
    {
        if (blocks is null || blocks.Count == 0) throw new ValidationException("At least one block must be selected.");
        if (blocks.Count > AiPluginConstants.MaxBlocks)
            throw new AiRequestTooLargeException($"At most {AiPluginConstants.MaxBlocks} blocks can be processed at once.");

        var seen = new HashSet<string>(StringComparer.Ordinal);
        var result = new List<AiBlockSnapshot>(blocks.Count);
        var total = 0;
        foreach (var block in blocks)
        {
            if (block.ValueKind != JsonValueKind.Object) throw new ValidationException("Every selected block must be a JSON object.");
            var id = RequiredString(block, "id");
            var type = RequiredString(block, "type");
            if (!seen.Add(id)) throw new ValidationException($"Selected block '{id}' is present more than once.");

            var text = BlockText(block);
            total += text.Length;
            if (total > AiPluginConstants.MaxInputCharacters)
                throw new AiRequestTooLargeException($"Selected block text is too large (max {AiPluginConstants.MaxInputCharacters} characters).");
            result.Add(new AiBlockSnapshot(id, type, text, block.Clone()));
        }

        return result;
    }

    public static string BlockText(JsonElement block)
    {
        var sb = new StringBuilder();
        if (block.TryGetProperty("content", out var content)) AppendText(sb, content);
        if (block.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object)
        {
            if (props.TryGetProperty("text", out var text)) AppendText(sb, text);
            else if (props.TryGetProperty("caption", out var caption)) AppendText(sb, caption);
        }
        return sb.ToString().Trim();
    }

    private static string RequiredString(JsonElement objectValue, string name)
    {
        if (!objectValue.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String)
            throw new ValidationException($"Selected block requires a string '{name}'.");
        var result = value.GetString()?.Trim() ?? "";
        if (result.Length == 0) throw new ValidationException($"Selected block requires a non-empty '{name}'.");
        return result;
    }

    private static void AppendText(StringBuilder sb, JsonElement value)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.String:
                if (sb.Length > 0) sb.Append('\n');
                sb.Append(value.GetString());
                break;
            case JsonValueKind.Array:
                foreach (var item in value.EnumerateArray()) AppendText(sb, item);
                break;
            case JsonValueKind.Object:
                if (value.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "text" && value.TryGetProperty("text", out var text))
                {
                    AppendText(sb, text);
                    break;
                }
                if (value.TryGetProperty("content", out var content)) AppendText(sb, content);
                else if (value.TryGetProperty("text", out var ownText)) AppendText(sb, ownText);
                else if (value.TryGetProperty("rows", out var rows)) AppendText(sb, rows);
                else if (value.TryGetProperty("cells", out var cells)) AppendText(sb, cells);
                break;
        }
    }
}

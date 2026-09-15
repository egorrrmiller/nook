using System.Text.Json;
using System.Text.Json.Nodes;

namespace Nook.Plugin.Ai;

/// <summary>Changes only text leaves in a cloned block JSON tree. All unknown fields and child blocks survive.</summary>
public static class AiBlockTransformer
{
    public static (JsonElement Block, bool Changed) WithText(JsonElement original, string text)
    {
        var root = JsonNode.Parse(original.GetRawText());
        if (root is not JsonObject objectRoot) return (original.Clone(), false);

        var changed = false;
        if (objectRoot["content"] is JsonNode content)
            changed = ReplaceFirstText(content, text, ref changed);

        if (!changed && objectRoot["props"] is JsonObject props && props["text"] is JsonValue)
        {
            props["text"] = text;
            changed = true;
        }

        if (!changed && objectRoot["props"] is JsonObject captionProps && captionProps["caption"] is JsonValue)
        {
            captionProps["caption"] = text;
            changed = true;
        }

        return (JsonSerializer.SerializeToElement(root), changed);
    }

    private static bool ReplaceFirstText(JsonNode node, string replacement, ref bool alreadyReplaced)
    {
        if (node is JsonObject obj)
        {
            if (obj["type"]?.GetValue<string>() == "text" && obj["text"] is JsonValue)
            {
                obj["text"] = alreadyReplaced ? "" : replacement;
                alreadyReplaced = true;
                return true;
            }

            foreach (var entry in obj)
                if (entry.Value is not null) ReplaceFirstText(entry.Value, replacement, ref alreadyReplaced);
            return alreadyReplaced;
        }

        if (node is JsonArray array)
        {
            foreach (var child in array)
                if (child is not null) ReplaceFirstText(child, replacement, ref alreadyReplaced);
        }
        return alreadyReplaced;
    }
}

using System.Text.Json;
using System.Text.Json.Serialization;

namespace Nook.Plugin.Ai;

public static class AiPluginConstants
{
    public const string PluginId = "ai";
    public const int MaxBlocks = 50;
    public const int MaxInputCharacters = 40_000;
    public const int MaxOutputCharactersPerBlock = 40_000;
    public const int MaxCustomPromptCharacters = 4_000;
    public const int MaxPropertyDefinitions = 50;
}

/// <summary>The writing operations exposed by the plugin. The enum is deliberately independent of any provider SDK.</summary>
[JsonConverter(typeof(AiActionJsonConverter))]
public enum AiAction
{
    Continue,
    Rewrite,
    Shorten,
    Translate,
    CustomPrompt,
    AutofillProperties,
}

/// <summary>Full BlockNote JSON supplied by the editor. It is intentionally not a typed block union.</summary>
public sealed record AiPreviewRequest(
    Guid WorkspaceId,
    Guid NodeId,
    AiAction Action,
    JsonElement[] Blocks,
    string? TargetLanguage = null,
    string? Prompt = null,
    AiPropertyDefinition[]? Properties = null);

public sealed record AiPropertyDefinition(string Name, string Type);

public sealed record AiSettingsRequest(
    string? Provider = null,
    string? Model = null,
    string? Endpoint = null,
    string? ApiKey = null,
    bool ClearApiKey = false);

public sealed record AiSettingsResponse(
    string? Provider,
    string? Model,
    string? Endpoint,
    bool ApiKeyConfigured);

public sealed record AiBlockChange(
    string BlockId,
    JsonElement OriginalBlock,
    JsonElement ProposedBlock,
    bool Changed,
    bool PreservesUnknownFields);

public sealed record AiPropertySuggestion(
    string Name,
    string Type,
    JsonElement Value,
    bool IsFormula,
    string? Warning = null);

public sealed record AiPreviewResponse(
    AiAction Action,
    string Provider,
    string? Model,
    IReadOnlyList<AiBlockChange> Changes,
    IReadOnlyList<AiPropertySuggestion> PropertySuggestions,
    IReadOnlyList<string> Warnings);

/// <summary>Provider-neutral input. Providers never receive a database entity or an editor instance.</summary>
public sealed record AiProviderRequest(
    AiAction Action,
    string Prompt,
    IReadOnlyList<AiPromptBlock> Blocks,
    string? TargetLanguage,
    IReadOnlyList<AiPropertyDefinition> Properties,
    AiProviderSettings Settings,
    string? ApiKey);

public sealed record AiPromptBlock(string Id, string Type, string Text);

public sealed record AiProviderResponse(
    IReadOnlyList<AiGeneratedBlock> Blocks,
    IReadOnlyList<AiPropertySuggestion>? PropertySuggestions = null);

public sealed record AiGeneratedBlock(string BlockId, string? Text);

/// <summary>Accepts kebab-case, snake_case and camelCase so plugin clients do not depend on host serializer settings.</summary>
public sealed class AiActionJsonConverter : JsonConverter<AiAction>
{
    public override AiAction Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetString()?.Replace("_", "-", StringComparison.Ordinal).ToLowerInvariant();
        return value switch
        {
            "continue" => AiAction.Continue,
            "rewrite" => AiAction.Rewrite,
            "shorten" => AiAction.Shorten,
            "translate" => AiAction.Translate,
            "custom-prompt" => AiAction.CustomPrompt,
            "autofill-properties" => AiAction.AutofillProperties,
            _ => throw new JsonException($"Unknown AI action '{value}'."),
        };
    }

    public override void Write(Utf8JsonWriter writer, AiAction value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value switch
        {
            AiAction.Continue => "continue",
            AiAction.Rewrite => "rewrite",
            AiAction.Shorten => "shorten",
            AiAction.Translate => "translate",
            AiAction.CustomPrompt => "custom-prompt",
            AiAction.AutofillProperties => "autofill-properties",
            _ => throw new JsonException($"Unknown AI action '{value}'."),
        });
}

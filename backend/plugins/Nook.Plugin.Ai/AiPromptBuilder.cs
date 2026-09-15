using System.Text;
using System.Text.Json;

namespace Nook.Plugin.Ai;

public static class AiPromptBuilder
{
    public static string Build(
        AiAction action,
        IReadOnlyList<AiBlockSnapshot> blocks,
        string? targetLanguage = null,
        string? customPrompt = null,
        IReadOnlyList<AiPropertyDefinition>? properties = null)
    {
        if (action == AiAction.CustomPrompt && string.IsNullOrWhiteSpace(customPrompt))
            throw new Nook.Application.Common.ValidationException("A custom prompt is required for the custom prompt action.");
        if (customPrompt?.Length > AiPluginConstants.MaxCustomPromptCharacters)
            throw new AiRequestTooLargeException($"Custom prompt is too large (max {AiPluginConstants.MaxCustomPromptCharacters} characters).");

        var sb = new StringBuilder();
        sb.AppendLine("You are the writing engine for a self-hosted Notion-compatible editor.");
        sb.AppendLine("Return one generated text value per selected block. Do not return block JSON.");
        sb.AppendLine("Keep the user's intent, do not invent facts, and do not modify metadata or structure.");
        sb.Append("Operation: ").AppendLine(ActionInstruction(action, targetLanguage));
        if (action == AiAction.CustomPrompt) sb.Append("User instruction: ").AppendLine(customPrompt!.Trim());
        if (action == AiAction.AutofillProperties)
        {
            sb.Append("Property definitions: ").AppendLine(JsonSerializer.Serialize(properties ?? []));
            sb.AppendLine("Return suggestions only for the declared properties. Formulas are not supported.");
        }

        sb.AppendLine("Selected blocks in document order:");
        foreach (var block in blocks)
        {
            sb.Append("--- ").Append(block.Id).Append(" [").Append(block.Type).AppendLine("] ---");
            sb.AppendLine(string.IsNullOrWhiteSpace(block.Text) ? "(empty block)" : block.Text);
            sb.AppendLine("--- end block ---");
        }
        return sb.ToString();
    }

    private static string ActionInstruction(AiAction action, string? targetLanguage) => action switch
    {
        AiAction.Continue => "continue the last selected block naturally",
        AiAction.Rewrite => "rewrite the selected text while preserving its meaning",
        AiAction.Shorten => "shorten the selected text without losing essential meaning",
        AiAction.Translate => $"translate the selected text to {targetLanguage?.Trim() ?? "the requested target language"}",
        AiAction.CustomPrompt => "follow the user instruction",
        AiAction.AutofillProperties => "infer values for the requested page properties from the selected text",
        _ => throw new ArgumentOutOfRangeException(nameof(action), action, "Unknown AI action."),
    };
}

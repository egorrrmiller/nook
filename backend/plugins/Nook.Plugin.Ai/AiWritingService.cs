using Nook.Application.Common;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Enums;

namespace Nook.Plugin.Ai;

public sealed class AiWritingService(
    AiProviderSelector providerSelector,
    AiRateLimiter rateLimiter,
    WorkspaceContextResolver workspaceResolver,
    IWorkspaceContextAccessor contextAccessor,
    NodeService nodes,
    ICurrentUser currentUser)
{
    public async Task<AiPreviewResponse> PreviewAsync(AiPreviewRequest request, CancellationToken cancellationToken)
    {
        if (request.WorkspaceId == Guid.Empty || request.NodeId == Guid.Empty)
            throw new ValidationException("workspaceId and nodeId are required.");
        if (request.Action == AiAction.Translate && string.IsNullOrWhiteSpace(request.TargetLanguage))
            throw new ValidationException("targetLanguage is required for translation.");
        if (request.Action == AiAction.AutofillProperties && (request.Properties is null || request.Properties.Length == 0))
            throw new ValidationException("properties are required for autofill-properties.");
        if (request.Properties?.Length > AiPluginConstants.MaxPropertyDefinitions)
            throw new AiRequestTooLargeException($"At most {AiPluginConstants.MaxPropertyDefinitions} properties can be autofilled at once.");

        var context = await workspaceResolver.ResolveAsync(currentUser.UserId, request.WorkspaceId, cancellationToken);
        contextAccessor.Current = context;
        await nodes.RequireAsync(request.NodeId, WorkspaceRole.Editor, cancellationToken);

        var selected = AiBlockSelection.Select(request.Blocks);
        var (settings, provider, apiKey) = await providerSelector.SelectAsync(cancellationToken);
        rateLimiter.EnsureAllowed(currentUser.UserId);
        var properties = request.Properties ?? [];
        var prompt = AiPromptBuilder.Build(request.Action, selected, request.TargetLanguage, request.Prompt, properties);

        AiProviderResponse generated;
        try
        {
            generated = await provider.GenerateAsync(
                new AiProviderRequest(request.Action, prompt, selected.Select(b => new AiPromptBlock(b.Id, b.Type, b.Text)).ToArray(), request.TargetLanguage, properties, settings, apiKey),
                cancellationToken);
        }
        catch (AiProviderFailedException)
        {
            throw;
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            throw new AiProviderFailedException($"AI provider '{provider.Id}' failed to generate a response.", e);
        }

        var generatedById = generated.Blocks.ToDictionary(x => x.BlockId, StringComparer.Ordinal);
        var warnings = new List<string>();
        var changes = new List<AiBlockChange>(selected.Count);
        foreach (var block in selected)
        {
            if (!generatedById.TryGetValue(block.Id, out var result) || result.Text is null)
            {
                warnings.Add($"Provider returned no text for block '{block.Id}'; the block was left unchanged.");
                changes.Add(new AiBlockChange(block.Id, block.Json, block.Json, false, true));
                continue;
            }
            if (result.Text.Length > AiPluginConstants.MaxOutputCharactersPerBlock)
                throw new AiRequestTooLargeException($"Generated text for block '{block.Id}' is too large.");

            var (proposed, changed) = AiBlockTransformer.WithText(block.Json, result.Text);
            if (!changed) warnings.Add($"Block '{block.Id}' has no editable text field; it was left unchanged.");
            changes.Add(new AiBlockChange(block.Id, block.Json, proposed, changed, true));
        }

        foreach (var suggestion in generated.PropertySuggestions ?? [])
            if (suggestion.IsFormula) warnings.Add($"Property '{suggestion.Name}' was ignored because formulas are not supported.");

        return new AiPreviewResponse(request.Action, provider.Id, settings.Model, changes,
            (generated.PropertySuggestions ?? []).Where(x => !x.IsFormula).ToArray(), warnings);
    }
}

using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Nook.Application.Collab;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Nodes;
using Nook.Application.Properties;
using Nook.Domain.Enums;
using Nook.Plugins.Sdk;

namespace Nook.Application.Plugins;

public sealed class UpdatePropertiesAutomationAction : IAutomationAction
{
    public string Id => "core.update_properties";
    public string DisplayName => "Update page properties";
    public string ParametersSchema => """{"type":"object","required":["properties"],"properties":{"nodeId":{"type":"string"},"properties":{"type":"object"}}}""";

    public async Task ExecuteAsync(AutomationContext context, JsonElement parameters, CancellationToken cancellationToken)
    {
        var nodeId = ActionParameters.NodeId(parameters, context);
        var properties = ActionParameters.RequiredObject(parameters, "properties");
        await context.Services.GetRequiredService<PropertyService>().MergeAsync(nodeId, properties, cancellationToken);
    }
}

public sealed class AddPageAutomationAction : IAutomationAction
{
    public string Id => "core.add_page";
    public string DisplayName => "Add page";
    public string ParametersSchema => """{"type":"object","required":["title"],"properties":{"title":{"type":"string"},"parentId":{"type":"string"}}}""";

    public async Task ExecuteAsync(AutomationContext context, JsonElement parameters, CancellationToken cancellationToken)
    {
        var title = ActionParameters.RequiredString(parameters, "title");
        var parentId = ActionParameters.OptionalGuid(parameters, "parentId");
        await context.Services.GetRequiredService<NodeService>().CreateAsync(
            new CreateNodeRequest(parentId, NodeKind.Page.ToWire(), title, null), cancellationToken);
    }
}

public sealed class InsertBlocksAutomationAction : IAutomationAction
{
    public string Id => "core.insert_blocks";
    public string DisplayName => "Insert blocks";
    public string ParametersSchema => """{"type":"object","required":["blocks"],"properties":{"nodeId":{"type":"string"},"blocks":{"type":"array"}}}""";

    public async Task ExecuteAsync(AutomationContext context, JsonElement parameters, CancellationToken cancellationToken)
    {
        var nodeId = ActionParameters.NodeId(parameters, context);
        var blocks = ActionParameters.RequiredArray(parameters, "blocks");
        if (blocks.GetArrayLength() is < 1 or > 100) throw new ValidationException("blocks must contain 1–100 items.");
        foreach (var block in blocks.EnumerateArray())
        {
            if (block.ValueKind != JsonValueKind.Object || !block.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String)
                throw new ValidationException("Every inserted block must be an object with a type.");
        }

        var operation = JsonSerializer.SerializeToElement(new
        {
            op = "insert",
            blocks = blocks.EnumerateArray().Select(b => b.Clone()).ToArray(),
            placement = "end",
        });
        var operations = JsonSerializer.SerializeToElement(new[] { operation });
        await context.Services.GetRequiredService<ICollabClient>().ApplyOpsAsync(nodeId, operations, context.UserId, cancellationToken);
    }
}

internal static class ActionParameters
{
    public static Guid NodeId(JsonElement parameters, AutomationContext context) =>
        OptionalGuid(parameters, "nodeId") ?? context.NodeId ?? throw new ValidationException("nodeId is required for this action.");

    public static Guid? OptionalGuid(JsonElement parameters, string name)
    {
        if (parameters.ValueKind != JsonValueKind.Object || !parameters.TryGetProperty(name, out var value)) return null;
        if (value.ValueKind != JsonValueKind.String || !Guid.TryParse(value.GetString(), out var id))
            throw new ValidationException($"{name} must be a UUID.");
        return id;
    }

    public static string RequiredString(JsonElement parameters, string name)
    {
        if (parameters.ValueKind != JsonValueKind.Object || !parameters.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String)
            throw new ValidationException($"{name} must be a string.");
        var result = value.GetString()?.Trim() ?? "";
        if (result.Length == 0 || result.Length > 10_000) throw new ValidationException($"{name} must contain 1–10000 characters.");
        return result;
    }

    public static JsonElement RequiredObject(JsonElement parameters, string name) =>
        Required(parameters, name, JsonValueKind.Object);

    public static JsonElement RequiredArray(JsonElement parameters, string name) =>
        Required(parameters, name, JsonValueKind.Array);

    private static JsonElement Required(JsonElement parameters, string name, JsonValueKind expected)
    {
        if (parameters.ValueKind != JsonValueKind.Object || !parameters.TryGetProperty(name, out var value) || value.ValueKind != expected)
            throw new ValidationException($"{name} must be a JSON {expected.ToString().ToLowerInvariant()}.");
        return value.Clone();
    }
}

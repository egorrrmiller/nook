using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Plugins.Sdk;
using Nook.Plugins.Sdk.Hosting;

namespace Nook.Application.Plugins;

public sealed record PluginDescriptorDto(string Id, string Name, PluginSettingsSchemaDto? Settings);

public sealed record PluginSettingsSchemaDto(JsonElement Schema);

/// <summary>Workspace-scoped settings for optional SDK extensions in custom host distributions.</summary>
public sealed class PluginSettingsService(
    IAppDbContext db,
    PluginRegistry plugins,
    IWorkspaceContextAccessor contextAccessor)
{
    private const string KeyPrefix = "plugin:";

    public IReadOnlyList<PluginDescriptorDto> ListPlugins() => plugins.Plugins
        .Select(p => new PluginDescriptorDto(
            p.Id,
            p.Name,
            p.SettingsSchema is null ? null : new PluginSettingsSchemaDto(ParseSchema(p.SettingsSchema.JsonSchema))))
        .ToArray();

    public JsonElement GetSchema(string pluginId) => ParseSchema(RequirePlugin(pluginId).SettingsSchema?.JsonSchema ?? "{}");

    public async Task<JsonElement> GetAsync(string pluginId, CancellationToken ct)
    {
        var plugin = RequirePlugin(pluginId);
        var ctx = contextAccessor.Required;
        var row = await db.Settings.AsNoTracking().FirstOrDefaultAsync(
            s => s.Scope == SettingScopes.Workspace && s.ScopeId == ctx.WorkspaceId && s.Key == Key(plugin.Id), ct);
        var value = row?.Value ?? JsonSerializer.SerializeToElement(new { });
        PluginSettingsValidator.Validate(value, plugin.SettingsSchema?.JsonSchema);
        return value;
    }

    public async Task PutAsync(string pluginId, JsonElement value, CancellationToken ct)
    {
        var plugin = RequirePlugin(pluginId);
        var ctx = contextAccessor.Required;
        if (!ctx.IsWorkspaceOwner) throw new ForbiddenException("Only the workspace owner can change plugin settings.");
        PluginSettingsValidator.Validate(value, plugin.SettingsSchema?.JsonSchema);

        var key = Key(plugin.Id);
        var row = await db.Settings.FirstOrDefaultAsync(
            s => s.Scope == SettingScopes.Workspace && s.ScopeId == ctx.WorkspaceId && s.Key == key, ct);
        if (row is null)
            db.Settings.Add(new Setting { Scope = SettingScopes.Workspace, ScopeId = ctx.WorkspaceId, Key = key, Value = value.Clone() });
        else
            row.Value = value.Clone();
        await db.SaveChangesAsync(ct);
    }

    private IPlugin RequirePlugin(string pluginId) =>
        plugins.Find(pluginId.Trim()) ?? throw new NotFoundException("Plugin not found.");

    private static string Key(string pluginId) => $"{KeyPrefix}{pluginId}";

    private static JsonElement ParseSchema(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
            return document.RootElement.Clone();
        }
        catch (JsonException e)
        {
            throw new ValidationException($"Plugin settings schema is invalid: {e.Message}");
        }
    }
}

/// <summary>
/// Deliberately small JSON-Schema guard for settings. It covers the object/properties/required/type subset the generated
/// settings UI needs, while leaving richer schemas to the plugin itself.
/// </summary>
public static class PluginSettingsValidator
{
    public const int MaxBytes = 64 * 1024;

    public static void Validate(JsonElement value, string? schemaJson)
    {
        if (value.ValueKind != JsonValueKind.Object) throw new ValidationException("Plugin settings must be a JSON object.");
        if (value.GetRawText().Length > MaxBytes) throw new ValidationException($"Plugin settings are too large (max {MaxBytes} bytes).");
        if (string.IsNullOrWhiteSpace(schemaJson)) return;

        using var document = JsonDocument.Parse(schemaJson);
        var schema = document.RootElement;
        if (schema.ValueKind != JsonValueKind.Object) throw new ValidationException("Plugin settings schema must be an object.");
        if (schema.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() != "object")
            throw new ValidationException("Plugin settings schema root must have type object.");

        if (schema.TryGetProperty("required", out var required) && required.ValueKind == JsonValueKind.Array)
        {
            foreach (var name in required.EnumerateArray())
            {
                if (name.ValueKind == JsonValueKind.String && !value.TryGetProperty(name.GetString()!, out _))
                    throw new ValidationException($"Plugin setting '{name.GetString()}' is required.");
            }
        }

        if (!schema.TryGetProperty("properties", out var properties) || properties.ValueKind != JsonValueKind.Object) return;
        foreach (var item in value.EnumerateObject())
        {
            if (!properties.TryGetProperty(item.Name, out var propertySchema))
            {
                if (schema.TryGetProperty("additionalProperties", out var additional) && additional.ValueKind == JsonValueKind.False)
                    throw new ValidationException($"Unknown plugin setting '{item.Name}'.");
                continue;
            }
            if (propertySchema.TryGetProperty("type", out var propertyType) && propertyType.ValueKind == JsonValueKind.String
                && !MatchesType(item.Value, propertyType.GetString()!))
                throw new ValidationException($"Plugin setting '{item.Name}' has the wrong JSON type.");
        }
    }

    private static bool MatchesType(JsonElement value, string type) => type switch
    {
        "null" => value.ValueKind == JsonValueKind.Null,
        "object" => value.ValueKind == JsonValueKind.Object,
        "array" => value.ValueKind == JsonValueKind.Array,
        "string" => value.ValueKind == JsonValueKind.String,
        "boolean" => value.ValueKind is JsonValueKind.True or JsonValueKind.False,
        "number" => value.ValueKind == JsonValueKind.Number,
        "integer" => value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out _),
        _ => true,
    };
}

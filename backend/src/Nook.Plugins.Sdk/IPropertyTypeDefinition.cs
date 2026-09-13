using System.Text.Json;

namespace Nook.Plugins.Sdk;

/// <summary>Server-side definition of a collection property type (validation, sorting, filtering).</summary>
public interface IPropertyTypeDefinition
{
    string TypeName { get; }

    /// <summary>Validate and normalise a value. Return the normalised value or throw <see cref="PluginValidationException"/>.</summary>
    JsonElement Normalize(JsonElement value, JsonElement config);

    /// <summary>Key used when sorting rows by this property. <c>null</c> sorts last.</summary>
    IComparable? SortKey(JsonElement value, JsonElement config) => value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    /// <summary>Plain text for search indexing.</summary>
    string? ToPlainText(JsonElement value, JsonElement config) => value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
}

public sealed class PluginValidationException(string message) : Exception(message);

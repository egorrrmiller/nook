using System.Globalization;
using System.Text.Json;
using Nook.Application.Common;
using Nook.Application.Properties;

namespace Nook.Application.Collections;

/// <summary>
/// Validates the stable, storage-level collection contract. Row values are keyed by property id and are deliberately
/// stored as direct JSON values; the schema is the type source of truth.
/// </summary>
public static class CollectionPropertyValidator
{
    public const int MaxProperties = 100;
    public const int MaxPropertyIdLength = 64;
    public const int MaxNameLength = 200;
    public const int MaxStringLength = 10_000;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static JsonElement EmptyObject() => JsonSerializer.SerializeToElement(new Dictionary<string, object?>(), JsonOptions);

    public static JsonElement EmptyArray() => JsonSerializer.SerializeToElement(Array.Empty<object>(), JsonOptions);

    public static (JsonElement Json, IReadOnlyList<CollectionPropertyDto> Properties) NormalizeSchema(
        IReadOnlyList<CollectionPropertyRequest>? requested)
    {
        var source = requested?.ToList() ?? [];
        if (source.Count > MaxProperties) throw new ValidationException($"At most {MaxProperties} properties are allowed.");

        var result = new List<CollectionPropertyDto>(source.Count + 1);
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var titleCount = 0;
        foreach (var item in source)
        {
            var id = NormalizeId(item.Id);
            var name = (item.Name ?? "").Trim();
            if (name.Length == 0 || name.Length > MaxNameLength)
                throw new ValidationException($"Property '{id}' name must be 1–{MaxNameLength} characters.");
            if (!ids.Add(id)) throw new ValidationException($"Property id '{id}' is duplicated.");

            var type = (item.Type ?? "").Trim().ToLowerInvariant();
            if (!CollectionPropertyTypes.All.Contains(type)) throw new ValidationException($"Unknown collection property type '{type}'.");
            if (type == CollectionPropertyTypes.Title) titleCount++;
            if (titleCount > 1) throw new ValidationException("A collection can have only one title property.");

            var config = NormalizeConfig(type, item.Config);
            result.Add(new CollectionPropertyDto(id, name, type, config, result.Count));
        }

        if (titleCount == 0)
        {
            result.Insert(0, new CollectionPropertyDto(
                "title", "Name", CollectionPropertyTypes.Title, EmptyObject(), 0));
            for (var i = 1; i < result.Count; i++) result[i] = result[i] with { Position = i };
        }

        return (JsonSerializer.SerializeToElement(result, JsonOptions), result);
    }

    public static IReadOnlyList<CollectionPropertyDto> ReadSchema(JsonElement schema)
    {
        if (schema.ValueKind != JsonValueKind.Array)
            throw new ValidationException("Collection propertySchema must be an array.");

        var requests = new List<CollectionPropertyRequest>();
        foreach (var item in schema.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
                throw new ValidationException("Every collection property must be an object.");
            requests.Add(new CollectionPropertyRequest(
                StringOrNull(item, "id"),
                StringOrNull(item, "name"),
                StringOrNull(item, "type"),
                item.TryGetProperty("config", out var config) ? config.Clone() : null));
        }
        return NormalizeSchema(requests).Properties;
    }

    public static JsonElement ValidateValues(JsonElement? values, IReadOnlyList<CollectionPropertyDto> schema)
    {
        if (values is null || values.Value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) return EmptyObject();
        if (values.Value.ValueKind != JsonValueKind.Object)
            throw new ValidationException("Collection row properties must be an object keyed by property id.");

        var definitions = schema.ToDictionary(x => x.Id, StringComparer.Ordinal);
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var result = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var property in values.Value.EnumerateObject())
        {
            if (!definitions.TryGetValue(property.Name, out var definition))
            {
                errors[property.Name] = ["Property id is not present in the collection schema."];
                continue;
            }

            try { result[property.Name] = NormalizeValue(property.Value, definition.Type); }
            catch (ValidationException error) { errors[property.Name] = [error.Message]; }
        }

        if (errors.Count > 0) throw new ValidationException("Invalid collection row properties.", errors);
        return JsonSerializer.SerializeToElement(result, JsonOptions);
    }

    public static string TitlePropertyId(IReadOnlyList<CollectionPropertyDto> schema) =>
        schema.First(x => x.Type == CollectionPropertyTypes.Title).Id;

    public static string GetTitle(JsonElement values, IReadOnlyList<CollectionPropertyDto> schema, string fallback = "Untitled")
    {
        if (values.ValueKind != JsonValueKind.Object) return fallback;
        var id = TitlePropertyId(schema);
        if (!values.TryGetProperty(id, out var value) || value.ValueKind != JsonValueKind.String) return fallback;
        var title = value.GetString()?.Trim();
        return string.IsNullOrEmpty(title) ? fallback : title;
    }

    public static JsonElement WithTitle(JsonElement values, IReadOnlyList<CollectionPropertyDto> schema, string title)
    {
        var result = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        if (values.ValueKind == JsonValueKind.Object)
            foreach (var item in values.EnumerateObject()) result[item.Name] = item.Value.Clone();
        result[TitlePropertyId(schema)] = JsonSerializer.SerializeToElement(title.Trim(), JsonOptions);
        return JsonSerializer.SerializeToElement(result, JsonOptions);
    }

    private static string NormalizeId(string? raw)
    {
        var id = (raw ?? "").Trim();
        if (id.Length is 0 or > MaxPropertyIdLength || id.Any(c => !(char.IsLetterOrDigit(c) || c is '_' or '-')))
            throw new ValidationException($"Property id must be 1–{MaxPropertyIdLength} characters and contain only letters, digits, '_' or '-'.");
        return id;
    }

    private static JsonElement NormalizeConfig(string type, JsonElement? config)
    {
        if (config is null || config.Value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) return EmptyObject();
        if (config.Value.ValueKind != JsonValueKind.Object) throw new ValidationException($"Config for '{type}' must be an object.");
        if (type is CollectionPropertyTypes.Select or CollectionPropertyTypes.MultiSelect or CollectionPropertyTypes.Status)
            ValidateOptions(config.Value);
        return config.Value.Clone();
    }

    private static void ValidateOptions(JsonElement config)
    {
        if (!config.TryGetProperty("options", out var options)) return;
        if (options.ValueKind != JsonValueKind.Array) throw new ValidationException("Property config.options must be an array.");
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var option in options.EnumerateArray())
        {
            if (option.ValueKind != JsonValueKind.Object || !option.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String)
                throw new ValidationException("Every property option needs a string id.");
            var value = id.GetString()!.Trim();
            if (value.Length == 0 || value.Length > 100 || !ids.Add(value)) throw new ValidationException("Property option ids must be unique and 1–100 characters.");
            if (option.TryGetProperty("name", out var name) && name.ValueKind != JsonValueKind.String)
                throw new ValidationException("Property option name must be a string.");
        }
    }

    private static object? NormalizeValue(JsonElement value, string type)
    {
        if (value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined) return null;
        return type switch
        {
            CollectionPropertyTypes.Title => RequireString(value, type, 1000),
            CollectionPropertyTypes.Text or CollectionPropertyTypes.Phone => RequireString(value, type, MaxStringLength),
            CollectionPropertyTypes.Url => ValidateUrl(RequireString(value, type, MaxStringLength)),
            CollectionPropertyTypes.Email => ValidateEmail(RequireString(value, type, MaxStringLength)),
            CollectionPropertyTypes.Number => value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number)
                ? number
                : throw new ValidationException("number value must be a number."),
            CollectionPropertyTypes.Checkbox => value.ValueKind is JsonValueKind.True or JsonValueKind.False
                ? value.GetBoolean()
                : throw new ValidationException("checkbox value must be a boolean."),
            CollectionPropertyTypes.Select or CollectionPropertyTypes.Status => RequireString(value, type, 200),
            CollectionPropertyTypes.MultiSelect => ValidateStringArray(value, type),
            CollectionPropertyTypes.Files => ValidateFiles(value),
            CollectionPropertyTypes.Date => ValidateDate(value),
            _ => throw new ValidationException($"Unknown collection property type '{type}'."),
        };
    }

    private static string RequireString(JsonElement value, string type, int max)
    {
        if (value.ValueKind != JsonValueKind.String) throw new ValidationException($"{type} value must be a string.");
        var result = value.GetString()!.Trim();
        if (result.Length > max) throw new ValidationException($"{type} value is too long (max {max} chars).");
        return result;
    }

    private static string ValidateUrl(string value)
    {
        if (value.Length == 0) return value;
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https" or "mailto" or "ftp" or "nook"))
            throw new ValidationException("url value must be an absolute http(s) URL.");
        return value;
    }

    private static string ValidateEmail(string value)
    {
        if (value.Length == 0) return value;
        var at = value.IndexOf('@');
        if (at <= 0 || at == value.Length - 1 || value.Contains(' ')) throw new ValidationException("email value must look like user@host.");
        return value;
    }

    private static string[] ValidateStringArray(JsonElement value, string type)
    {
        if (value.ValueKind != JsonValueKind.Array) throw new ValidationException($"{type} value must be an array of strings.");
        var result = new List<string>();
        foreach (var item in value.EnumerateArray())
        {
            var option = RequireString(item, type, 200);
            if (!result.Contains(option, StringComparer.Ordinal)) result.Add(option);
        }
        return result.ToArray();
    }

    private static string[] ValidateFiles(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Array) throw new ValidationException("files value must be an array of attachment ids.");
        var result = new List<string>();
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String || !Guid.TryParse(item.GetString(), out var id))
                throw new ValidationException("files value must be an array of attachment ids.");
            var normalized = id.ToString("D");
            if (!result.Contains(normalized, StringComparer.Ordinal)) result.Add(normalized);
        }
        return result.ToArray();
    }

    private static Dictionary<string, string?> ValidateDate(JsonElement value)
    {
        string? start;
        string? end = null;
        if (value.ValueKind == JsonValueKind.String) start = value.GetString();
        else if (value.ValueKind == JsonValueKind.Object)
        {
            start = value.TryGetProperty("start", out var startValue) && startValue.ValueKind == JsonValueKind.String ? startValue.GetString() : null;
            end = value.TryGetProperty("end", out var endValue) && endValue.ValueKind == JsonValueKind.String ? endValue.GetString() : null;
        }
        else throw new ValidationException("date value must be { start, end? } or an ISO-8601 string.");

        var result = new Dictionary<string, string?>
        {
            ["start"] = PropertyService.NormalizeDate(start ?? throw new ValidationException("date value needs a start.")),
        };
        if (end is not null) result["end"] = PropertyService.NormalizeDate(end);
        return result;
    }

    private static string? StringOrNull(JsonElement value, string name) =>
        value.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.String ? property.GetString() : null;
}

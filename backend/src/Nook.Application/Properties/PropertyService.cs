using System.Globalization;
using System.Text.Json;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Enums;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Properties;

/// <summary>Contracts §9.3: frontmatter-style page properties stored in <c>nodes.properties</c>.</summary>
public sealed class PropertyService(
    IAppDbContext db,
    IWorkspaceContextAccessor contextAccessor,
    NodeService nodes,
    NodeAccess access,
    IOutbox outbox,
    IRealtimeNotifier realtime,
    IClock clock)
{
    public const int MaxProperties = 100;
    public const int MaxNameLength = 100;
    public const int MaxStringLength = 10_000;
    public static readonly string[] Types = ["text", "number", "checkbox", "date", "select", "multi_select", "url", "email", "phone"];

    public async Task<JsonElement> GetAsync(Guid nodeId, CancellationToken ct)
    {
        var (node, _) = await nodes.RequireAsync(nodeId, WorkspaceRole.Viewer, ct);
        return node.Properties is { ValueKind: JsonValueKind.Object } p ? p : EmptyObject();
    }

    public async Task<JsonElement> ReplaceAsync(Guid nodeId, JsonElement body, CancellationToken ct)
    {
        var validated = Validate(body, allowNullEntries: false);
        return await StoreAsync(nodeId, validated, ct);
    }

    public async Task<JsonElement> MergeAsync(Guid nodeId, JsonElement patch, CancellationToken ct)
    {
        if (patch.ValueKind != JsonValueKind.Object) throw new ValidationException("Body must be an object of properties.");
        var (node, _) = await nodes.RequireAsync(nodeId, WorkspaceRole.Viewer, ct);
        var current = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        if (node.Properties is { ValueKind: JsonValueKind.Object } existing)
        {
            foreach (var p in existing.EnumerateObject()) current[p.Name] = p.Value;
        }
        foreach (var p in patch.EnumerateObject())
        {
            if (p.Value.ValueKind is JsonValueKind.Null) current.Remove(p.Name);
            else current[p.Name] = p.Value;
        }
        var merged = JsonSerializer.SerializeToElement(current);
        return await StoreAsync(nodeId, Validate(merged, allowNullEntries: false), ct);
    }

    private async Task<JsonElement> StoreAsync(Guid nodeId, JsonElement properties, CancellationToken ct)
    {
        var ctx = contextAccessor.Required;
        var (node, _) = await nodes.RequireAsync(nodeId, WorkspaceRole.Editor, ct, tracking: true);
        node.Properties = properties.GetPropertyCount() == 0 ? null : properties;
        node.UpdatedAt = clock.UtcNow;
        outbox.Enqueue(new PropertiesChanged(ctx.WorkspaceId, nodeId, ctx.UserId));
        outbox.Enqueue(new NodeUpdated(ctx.WorkspaceId, nodeId, ["properties"], ctx.UserId));
        await db.SaveChangesAsync(ct);

        access.Remember(node);
        var dto = NodeDto.From(node, await access.EffectiveRoleAsync(node, ct));
        await realtime.NodeChangedAsync(ctx.WorkspaceId, dto with { EffectiveRole = null }, ct);
        return node.Properties ?? EmptyObject();
    }

    // --- validation ---------------------------------------------------------------------------------------------------

    /// <summary>Validates a whole <c>PageProperties</c> object; returns a normalised copy (dates in ISO-8601, trimmed names).</summary>
    public static JsonElement Validate(JsonElement body, bool allowNullEntries)
    {
        if (body.ValueKind != JsonValueKind.Object) throw new ValidationException("Properties must be an object keyed by property name.");
        var errors = new Dictionary<string, string[]>();
        var result = new Dictionary<string, object?>(StringComparer.Ordinal);
        var count = 0;
        foreach (var p in body.EnumerateObject())
        {
            var name = p.Name.Trim();
            if (name.Length == 0 || name.Length > MaxNameLength) { errors[p.Name] = [$"Property name must be 1–{MaxNameLength} chars."]; continue; }
            if (p.Value.ValueKind == JsonValueKind.Null)
            {
                if (allowNullEntries) continue;
                errors[name] = ["Property must be an object { type, value }."];
                continue;
            }
            if (++count > MaxProperties) { errors[name] = [$"At most {MaxProperties} properties per page."]; break; }
            try
            {
                result[name] = ValidateProperty(p.Value);
            }
            catch (ValidationException e)
            {
                errors[name] = [e.Message];
            }
        }
        if (errors.Count > 0) throw new ValidationException("Invalid page properties.", errors);
        return JsonSerializer.SerializeToElement(result);
    }

    private static Dictionary<string, object?> ValidateProperty(JsonElement prop)
    {
        if (prop.ValueKind != JsonValueKind.Object) throw new ValidationException("Property must be an object { type, value }.");
        var type = prop.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString()! : "";
        if (!Types.Contains(type)) throw new ValidationException($"Unknown property type '{type}'.");
        var value = prop.TryGetProperty("value", out var v) ? v : default;
        object? normalized = value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null ? null : type switch
        {
            "text" or "select" or "phone" => RequireString(value, type),
            "url" => ValidateUrl(RequireString(value, type)),
            "email" => ValidateEmail(RequireString(value, type)),
            "number" => value.ValueKind == JsonValueKind.Number ? value.GetDouble() : throw new ValidationException("number value must be a number."),
            "checkbox" => value.ValueKind is JsonValueKind.True or JsonValueKind.False ? value.GetBoolean() : throw new ValidationException("checkbox value must be a boolean."),
            "multi_select" => ValidateStringArray(value),
            "date" => ValidateDate(value),
            _ => throw new ValidationException($"Unknown property type '{type}'."),
        };
        return new Dictionary<string, object?> { ["type"] = type, ["value"] = normalized };
    }

    private static string RequireString(JsonElement value, string type)
    {
        if (value.ValueKind != JsonValueKind.String) throw new ValidationException($"{type} value must be a string.");
        var s = value.GetString()!;
        if (s.Length > MaxStringLength) throw new ValidationException($"{type} value is too long (max {MaxStringLength} chars).");
        return s;
    }

    private static string ValidateUrl(string s)
    {
        if (s.Length == 0) return s;
        if (!Uri.TryCreate(s, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https" or "mailto" or "ftp" or "nook"))
            throw new ValidationException("url value must be an absolute http(s) URL.");
        return s;
    }

    private static string ValidateEmail(string s)
    {
        if (s.Length == 0) return s;
        var at = s.IndexOf('@');
        if (at <= 0 || at == s.Length - 1 || s.Contains(' ')) throw new ValidationException("email value must look like user@host.");
        return s;
    }

    private static string[] ValidateStringArray(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Array) throw new ValidationException("multi_select value must be an array of strings.");
        var list = new List<string>();
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String) throw new ValidationException("multi_select value must be an array of strings.");
            var s = item.GetString()!;
            if (!list.Contains(s)) list.Add(s);
        }
        return list.ToArray();
    }

    private static Dictionary<string, object?> ValidateDate(JsonElement value)
    {
        string? start;
        string? end = null;
        if (value.ValueKind == JsonValueKind.String)
        {
            start = value.GetString();
        }
        else if (value.ValueKind == JsonValueKind.Object)
        {
            start = value.TryGetProperty("start", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString() : null;
            end = value.TryGetProperty("end", out var e) && e.ValueKind == JsonValueKind.String ? e.GetString() : null;
        }
        else
        {
            throw new ValidationException("date value must be { start, end? } or an ISO-8601 string.");
        }
        var result = new Dictionary<string, object?> { ["start"] = NormalizeDate(start ?? throw new ValidationException("date value needs a start.")) };
        if (end is not null) result["end"] = NormalizeDate(end);
        return result;
    }

    /// <summary>Accepts <c>YYYY-MM-DD</c> or a full ISO-8601 timestamp; anything else → 400.</summary>
    public static string NormalizeDate(string raw)
    {
        var s = raw.Trim();
        if (DateOnly.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) return d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        if (s.Length >= 16 && DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind | DateTimeStyles.AssumeUniversal, out var dto)
            && s[4] == '-' && s[7] == '-' && (s[10] == 'T' || s[10] == ' '))
            return dto.ToString("yyyy-MM-dd'T'HH:mm:ss.FFFK", CultureInfo.InvariantCulture);
        throw new ValidationException($"'{raw}' is not an ISO-8601 date.");
    }

    private static JsonElement EmptyObject()
    {
        using var doc = JsonDocument.Parse("{}");
        return doc.RootElement.Clone();
    }
}

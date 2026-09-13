using System.Text.Json;
using System.Text.Json.Serialization;
using Nook.Domain.Entities;

namespace Nook.Application.Files;

/// <summary>Wire shape of an attachment (contracts §8).</summary>
public sealed record AttachmentDto(
    Guid Id,
    Guid NodeId,
    Guid? BlockId,
    string? PropertyId,
    string Purpose,
    string Filename,
    string Mime,
    long Size,
    string Sha256,
    string Url,
    string? ThumbUrl,
    AttachmentMeta Meta,
    DateTimeOffset CreatedAt)
{
    public static AttachmentDto From(Attachment a) => new(
        a.Id, a.NodeId, a.BlockId, a.PropertyId, a.Purpose, a.Filename, a.Mime, a.Size, a.BlobSha,
        $"/api/files/{a.Id}",
        MimeSniffer.IsThumbnailable(a.Mime) ? $"/api/files/{a.Id}/thumb" : null,
        AttachmentMeta.From(a.Meta),
        a.CreatedAt);
}

/// <summary>Metadata filled in by background extraction. Persisted as-is in <c>attachments.meta</c>.</summary>
public sealed record AttachmentMeta(
    int? Width = null,
    int? Height = null,
    double? Duration = null,
    int? Pages = null,
    bool? TextExtracted = null)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    public static AttachmentMeta From(JsonElement? json)
    {
        if (json is null || json.Value.ValueKind != JsonValueKind.Object) return new AttachmentMeta();
        try { return json.Value.Deserialize<AttachmentMeta>(Json) ?? new AttachmentMeta(); }
        catch (JsonException) { return new AttachmentMeta(); }
    }

    public JsonElement ToJson() => JsonSerializer.SerializeToElement(this, Json);
}

public static class AttachmentPurpose
{
    public const string Content = "content";
    public const string Icon = "icon";
    public const string Cover = "cover";

    public static string Normalize(string? purpose) => purpose?.Trim().ToLowerInvariant() switch
    {
        null or "" or Content => Content,
        Icon => Icon,
        Cover => Cover,
        _ => throw new Common.ValidationException("purpose must be content|icon|cover."),
    };
}

/// <summary>Input of an upload, independent of the transport (multipart or from-url).</summary>
public sealed record UploadTarget(Guid NodeId, Guid? BlockId, string? PropertyId, string? Purpose);

public sealed record FromUrlRequest(string Url, Guid NodeId, Guid? BlockId, string? PropertyId, string? Purpose);

public sealed record LinkPreviewRequest(string Url);

public sealed record LinkPreviewDto(
    string Url,
    string FinalUrl,
    string? Title,
    string? Description,
    string? ImageUrl,
    string? FaviconUrl,
    string? SiteName,
    LinkEmbedDto? Embed,
    DateTimeOffset FetchedAt);

public sealed record LinkEmbedDto(
    string Provider,
    string? Html,
    string? Url,
    int? Width,
    int? Height,
    double? AspectRatio);

public sealed record CoverDto(string Id, string Name, string Group, string Url, string ThumbUrl);

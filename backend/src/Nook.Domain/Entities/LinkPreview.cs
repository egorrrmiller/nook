using System.Text.Json;

namespace Nook.Domain.Entities;

/// <summary>Cached result of <c>POST /api/links/preview</c> (7 days). Instance-wide: previews are not workspace data.</summary>
public class LinkPreview
{
    /// <summary>sha256 (hex) of the normalised URL.</summary>
    public required string UrlHash { get; set; }
    public required string Url { get; set; }
    /// <summary>The serialised <c>LinkPreview</c> DTO.</summary>
    public JsonElement Data { get; set; }
    public DateTimeOffset FetchedAt { get; set; } = DateTimeOffset.UtcNow;
}

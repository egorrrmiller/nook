using System.Text.Json;

namespace Nook.Domain.Entities;

public class Attachment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public required string BlobSha { get; set; }
    public Guid NodeId { get; set; }
    public Guid? BlockId { get; set; }
    public string? PropertyId { get; set; }
    /// <summary><c>content</c> | <c>icon</c> | <c>cover</c>.</summary>
    public string Purpose { get; set; } = "content";
    public required string Filename { get; set; }
    public required string Mime { get; set; }
    public long Size { get; set; }
    /// <summary><c>{width?, height?, duration?, pages?, textExtracted?}</c>.</summary>
    public JsonElement? Meta { get; set; }
    /// <summary>Plain text extracted in the background (PDF, DOCX, text/*); indexed by the generated <c>text_ru</c>/<c>text_en</c> columns.</summary>
    public string? ExtractedText { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

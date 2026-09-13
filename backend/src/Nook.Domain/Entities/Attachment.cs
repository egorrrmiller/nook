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
    public required string Filename { get; set; }
    public required string Mime { get; set; }
    public long Size { get; set; }
    public JsonElement? Meta { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

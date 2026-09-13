namespace Nook.Domain.Entities;

/// <summary>Content-addressed binary shared by the whole instance.</summary>
public class Blob
{
    public required string Sha256 { get; set; }
    public long Size { get; set; }
    public required string Mime { get; set; }
    public DateTimeOffset StoredAt { get; set; } = DateTimeOffset.UtcNow;
}

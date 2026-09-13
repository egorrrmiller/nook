using System.Text.Json;

namespace Nook.Domain.Entities;

/// <summary>A large import (&gt; 20 MB) that runs in the background (contracts §9.8); polled via <c>GET /api/import/{jobId}</c>.</summary>
public class ImportJob
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public Guid UserId { get; set; }
    public Guid? ParentNodeId { get; set; }
    public required string FileName { get; set; }
    /// <summary>Absolute path of the uploaded archive on disk (deleted when the job finishes).</summary>
    public required string FilePath { get; set; }
    /// <summary><c>pending</c> | <c>running</c> | <c>done</c> | <c>failed</c>.</summary>
    public string Status { get; set; } = "pending";
    public JsonElement? Result { get; set; }
    public string? Error { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? FinishedAt { get; set; }
}

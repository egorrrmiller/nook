namespace Nook.Domain.Entities;

/// <summary>A node pinned by a user inside a workspace (contracts §7.3); ordered by a fractional index.</summary>
public class Favorite
{
    public Guid UserId { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid NodeId { get; set; }
    public string Position { get; set; } = "a0";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Node? Node { get; set; }
}

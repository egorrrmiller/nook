namespace Nook.Domain.Entities;

/// <summary>Last visit of a node by a user inside a workspace (contracts §7.3); capped at 100 rows per user/workspace.</summary>
public class Recent
{
    public Guid UserId { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid NodeId { get; set; }
    public DateTimeOffset VisitedAt { get; set; } = DateTimeOffset.UtcNow;

    public Node? Node { get; set; }
}

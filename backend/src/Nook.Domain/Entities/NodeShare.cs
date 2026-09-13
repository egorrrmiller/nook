using Nook.Domain.Enums;

namespace Nook.Domain.Entities;

/// <summary>Grants <see cref="UserId"/> access to the subtree rooted at <see cref="NodeId"/>.</summary>
public class NodeShare
{
    public Guid NodeId { get; set; }
    public Guid UserId { get; set; }
    public WorkspaceRole Role { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Node? Node { get; set; }
    public User? User { get; set; }
}

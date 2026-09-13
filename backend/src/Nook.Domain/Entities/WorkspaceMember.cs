using Nook.Domain.Enums;

namespace Nook.Domain.Entities;

public class WorkspaceMember
{
    public Guid WorkspaceId { get; set; }
    public Guid UserId { get; set; }
    public WorkspaceRole Role { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Workspace? Workspace { get; set; }
    public User? User { get; set; }
}

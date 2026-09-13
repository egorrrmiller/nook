using Nook.Domain.ValueObjects;

namespace Nook.Domain.Entities;

public class Workspace
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OwnerId { get; set; }
    public required string Name { get; set; }
    public NodeIcon? Icon { get; set; }
    public bool IsPersonal { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User? Owner { get; set; }
    public ICollection<WorkspaceMember> Members { get; set; } = new List<WorkspaceMember>();
}

namespace Nook.Domain.Entities;

public class Tag
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public required string Name { get; set; }
    public string? Color { get; set; }
}

public class NodeTag
{
    public Guid NodeId { get; set; }
    public Guid TagId { get; set; }
}

using Nook.Domain.Enums;

namespace Nook.Domain.Entities;

public class Tag
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public required string Name { get; set; }
    public string? Color { get; set; }
}

/// <summary>Node ↔ tag; the same tag may be attached both manually and inline (one row per source).</summary>
public class NodeTag
{
    public Guid NodeId { get; set; }
    public Guid TagId { get; set; }
    public TagSource Source { get; set; } = TagSource.Manual;
}

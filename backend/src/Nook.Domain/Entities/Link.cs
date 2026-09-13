using Nook.Domain.Enums;

namespace Nook.Domain.Entities;

/// <summary>Derived link graph, rebuilt from blocks on each document store.</summary>
public class Link
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SourceNodeId { get; set; }
    public Guid? SourceBlockId { get; set; }
    public Guid? TargetNodeId { get; set; }
    public Guid? TargetBlockId { get; set; }
    public LinkKind Kind { get; set; }
    public string? Href { get; set; }
}

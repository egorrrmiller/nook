namespace Nook.Domain.Entities;

/// <summary>Source of truth for page content: the serialized Y.Doc state.</summary>
public class Document
{
    public Guid NodeId { get; set; }
    public byte[] Ydoc { get; set; } = [];
    public int Version { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Node? Node { get; set; }
}

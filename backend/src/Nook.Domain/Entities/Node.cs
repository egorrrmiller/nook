using System.Text.Json;
using Nook.Domain.Enums;
using Nook.Domain.ValueObjects;

namespace Nook.Domain.Entities;

public class Node
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public Guid? ParentId { get; set; }
    public NodeKind Kind { get; set; } = NodeKind.Page;
    public string Title { get; set; } = "";
    public NodeIcon? Icon { get; set; }
    public NodeCover? Cover { get; set; }
    /// <summary>Fractional index among siblings (base-62 key, see <see cref="Ordering.FractionalIndex"/>).</summary>
    public string Position { get; set; } = "a0";
    public PageSettings? PageSettings { get; set; }
    public Guid? CollectionId { get; set; }
    public JsonElement? Properties { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Workspace? Workspace { get; set; }
    public Node? Parent { get; set; }
    public ICollection<Node> Children { get; set; } = new List<Node>();
    public ICollection<NodeShare> Shares { get; set; } = new List<NodeShare>();
}

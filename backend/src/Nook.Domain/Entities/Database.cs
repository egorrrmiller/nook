namespace Nook.Domain.Entities;

/// <summary>
/// Database presentation root. Its identity is the backing <see cref="Node"/> id, while the collection is the
/// reusable data source shared by one or more database nodes/views.
/// </summary>
public class Database
{
    public Guid NodeId { get; set; }
    public Guid CollectionId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Node? Node { get; set; }
    public Collection? Collection { get; set; }
    public ICollection<CollectionView> Views { get; set; } = new List<CollectionView>();
}

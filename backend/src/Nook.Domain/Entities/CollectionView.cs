using System.Text.Json;

namespace Nook.Domain.Entities;

/// <summary>A saved view over a collection as shown by one database node.</summary>
public class CollectionView
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DatabaseId { get; set; }
    public Guid CollectionId { get; set; }
    public string Name { get; set; } = "Table";
    public string Kind { get; set; } = "table";
    public JsonElement Config { get; set; }
    public string Position { get; set; } = "a0";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Database? Database { get; set; }
    public Collection? Collection { get; set; }
}

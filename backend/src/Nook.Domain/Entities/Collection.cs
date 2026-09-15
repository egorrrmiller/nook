using System.Text.Json;

namespace Nook.Domain.Entities;

/// <summary>
/// A reusable data source for database nodes. The schema and presentation defaults are kept as JSON so adding a
/// property option later does not require a database migration or a breaking change to the row model.
/// </summary>
public class Collection
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public string Name { get; set; } = "";
    public JsonElement PropertySchema { get; set; }
    public JsonElement Templates { get; set; }
    public JsonElement RowLayout { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Workspace? Workspace { get; set; }
    public ICollection<Database> Databases { get; set; } = new List<Database>();
}

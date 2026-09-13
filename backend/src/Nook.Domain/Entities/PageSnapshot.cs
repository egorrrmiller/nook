using System.Text.Json;
using Nook.Domain.Enums;

namespace Nook.Domain.Entities;

public class PageSnapshot
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid NodeId { get; set; }
    public DateTimeOffset TakenAt { get; set; } = DateTimeOffset.UtcNow;
    public int Version { get; set; }
    public string Title { get; set; } = "";
    public JsonElement Blocks { get; set; }
    public Guid? UserId { get; set; }
    public SnapshotKind Kind { get; set; } = SnapshotKind.Auto;
    /// <summary>Number of blocks in <see cref="Blocks"/> (all levels), denormalised for version lists.</summary>
    public int BlockCount { get; set; }
}

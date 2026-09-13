using System.Text.Json;

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
}

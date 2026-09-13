using System.Text.Json;

namespace Nook.Domain.Entities;

/// <summary>Transactional outbox row; dispatched to in-process event handlers by the outbox dispatcher.</summary>
public class OutboxEvent
{
    public long Id { get; set; }
    public required string Type { get; set; }
    public JsonElement Payload { get; set; }
    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DispatchedAt { get; set; }
    public int Attempts { get; set; }
    public string? LastError { get; set; }
}

namespace Nook.Domain.Entities;

/// <summary>Append-only journal of incremental Yjs updates (for history / point-in-time restore).</summary>
public class DocumentUpdate
{
    public Guid NodeId { get; set; }
    public long Seq { get; set; }
    public byte[] Update { get; set; } = [];
    public Guid? UserId { get; set; }
    public DateTimeOffset At { get; set; } = DateTimeOffset.UtcNow;
}

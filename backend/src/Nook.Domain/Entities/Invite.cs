namespace Nook.Domain.Entities;

public class Invite
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Code { get; set; }
    public string? Email { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
    public Guid? UsedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public bool IsUsable(DateTimeOffset now) => UsedAt is null && ExpiresAt > now;
}

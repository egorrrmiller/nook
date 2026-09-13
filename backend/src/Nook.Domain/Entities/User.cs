namespace Nook.Domain.Entities;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Email { get; set; }
    public required string PasswordHash { get; set; }
    public required string DisplayName { get; set; }
    public string? AvatarUrl { get; set; }
    public bool IsInstanceOwner { get; set; }
    public string? TotpSecret { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<WorkspaceMember> Memberships { get; set; } = new List<WorkspaceMember>();
}

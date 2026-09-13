namespace Nook.Domain.Entities;

public class ApiToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public required string Name { get; set; }
    /// <summary>Hex-encoded SHA-256 of the raw token. The raw token is shown once at creation.</summary>
    public required string TokenHash { get; set; }
    public string[] Scopes { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastUsedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }

    public User? User { get; set; }
}

public static class ApiTokenScopes
{
    public const string Read = "read";
    public const string Write = "write";
    public const string Admin = "admin";
    public static readonly string[] All = [Read, Write, Admin];
}

namespace Nook.Domain.Entities;

/// <summary>Rotatable OAuth refresh token. Only its hash is stored.</summary>
public class OAuthRefreshToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InstallationId { get; set; }
    /// <summary>Hash of the refresh token.</summary>
    public required string TokenHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ExpiresAt { get; set; }
    public DateTimeOffset? RotatedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }

    public IntegrationInstallation? Installation { get; set; }
}

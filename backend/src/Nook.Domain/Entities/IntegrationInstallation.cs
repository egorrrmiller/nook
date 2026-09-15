using Nook.Domain.Enums;

namespace Nook.Domain.Entities;

/// <summary>
/// A workspace-scoped installation and its current bearer token. Only the token hash is persisted.
/// </summary>
public class IntegrationInstallation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid IntegrationId { get; set; }
    public Guid WorkspaceId { get; set; }
    /// <summary>Bot principal used for internal connections and OAuth installations, when one exists.</summary>
    public Guid? BotUserId { get; set; }
    /// <summary>User principal for PAT-like and OAuth installations, when applicable.</summary>
    public Guid? OwnerUserId { get; set; }
    /// <summary>Hash of the current access token. The raw token is returned only once.</summary>
    public required string TokenHash { get; set; }
    public InstallationTokenKind TokenKind { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastUsedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }

    public Integration? Integration { get; set; }
    public Workspace? Workspace { get; set; }
    public User? BotUser { get; set; }
    public User? OwnerUser { get; set; }
    public IntegrationCapabilities? Capabilities { get; set; }
    public ICollection<IntegrationGrant> Grants { get; set; } = new List<IntegrationGrant>();
    public ICollection<OAuthRefreshToken> RefreshTokens { get; set; } = new List<OAuthRefreshToken>();
}

namespace Nook.Domain.Entities;

/// <summary>Single-use, short-lived OAuth authorization code. Only its hash is stored.</summary>
public class OAuthAuthorizationCode
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid IntegrationId { get; set; }
    public Guid UserId { get; set; }
    public Guid WorkspaceId { get; set; }
    /// <summary>Hash of the temporary authorization code.</summary>
    public required string CodeHash { get; set; }
    public required string RedirectUri { get; set; }
    public string[] Scopes { get; set; } = [];
    public string? CodeChallenge { get; set; }
    public string? CodeChallengeMethod { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }

    public Integration? Integration { get; set; }
    public User? User { get; set; }
    public Workspace? Workspace { get; set; }
}

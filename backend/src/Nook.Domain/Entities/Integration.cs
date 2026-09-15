using Nook.Domain.Enums;

namespace Nook.Domain.Entities;

/// <summary>
/// Instance-level registration for an external Notion-compatible integration. A registration is installed into
/// one or more workspaces through <see cref="IntegrationInstallation"/> records.
/// </summary>
public class Integration
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string ClientId { get; set; }
    /// <summary>Hash of the client secret. The clear-text secret is never persisted.</summary>
    public string? ClientSecretHash { get; set; }
    public required string Name { get; set; }
    public IntegrationKind Kind { get; set; } = IntegrationKind.Internal;
    public string[] RedirectUris { get; set; } = [];
    public bool Enabled { get; set; } = true;
    public Guid? CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User? CreatedByUser { get; set; }
    public ICollection<IntegrationInstallation> Installations { get; set; } = new List<IntegrationInstallation>();
    public ICollection<OAuthAuthorizationCode> AuthorizationCodes { get; set; } = new List<OAuthAuthorizationCode>();
}

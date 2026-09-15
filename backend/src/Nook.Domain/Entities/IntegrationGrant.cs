namespace Nook.Domain.Entities;

/// <summary>
/// Access granted to an installation at a page root. By default the grant covers the complete descendant subtree.
/// </summary>
public class IntegrationGrant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InstallationId { get; set; }
    public Guid NodeId { get; set; }
    public bool IncludeChildren { get; set; } = true;
    public Guid? GrantedByUserId { get; set; }
    public DateTimeOffset GrantedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? RevokedAt { get; set; }

    public IntegrationInstallation? Installation { get; set; }
    public Node? Node { get; set; }
    public User? GrantedByUser { get; set; }
}

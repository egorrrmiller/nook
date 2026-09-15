using Microsoft.EntityFrameworkCore;
using Nook.Application.Auth;
using Nook.Application.Common;
using Nook.Domain.Enums;

namespace Nook.Application.Integrations.Notion;

public sealed class NotionTokenResolver(IAppDbContext db) : INotionTokenResolver
{
    public async Task<NotionPrincipal?> ResolveAsync(string bearerToken, CancellationToken cancellationToken = default)
    {
        var hash = AuthService.HashToken(bearerToken);
        var installation = await db.IntegrationInstallations
            .AsNoTracking()
            .Include(x => x.Capabilities)
            .Include(x => x.Integration)
            .FirstOrDefaultAsync(x => x.TokenHash == hash && x.RevokedAt == null && x.Integration!.Enabled, cancellationToken);

        if (installation is null) return null;

        var capabilities = installation.Capabilities is null
            ? new NotionCapabilities(false, false, false, false, false, false, false, false, NotionUserInfoLevel.None)
            : NotionCapabilities.FromDomain(installation.Capabilities);

        return new NotionPrincipal(
            installation.Id,
            installation.WorkspaceId,
            installation.TokenKind,
            installation.OwnerUserId,
            installation.BotUserId,
            capabilities,
            installation.Integration?.Name);
    }
}

public sealed class NotionGrantPolicy(IAppDbContext db) : INotionGrantPolicy
{
    private Guid? cachedInstallationId;
    private IReadOnlyCollection<Guid>? cachedVisibleIds;
    private bool visibilityResolved;

    public async Task<NotionGrantDecision> EvaluateAsync(
        NotionPrincipal principal,
        Guid nodeId,
        CancellationToken cancellationToken = default)
    {
        var visible = await VisibleNodeIdsAsync(principal, cancellationToken);
        return visible is null || visible.Contains(nodeId)
            ? new NotionGrantDecision(true, null)
            : NotionGrantDecision.Denied;
    }

    public async Task<IReadOnlyCollection<Guid>?> VisibleNodeIdsAsync(
        NotionPrincipal principal,
        CancellationToken cancellationToken = default)
    {
        if (visibilityResolved && cachedInstallationId == principal.InstallationId) return cachedVisibleIds;

        cachedInstallationId = principal.InstallationId;
        visibilityResolved = true;

        // A PAT acts as its owner. OAuth/public and internal Connections are separate principals and must
        // use explicit page grants even when the authorizing user is a workspace member.
        if (principal.TokenKind == InstallationTokenKind.PersonalAccessToken
            && principal.OwnerUserId is Guid ownerUserId)
        {
            var isMember = await db.WorkspaceMembers.AsNoTracking()
                .AnyAsync(x => x.WorkspaceId == principal.WorkspaceId && x.UserId == ownerUserId, cancellationToken);
            if (isMember)
            {
                cachedVisibleIds = null;
                return null;
            }

            cachedVisibleIds = await db.Database.SqlQuery<Guid>($"""
                WITH RECURSIVE visible AS (
                    SELECT n.id
                    FROM nodes n
                    JOIN node_shares s ON s.node_id = n.id
                    WHERE s.user_id = {ownerUserId}
                      AND n.workspace_id = {principal.WorkspaceId}
                      AND n.deleted_at IS NULL
                    UNION
                    SELECT child.id
                    FROM nodes child
                    JOIN visible parent ON parent.id = child.parent_id
                    WHERE child.workspace_id = {principal.WorkspaceId}
                      AND child.deleted_at IS NULL
                )
                SELECT id AS "Value" FROM visible
                """).ToHashSetAsync(cancellationToken);
            return cachedVisibleIds;
        }

        cachedVisibleIds = await db.Database.SqlQuery<Guid>($"""
            WITH RECURSIVE visible AS (
                SELECT n.id, g.include_children AS descend
                FROM integration_grants g
                JOIN nodes n ON n.id = g.node_id
                WHERE g.installation_id = {principal.InstallationId}
                  AND g.revoked_at IS NULL
                  AND n.workspace_id = {principal.WorkspaceId}
                  AND n.deleted_at IS NULL
                UNION ALL
                SELECT child.id, TRUE
                FROM nodes child
                JOIN visible parent ON parent.id = child.parent_id AND parent.descend
                WHERE child.workspace_id = {principal.WorkspaceId}
                  AND child.deleted_at IS NULL
            )
            SELECT DISTINCT id AS "Value" FROM visible
            """).ToHashSetAsync(cancellationToken);
        return cachedVisibleIds;
    }
}

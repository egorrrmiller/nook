using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Domain.Enums;

namespace Nook.Application.Workspaces;

public sealed class WorkspaceContextResolver(IAppDbContext db)
{
    /// <summary>Resolves the context for <paramref name="userId"/> in <paramref name="workspaceId"/>; throws 403 when the user has no access at all.</summary>
    public async Task<WorkspaceContext> ResolveAsync(Guid userId, Guid workspaceId, CancellationToken ct)
    {
        var membership = await db.WorkspaceMembers.AsNoTracking()
            .Where(m => m.WorkspaceId == workspaceId && m.UserId == userId)
            .Select(m => (WorkspaceRole?)m.Role)
            .FirstOrDefaultAsync(ct);

        var shares = await db.NodeShares.AsNoTracking()
            .Where(s => s.UserId == userId && s.Node!.WorkspaceId == workspaceId && s.Node.DeletedAt == null)
            .Select(s => new { s.NodeId, s.Role })
            .ToListAsync(ct);

        if (membership is null && shares.Count == 0)
            throw new ForbiddenException("You do not have access to this workspace.");

        return new WorkspaceContext
        {
            WorkspaceId = workspaceId,
            UserId = userId,
            MembershipRole = membership,
            Shares = shares.ToDictionary(s => s.NodeId, s => s.Role),
        };
    }

    /// <summary>Resolves the context from the workspace that owns <paramref name="nodeId"/> (used when a request carries only a node id).</summary>
    public async Task<WorkspaceContext> ResolveForNodeAsync(Guid userId, Guid nodeId, CancellationToken ct)
    {
        var workspaceId = await db.Nodes.AsNoTracking()
            .Where(n => n.Id == nodeId)
            .Select(n => (Guid?)n.WorkspaceId)
            .FirstOrDefaultAsync(ct);
        if (workspaceId is null) throw new NotFoundException("Node not found.");
        return await ResolveAsync(userId, workspaceId.Value, ct);
    }
}

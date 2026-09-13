using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;

namespace Nook.Application.Recents;

/// <summary>Contracts §7.3: last visited nodes per user/workspace, newest first, capped at <see cref="MaxPerUser"/>.</summary>
public sealed class RecentService(
    IAppDbContext db,
    IWorkspaceContextAccessor contextAccessor,
    NodeService nodes,
    TreeQueries tree,
    IClock clock)
{
    public const int MaxPerUser = 100;
    public const int DefaultLimit = 20;

    private WorkspaceContext Ctx => contextAccessor.Required;

    public async Task<IReadOnlyList<RecentDto>> ListAsync(int? limit, CancellationToken ct)
    {
        var take = Math.Clamp(limit ?? DefaultLimit, 1, MaxPerUser);
        var ctx = Ctx;
        var rows = await db.Recents.AsNoTracking()
            .Include(r => r.Node)
            .Where(r => r.UserId == ctx.UserId && r.WorkspaceId == ctx.WorkspaceId && r.Node!.DeletedAt == null)
            .OrderByDescending(r => r.VisitedAt)
            .Take(take)
            .ToListAsync(ct);
        var dtos = await tree.ToDtosAsync(rows.Select(r => r.Node!).ToList(), ct);
        return rows.Where(r => dtos.ContainsKey(r.NodeId)).Select(r => new RecentDto(dtos[r.NodeId], r.VisitedAt)).ToList();
    }

    /// <summary>Records a visit (upsert) and trims the user's list to the newest <see cref="MaxPerUser"/> rows.</summary>
    public async Task RecordAsync(Guid nodeId, CancellationToken ct)
    {
        var ctx = Ctx;
        await nodes.RequireAsync(nodeId, WorkspaceRole.Viewer, ct);
        var now = clock.UtcNow;
        var existing = await db.Recents.FirstOrDefaultAsync(r => r.UserId == ctx.UserId && r.WorkspaceId == ctx.WorkspaceId && r.NodeId == nodeId, ct);
        if (existing is null)
            db.Recents.Add(new Recent { UserId = ctx.UserId, WorkspaceId = ctx.WorkspaceId, NodeId = nodeId, VisitedAt = now });
        else
            existing.VisitedAt = now;
        await db.SaveChangesAsync(ct);

        await db.Database.ExecuteSqlAsync($"""
            DELETE FROM recents WHERE user_id = {ctx.UserId} AND workspace_id = {ctx.WorkspaceId} AND node_id IN (
                SELECT node_id FROM recents WHERE user_id = {ctx.UserId} AND workspace_id = {ctx.WorkspaceId}
                ORDER BY visited_at DESC OFFSET {MaxPerUser})
            """, ct);
    }
}

using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Domain.Ordering;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Trash;

/// <summary>Contracts §7.2: list / restore / permanently delete soft-deleted subtrees.</summary>
public sealed class TrashService(
    IAppDbContext db,
    IWorkspaceContextAccessor contextAccessor,
    NodeAccess access,
    NodeService nodes,
    TreeQueries tree,
    IClock clock,
    IOutbox outbox,
    IRealtimeNotifier realtime)
{
    public const int DefaultLimit = 50;
    public const int MaxLimit = 200;

    private WorkspaceContext Ctx => contextAccessor.Required;

    private IQueryable<Node> Scoped => db.Nodes.Where(n => n.WorkspaceId == Ctx.WorkspaceId);

    /// <summary>Trash roots: deleted nodes whose own parent is missing or alive.</summary>
    private IQueryable<Node> TrashRoots => Scoped.Where(n => n.DeletedAt != null && (n.ParentId == null || n.Parent!.DeletedAt == null));

    public async Task<IReadOnlyList<TrashItem>> ListAsync(string? q, int? limit, CancellationToken ct)
    {
        var take = Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);
        var query = TrashRoots.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = "%" + q.Trim().ToLowerInvariant().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            query = query.Where(n => EF.Functions.Like(n.Title.ToLower(), pattern, "\\"));
        }
        var roots = await query.OrderByDescending(n => n.DeletedAt).ThenBy(n => n.Title).Take(take).ToListAsync(ct);
        if (roots.Count == 0) return [];

        // Access: members see all; share-only callers only what falls inside a shared subtree.
        var dtos = await tree.ToDtosAsync(roots, ct);
        var visible = roots.Where(r => dtos.ContainsKey(r.Id)).ToList();

        var parentIds = visible.Where(r => r.ParentId is not null).Select(r => r.ParentId!.Value).Distinct().ToArray();
        var parents = parentIds.Length == 0
            ? new Dictionary<Guid, NodeSummary>()
            : await Scoped.AsNoTracking().Where(n => parentIds.Contains(n.Id) && n.DeletedAt == null)
                .Select(n => new NodeSummary(n.Id, n.Title, n.Icon, n.Kind.ToWire(), n.ParentId))
                .ToDictionaryAsync(s => s.Id, ct);
        var crumbs = await tree.BreadcrumbsAsync(visible.Select(r => (r.Id, r.ParentId)).ToList(), ct);

        return visible.Select(r => new TrashItem(
            dtos[r.Id],
            r.DeletedAt!.Value,
            r.ParentId is Guid pid ? parents.GetValueOrDefault(pid) : null,
            crumbs.GetValueOrDefault(r.Id) ?? [])).ToList();
    }

    /// <summary>Restores the node and the descendants trashed together with it. Target = parentId ?? original parent (if alive) ?? root.</summary>
    public async Task<NodeDto> RestoreAsync(Guid id, RestoreNodeRequest request, CancellationToken ct)
    {
        var ctx = Ctx;
        var node = await Scoped.FirstOrDefaultAsync(n => n.Id == id && n.DeletedAt != null, ct) ?? throw new NotFoundException("Node not found in trash.");
        await RequireEditorAsync(node, ct);

        Guid? target;
        if (request.ParentId is Guid requested)
        {
            target = requested;
        }
        else
        {
            var originalAlive = node.ParentId is Guid op && await Scoped.AsNoTracking().AnyAsync(n => n.Id == op && n.DeletedAt == null, ct);
            target = originalAlive ? node.ParentId : null;
        }

        if (target is Guid tid)
        {
            if (tid == node.Id) throw new ValidationException("A node cannot be its own parent.");
            var (parent, _) = await nodes.RequireAsync(tid, WorkspaceRole.Editor, ct);
            var ancestors = await access.AncestorIdsAsync(parent.ParentId, ct);
            if (ancestors.Contains(node.Id)) throw new ValidationException("Cannot restore a node into its own subtree.");
        }
        else if (ctx.MembershipRole is null || !ctx.MembershipRole.Value.CanEdit())
        {
            throw new ForbiddenException("Only workspace editors can restore nodes to the root.");
        }

        var now = clock.UtcNow;
        var batch = node.DeletedAt!.Value;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Descendants trashed in the same batch carry exactly the same deleted_at; independently trashed ones stay in the trash.
        await db.Database.ExecuteSqlAsync($"""
            WITH RECURSIVE sub AS (
                SELECT id FROM nodes WHERE parent_id = {node.Id} AND workspace_id = {ctx.WorkspaceId} AND deleted_at = {batch}
                UNION ALL
                SELECT n.id FROM nodes n JOIN sub ON n.parent_id = sub.id WHERE n.workspace_id = {ctx.WorkspaceId} AND n.deleted_at = {batch}
            )
            UPDATE nodes SET deleted_at = NULL, updated_at = {now} WHERE id IN (SELECT id FROM sub)
            """, ct);

        node.DeletedAt = null;
        node.UpdatedAt = now;
        if (node.ParentId != target)
        {
            node.ParentId = target;
            node.Position = await NextPositionAsync(target, ct);
        }
        outbox.Enqueue(new NodeRestored(ctx.WorkspaceId, node.Id, node.ParentId, ctx.UserId));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        var dto = await tree.ToDtoAsync(node, ct) ?? NodeDto.From(node, null);
        await realtime.NodeRestoredAsync(ctx.WorkspaceId, dto with { EffectiveRole = null }, ct);
        await realtime.TrashChangedAsync(ctx.WorkspaceId, ct);
        return dto;
    }

    /// <summary>Permanently deletes a trashed node and its whole subtree.</summary>
    public async Task PurgeAsync(Guid id, CancellationToken ct)
    {
        var ctx = Ctx;
        var node = await Scoped.AsNoTracking().FirstOrDefaultAsync(n => n.Id == id && n.DeletedAt != null, ct) ?? throw new NotFoundException("Node not found in trash.");
        await RequireEditorAsync(node, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var ids = await tree.SubtreeIdsAsync(node.Id, ct);
        await TrashPurger.PurgeAsync(db, ctx.WorkspaceId, ids, ct);
        outbox.Enqueue(new NodePurged(ctx.WorkspaceId, node.Id, ids.ToArray(), ctx.UserId));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await realtime.TrashChangedAsync(ctx.WorkspaceId, ct);
    }

    /// <summary>Empties the trash: every trash root the caller may edit.</summary>
    public async Task<int> EmptyAsync(CancellationToken ct)
    {
        var ctx = Ctx;
        var roots = await TrashRoots.AsNoTracking().ToListAsync(ct);
        var editable = new List<Node>();
        foreach (var r in roots)
        {
            access.Remember(r);
            var role = await access.EffectiveRoleAsync(r, ct);
            if (role is not null && role.Value.CanEdit()) editable.Add(r);
        }
        if (editable.Count == 0) return 0;

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var purged = 0;
        foreach (var root in editable)
        {
            var ids = await tree.SubtreeIdsAsync(root.Id, ct);
            purged += await TrashPurger.PurgeAsync(db, ctx.WorkspaceId, ids, ct);
            outbox.Enqueue(new NodePurged(ctx.WorkspaceId, root.Id, ids.ToArray(), ctx.UserId));
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await realtime.TrashChangedAsync(ctx.WorkspaceId, ct);
        return purged;
    }

    // --- helpers ----------------------------------------------------------------------------------------------------

    private async Task RequireEditorAsync(Node node, CancellationToken ct)
    {
        access.Remember(node);
        var role = await access.EffectiveRoleAsync(node, ct) ?? throw new ForbiddenException("No access to this node.");
        if (!role.CanEdit()) throw new ForbiddenException("Insufficient role on this node.");
    }

    private async Task<string> NextPositionAsync(Guid? parentId, CancellationToken ct)
    {
        var last = await Scoped.AsNoTracking()
            .Where(n => n.ParentId == parentId && n.DeletedAt == null)
            .OrderByDescending(n => n.Position)
            .Select(n => n.Position)
            .FirstOrDefaultAsync(ct);
        return FractionalIndex.GenerateKeyBetween(FractionalIndex.IsValid(last) ? last : null, null);
    }
}

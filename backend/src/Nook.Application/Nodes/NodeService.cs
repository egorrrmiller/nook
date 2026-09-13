using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Domain.Ordering;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Nodes;

public sealed class NodeService(
    IAppDbContext db,
    IWorkspaceContextAccessor contextAccessor,
    NodeAccess access,
    IClock clock,
    IOutbox outbox,
    IRealtimeNotifier realtime)
{
    private WorkspaceContext Ctx => contextAccessor.Required;

    private IQueryable<Node> Scoped => db.Nodes.Where(n => n.WorkspaceId == Ctx.WorkspaceId);

    public async Task<IReadOnlyList<NodeDto>> ListAsync(Guid? parentId, NodeKind? kind, CancellationToken ct)
    {
        var ctx = Ctx;
        List<Node> nodes;
        if (parentId is Guid pid)
        {
            var parent = await Scoped.AsNoTracking().FirstOrDefaultAsync(n => n.Id == pid && n.DeletedAt == null, ct)
                         ?? throw new NotFoundException("Parent not found.");
            access.Remember(parent);
            var parentRole = await access.EffectiveRoleAsync(parent, ct) ?? throw new ForbiddenException("No access to the parent node.");
            var q = Scoped.AsNoTracking().Where(n => n.ParentId == pid && n.DeletedAt == null);
            if (kind is not null) q = q.Where(n => n.Kind == kind);
            nodes = await q.OrderBy(n => n.Position).ThenBy(n => n.CreatedAt).ToListAsync(ct);
            // Every child inherits at least the parent's role; no per-child lookup needed unless a share upgrades it.
            var result = new List<NodeDto>(nodes.Count);
            foreach (var n in nodes)
            {
                access.Remember(n);
                var role = ctx.Shares.TryGetValue(n.Id, out var own) ? parentRole.Max(own) : parentRole;
                result.Add(NodeDto.From(n, role));
            }
            return result;
        }

        if (ctx.IsMember)
        {
            var q = Scoped.AsNoTracking().Where(n => n.ParentId == null && n.DeletedAt == null);
            if (kind is not null) q = q.Where(n => n.Kind == kind);
            nodes = await q.OrderBy(n => n.Position).ThenBy(n => n.CreatedAt).ToListAsync(ct);
            var result = new List<NodeDto>(nodes.Count);
            foreach (var n in nodes)
            {
                access.Remember(n);
                result.Add(NodeDto.From(n, await access.EffectiveRoleAsync(n, ct)));
            }
            return result;
        }

        // Share-only caller: "roots" are the subtrees shared with them.
        var sharedIds = ctx.Shares.Keys.ToArray();
        var sharedQuery = Scoped.AsNoTracking().Where(n => sharedIds.Contains(n.Id) && n.DeletedAt == null);
        if (kind is not null) sharedQuery = sharedQuery.Where(n => n.Kind == kind);
        nodes = await sharedQuery.OrderBy(n => n.Title).ToListAsync(ct);
        var shared = new List<NodeDto>(nodes.Count);
        foreach (var n in nodes)
        {
            access.Remember(n);
            shared.Add(NodeDto.From(n, await access.EffectiveRoleAsync(n, ct)));
        }
        return shared;
    }

    public async Task<NodeDto> GetAsync(Guid id, CancellationToken ct)
    {
        var node = await Scoped.AsNoTracking().FirstOrDefaultAsync(n => n.Id == id && n.DeletedAt == null, ct)
                   ?? throw new NotFoundException("Node not found.");
        var role = await access.EffectiveRoleAsync(node, ct) ?? throw new ForbiddenException("No access to this node.");
        return NodeDto.From(node, role);
    }

    /// <summary>Loads a live node and asserts the caller holds at least <paramref name="minimum"/> on it.</summary>
    public async Task<(Node Node, WorkspaceRole Role)> RequireAsync(Guid id, WorkspaceRole minimum, CancellationToken ct, bool tracking = false)
    {
        var query = tracking ? Scoped : Scoped.AsNoTracking();
        var node = await query.FirstOrDefaultAsync(n => n.Id == id && n.DeletedAt == null, ct)
                   ?? throw new NotFoundException("Node not found.");
        var role = await access.EffectiveRoleAsync(node, ct) ?? throw new ForbiddenException("No access to this node.");
        if (role < minimum) throw new ForbiddenException("Insufficient role on this node.");
        return (node, role);
    }

    public async Task<NodeDto> CreateAsync(CreateNodeRequest request, CancellationToken ct)
    {
        var ctx = Ctx;
        var kind = request.Kind is null ? NodeKind.Page : NodeKindExtensions.ParseWire(request.Kind) ?? throw new ValidationException("Invalid kind.");
        var title = (request.Title ?? "").Trim();
        if (title.Length > 1000) throw new ValidationException("Title is too long (max 1000 chars).");

        if (request.ParentId is Guid parentId)
        {
            await RequireAsync(parentId, WorkspaceRole.Editor, ct);
        }
        else if (ctx.MembershipRole is null || !ctx.MembershipRole.Value.CanEdit())
        {
            throw new ForbiddenException("Only workspace editors can create root nodes.");
        }

        var now = clock.UtcNow;
        var node = new Node
        {
            WorkspaceId = ctx.WorkspaceId,
            ParentId = request.ParentId,
            Kind = kind,
            Title = title,
            Icon = request.Icon,
            Position = await NextPositionAsync(request.ParentId, ct),
            PageSettings = kind == NodeKind.Page ? Domain.ValueObjects.PageSettings.Default : null,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Nodes.Add(node);
        outbox.Enqueue(new NodeCreated(ctx.WorkspaceId, node.Id, node.ParentId, kind.ToWire(), ctx.UserId));
        await db.SaveChangesAsync(ct);

        access.Remember(node);
        var dto = NodeDto.From(node, await access.EffectiveRoleAsync(node, ct));
        await realtime.NodeChangedAsync(ctx.WorkspaceId, dto with { EffectiveRole = null }, ct);
        return dto;
    }

    public async Task<NodeDto> PatchAsync(Guid id, PatchNodeRequest request, CancellationToken ct)
    {
        var ctx = Ctx;
        var (node, role) = await RequireAsync(id, WorkspaceRole.Editor, ct, tracking: true);
        var changed = new List<string>();
        var moved = false;
        var oldParent = node.ParentId;

        if (request.Title is not null)
        {
            var title = request.Title.Trim();
            if (title.Length > 1000) throw new ValidationException("Title is too long (max 1000 chars).");
            if (title != node.Title) { node.Title = title; changed.Add("title"); }
        }
        if (request.Icon.HasValue) { node.Icon = request.Icon.Value; changed.Add("icon"); }
        if (request.Cover.HasValue) { node.Cover = request.Cover.Value; changed.Add("cover"); }
        if (request.PageSettings is not null) { node.PageSettings = request.PageSettings; changed.Add("pageSettings"); }

        if (request.ParentId.HasValue && request.ParentId.Value != node.ParentId)
        {
            var newParentId = request.ParentId.Value;
            if (newParentId == node.Id) throw new ValidationException("A node cannot be its own parent.");
            if (newParentId is Guid np)
            {
                var (parent, _) = await RequireAsync(np, WorkspaceRole.Editor, ct);
                var ancestors = await access.AncestorIdsAsync(parent.ParentId, ct);
                if (ancestors.Contains(node.Id)) throw new ValidationException("Cannot move a node into its own subtree.");
            }
            else if (ctx.MembershipRole is null || !ctx.MembershipRole.Value.CanEdit())
            {
                throw new ForbiddenException("Only workspace editors can move nodes to the root.");
            }
            node.ParentId = newParentId;
            node.Position = ValidPositionOrNull(request.Position) ?? await NextPositionAsync(newParentId, ct);
            moved = true;
        }
        else if (request.Position is not null)
        {
            node.Position = ValidPositionOrNull(request.Position) ?? throw new ValidationException("Invalid position key.");
            moved = true;
        }

        if (changed.Count == 0 && !moved) return NodeDto.From(node, role);

        node.UpdatedAt = clock.UtcNow;
        if (changed.Count > 0) outbox.Enqueue(new NodeUpdated(ctx.WorkspaceId, node.Id, changed.ToArray(), ctx.UserId));
        if (moved) outbox.Enqueue(new NodeMoved(ctx.WorkspaceId, node.Id, oldParent, node.ParentId, node.Position, ctx.UserId));
        await db.SaveChangesAsync(ct);

        access.Remember(node);
        var dto = NodeDto.From(node, await access.EffectiveRoleAsync(node, ct));
        if (changed.Count > 0) await realtime.NodeChangedAsync(ctx.WorkspaceId, dto with { EffectiveRole = null }, ct);
        if (moved) await realtime.NodeMovedAsync(ctx.WorkspaceId, node.Id, node.ParentId, node.Position, ct);
        return dto;
    }

    /// <summary>Soft-deletes the node and its whole subtree (sets <c>deleted_at</c>).</summary>
    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        var ctx = Ctx;
        var (node, _) = await RequireAsync(id, WorkspaceRole.Editor, ct);
        var now = clock.UtcNow;
        await db.Database.ExecuteSqlAsync($"""
            WITH RECURSIVE sub AS (
                SELECT id FROM nodes WHERE id = {node.Id} AND workspace_id = {ctx.WorkspaceId}
                UNION ALL
                SELECT n.id FROM nodes n JOIN sub ON n.parent_id = sub.id WHERE n.workspace_id = {ctx.WorkspaceId}
            )
            UPDATE nodes SET deleted_at = {now}, updated_at = {now}
            WHERE id IN (SELECT id FROM sub) AND deleted_at IS NULL
            """, ct);
        outbox.Enqueue(new NodeDeleted(ctx.WorkspaceId, node.Id, ctx.UserId));
        await db.SaveChangesAsync(ct);
        await realtime.NodeDeletedAsync(ctx.WorkspaceId, node.Id, ct);
    }

    // --- shares -----------------------------------------------------------------------------------------------------

    public async Task<IReadOnlyList<NodeShareDto>> ListSharesAsync(Guid nodeId, CancellationToken ct)
    {
        await RequireAsync(nodeId, WorkspaceRole.Editor, ct);
        return await db.NodeShares.AsNoTracking()
            .Where(s => s.NodeId == nodeId)
            .OrderBy(s => s.CreatedAt)
            .Select(s => new NodeShareDto(s.NodeId, s.UserId, s.User!.Email, s.User.DisplayName, s.Role.ToWire(), s.CreatedAt))
            .ToListAsync(ct);
    }

    public async Task<NodeShareDto> ShareAsync(Guid nodeId, CreateNodeShareRequest request, CancellationToken ct)
    {
        var ctx = Ctx;
        var (_, callerRole) = await RequireAsync(nodeId, WorkspaceRole.Editor, ct);
        var role = WorkspaceRoleExtensions.ParseWire(request.Role) ?? throw new ValidationException("role must be editor|viewer.");
        if (role == WorkspaceRole.Owner) throw new ValidationException("Shares can only grant editor or viewer.");
        if (role > callerRole) throw new ForbiddenException("Cannot grant a higher role than your own.");

        var email = WorkspaceService.NormalizeEmail(request.Email);
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email == email, ct) ?? throw new NotFoundException("No user with that email.");
        if (user.Id == ctx.UserId) throw new ValidationException("Cannot share with yourself.");

        var share = await db.NodeShares.FirstOrDefaultAsync(s => s.NodeId == nodeId && s.UserId == user.Id, ct);
        if (share is null)
        {
            share = new NodeShare { NodeId = nodeId, UserId = user.Id, Role = role, CreatedByUserId = ctx.UserId, CreatedAt = clock.UtcNow };
            db.NodeShares.Add(share);
        }
        else
        {
            share.Role = role;
        }
        await db.SaveChangesAsync(ct);
        return new NodeShareDto(nodeId, user.Id, user.Email, user.DisplayName, role.ToWire(), share.CreatedAt);
    }

    public async Task UnshareAsync(Guid nodeId, Guid userId, CancellationToken ct)
    {
        await RequireAsync(nodeId, WorkspaceRole.Editor, ct);
        var share = await db.NodeShares.FirstOrDefaultAsync(s => s.NodeId == nodeId && s.UserId == userId, ct)
                    ?? throw new NotFoundException("Share not found.");
        db.NodeShares.Remove(share);
        await db.SaveChangesAsync(ct);
    }

    // --- helpers ----------------------------------------------------------------------------------------------------

    private async Task<string> NextPositionAsync(Guid? parentId, CancellationToken ct)
    {
        var last = await Scoped.AsNoTracking()
            .Where(n => n.ParentId == parentId && n.DeletedAt == null)
            .OrderByDescending(n => n.Position)
            .Select(n => n.Position)
            .FirstOrDefaultAsync(ct);
        return FractionalIndex.GenerateKeyBetween(FractionalIndex.IsValid(last) ? last : null, null);
    }

    private static string? ValidPositionOrNull(string? position) =>
        position is not null && FractionalIndex.IsValid(position) ? position : null;
}

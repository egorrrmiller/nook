using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;

namespace Nook.Application.Nodes;

/// <summary>
/// Read helpers shared by the tree slices: batched <c>hasChildren</c>, breadcrumbs (root → parent) and subtree ids —
/// each a single round-trip regardless of how many nodes are asked about. Everything is scoped to the current workspace.
/// </summary>
public sealed class TreeQueries(IAppDbContext db, IWorkspaceContextAccessor contextAccessor, NodeAccess access)
{
    private const int MaxDepth = 500;

    private WorkspaceContext Ctx => contextAccessor.Required;

    // --- Node → NodeDto with effectiveRole + hasChildren ------------------------------------------------------------

    /// <summary>DTOs for many nodes (one grouped <c>hasChildren</c> query); nodes the caller cannot see are left out.</summary>
    public async Task<Dictionary<Guid, NodeDto>> ToDtosAsync(IReadOnlyCollection<Node> nodes, CancellationToken ct)
    {
        var withChildren = await WithLiveChildrenAsync(nodes.Select(n => n.Id).Distinct().ToList(), ct);
        var result = new Dictionary<Guid, NodeDto>(nodes.Count);
        foreach (var n in nodes)
        {
            if (result.ContainsKey(n.Id)) continue;
            access.Remember(n);
            var role = await access.EffectiveRoleAsync(n, ct);
            if (role is null) continue;
            result[n.Id] = NodeDto.From(n, role, withChildren.Contains(n.Id));
        }
        return result;
    }

    /// <summary>DTO for one node, or <c>null</c> when the caller has no access.</summary>
    public async Task<NodeDto?> ToDtoAsync(Node node, CancellationToken ct)
    {
        access.Remember(node);
        var role = await access.EffectiveRoleAsync(node, ct);
        if (role is null) return null;
        return NodeDto.From(node, role, await HasLiveChildrenAsync(node.Id, ct));
    }

    // --- hasChildren ------------------------------------------------------------------------------------------------

    /// <summary>Ids (among <paramref name="ids"/>) that have at least one live child — one grouped query.</summary>
    public async Task<HashSet<Guid>> WithLiveChildrenAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct)
    {
        if (ids.Count == 0) return [];
        var ws = Ctx.WorkspaceId;
        var idArray = ids.ToArray();
        var parents = await db.Nodes.AsNoTracking()
            .Where(n => n.WorkspaceId == ws && n.DeletedAt == null && n.ParentId != null && idArray.Contains(n.ParentId!.Value))
            .GroupBy(n => n.ParentId!.Value)
            .Select(g => g.Key)
            .ToListAsync(ct);
        return [.. parents];
    }

    public async Task<bool> HasLiveChildrenAsync(Guid id, CancellationToken ct)
    {
        var ws = Ctx.WorkspaceId;
        return await db.Nodes.AsNoTracking().AnyAsync(n => n.WorkspaceId == ws && n.ParentId == id && n.DeletedAt == null, ct);
    }

    // --- subtree ------------------------------------------------------------------------------------------------------

    /// <summary>The root and all its descendants (deleted ones included), parents before children.</summary>
    public Task<IReadOnlyList<Guid>> SubtreeIdsAsync(Guid rootId, CancellationToken ct) => SubtreeIdsAsync(db, Ctx.WorkspaceId, [rootId], ct);

    /// <summary>Context-free variant (background jobs): all nodes under any of <paramref name="rootIds"/>, parents before children.</summary>
    public static async Task<IReadOnlyList<Guid>> SubtreeIdsAsync(IAppDbContext db, Guid workspaceId, Guid[] rootIds, CancellationToken ct)
    {
        if (rootIds.Length == 0) return [];
        var rows = await db.Database.SqlQuery<SubtreeRow>($"""
            WITH RECURSIVE sub AS (
                SELECT n.id, 0 AS depth FROM nodes n WHERE n.id = ANY({rootIds}) AND n.workspace_id = {workspaceId}
                UNION ALL
                SELECT n.id, sub.depth + 1 FROM nodes n JOIN sub ON n.parent_id = sub.id
                WHERE n.workspace_id = {workspaceId} AND sub.depth < {MaxDepth}
            )
            SELECT sub.id AS node, sub.depth AS depth FROM sub
            """).ToListAsync(ct);
        return rows.OrderBy(r => r.Depth).Select(r => r.Node).Distinct().ToList();
    }

    // --- breadcrumbs ----------------------------------------------------------------------------------------------------

    /// <summary>Ancestors of the node whose parent is <paramref name="parentId"/>, root first; trimmed to what the caller may see.</summary>
    public async Task<IReadOnlyList<NodeSummary>> BreadcrumbAsync(Guid nodeId, Guid? parentId, CancellationToken ct)
    {
        if (parentId is null) return [];
        var map = await BreadcrumbsAsync([(nodeId, parentId)], ct);
        return map.TryGetValue(nodeId, out var crumbs) ? crumbs : [];
    }

    /// <summary>Breadcrumbs for many nodes in two round-trips (one recursive CTE + one node load).</summary>
    public async Task<Dictionary<Guid, IReadOnlyList<NodeSummary>>> BreadcrumbsAsync(
        IReadOnlyCollection<(Guid Id, Guid? ParentId)> nodes, CancellationToken ct)
    {
        var result = new Dictionary<Guid, IReadOnlyList<NodeSummary>>();
        var starts = nodes.Where(n => n.ParentId is not null).Select(n => n.Id).Distinct().ToArray();
        foreach (var (id, _) in nodes) result[id] = [];
        if (starts.Length == 0) return result;

        var ws = Ctx.WorkspaceId;
        var rows = await db.Database.SqlQuery<AncestorRow>($"""
            WITH RECURSIVE chain AS (
                SELECT n.id AS start, n.parent_id AS ancestor, 1 AS depth
                FROM nodes n WHERE n.workspace_id = {ws} AND n.id = ANY({starts}) AND n.parent_id IS NOT NULL
                UNION ALL
                SELECT chain.start, p.parent_id, chain.depth + 1
                FROM chain JOIN nodes p ON p.id = chain.ancestor
                WHERE p.workspace_id = {ws} AND p.parent_id IS NOT NULL AND chain.depth < {MaxDepth}
            )
            SELECT chain.start AS start, chain.ancestor AS ancestor, chain.depth AS depth FROM chain
            """).ToListAsync(ct);
        if (rows.Count == 0) return result;

        var ancestorIds = rows.Select(r => r.Ancestor).Distinct().ToArray();
        var summaries = await db.Nodes.AsNoTracking()
            .Where(n => n.WorkspaceId == ws && ancestorIds.Contains(n.Id))
            .Select(n => new NodeSummary(n.Id, n.Title, n.Icon, n.Kind.ToWire(), n.ParentId))
            .ToDictionaryAsync(s => s.Id, ct);

        var ctx = Ctx;
        foreach (var group in rows.GroupBy(r => r.Start))
        {
            // depth 1 = parent … deepest = root; the contract wants root → parent.
            var chain = group.OrderByDescending(r => r.Depth)
                .Select(r => summaries.GetValueOrDefault(r.Ancestor))
                .Where(s => s is not null)
                .Select(s => s!)
                .ToList();
            result[group.Key] = TrimToVisible(chain, ctx);
        }
        return result;
    }

    /// <summary>Share-only callers only see the chain from the topmost shared ancestor downwards.</summary>
    private static IReadOnlyList<NodeSummary> TrimToVisible(List<NodeSummary> chain, WorkspaceContext ctx)
    {
        if (ctx.IsMember) return chain;
        var first = chain.FindIndex(s => ctx.Shares.ContainsKey(s.Id));
        return first < 0 ? [] : chain.Skip(first).ToList();
    }

    private sealed class SubtreeRow
    {
        [Column("node")] public Guid Node { get; set; }
        [Column("depth")] public int Depth { get; set; }
    }

    private sealed class AncestorRow
    {
        [Column("start")] public Guid Start { get; set; }
        [Column("ancestor")] public Guid Ancestor { get; set; }
        [Column("depth")] public int Depth { get; set; }
    }
}

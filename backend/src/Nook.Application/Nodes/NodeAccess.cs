using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;

namespace Nook.Application.Nodes;

/// <summary>
/// Computes the caller's effective role on a node: max(workspace membership role, node shares on the node and on any ancestor).
/// Ancestor lookups are memoised per request (scoped service).
/// </summary>
public sealed class NodeAccess(IAppDbContext db, IWorkspaceContextAccessor contextAccessor)
{
    private readonly Dictionary<Guid, Guid?> _parentCache = new();

    public WorkspaceContext Context => contextAccessor.Required;

    public async Task<WorkspaceRole?> EffectiveRoleAsync(Node node, CancellationToken ct)
    {
        _parentCache[node.Id] = node.ParentId;
        return await EffectiveRoleAsync(node.Id, node.ParentId, ct);
    }

    public async Task<WorkspaceRole?> EffectiveRoleAsync(Guid nodeId, Guid? parentId, CancellationToken ct)
    {
        var ctx = Context;
        WorkspaceRole? role = ctx.MembershipRole;
        if (role == WorkspaceRole.Owner || ctx.Shares.Count == 0) return role;

        if (ctx.Shares.TryGetValue(nodeId, out var own)) role = role.Max(own);

        var chain = await AncestorIdsAsync(parentId, ct);
        foreach (var ancestor in chain)
        {
            if (ctx.Shares.TryGetValue(ancestor, out var shared)) role = role.Max(shared);
        }
        return role;
    }

    /// <summary>Ids of all ancestors starting at <paramref name="parentId"/> going up to the root.</summary>
    public async Task<IReadOnlyList<Guid>> AncestorIdsAsync(Guid? parentId, CancellationToken ct)
    {
        var result = new List<Guid>();
        var seen = new HashSet<Guid>();
        var current = parentId;
        while (current is Guid id && seen.Add(id))
        {
            result.Add(id);
            current = await ParentOfAsync(id, ct);
        }
        return result;
    }

    public async Task<Guid?> ParentOfAsync(Guid nodeId, CancellationToken ct)
    {
        if (_parentCache.TryGetValue(nodeId, out var cached)) return cached;
        var row = await db.Nodes.AsNoTracking()
            .Where(n => n.Id == nodeId && n.WorkspaceId == Context.WorkspaceId)
            .Select(n => new { n.ParentId })
            .FirstOrDefaultAsync(ct);
        var parent = row?.ParentId;
        _parentCache[nodeId] = parent;
        return parent;
    }

    public void Remember(Node node) => _parentCache[node.Id] = node.ParentId;
}

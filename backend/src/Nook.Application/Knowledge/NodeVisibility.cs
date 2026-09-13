using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Workspaces;

namespace Nook.Application.Knowledge;

/// <summary>
/// Which nodes of the current workspace the caller may see (contracts §9.5 "share-only users see only shared subtrees").
/// Members see every node; a share-only caller sees the union of the subtrees rooted at their shares.
/// </summary>
public sealed class NodeVisibility(IAppDbContext db, IWorkspaceContextAccessor contextAccessor)
{
    private IReadOnlyCollection<Guid>? _cached;
    private bool _resolved;

    /// <summary><c>null</c> = unrestricted (workspace member); otherwise the exact set of visible node ids (live and trashed alike).</summary>
    public async Task<IReadOnlyCollection<Guid>?> VisibleIdsAsync(CancellationToken ct)
    {
        if (_resolved) return _cached;
        var ctx = contextAccessor.Required;
        if (ctx.IsMember)
        {
            _resolved = true;
            return null;
        }
        var roots = ctx.Shares.Keys.ToArray();
        var ids = roots.Length == 0
            ? []
            : await db.Database.SqlQuery<Guid>($"""
                WITH RECURSIVE vis AS (
                    SELECT id FROM nodes WHERE id = ANY({roots}) AND workspace_id = {ctx.WorkspaceId}
                    UNION
                    SELECT n.id FROM nodes n JOIN vis ON n.parent_id = vis.id WHERE n.workspace_id = {ctx.WorkspaceId}
                )
                SELECT id AS "Value" FROM vis
                """).ToListAsync(ct);
        _cached = ids.ToHashSet();
        _resolved = true;
        return _cached;
    }

    /// <summary>Ids of the subtree rooted at <paramref name="rootId"/> (root included), workspace-scoped.</summary>
    public async Task<HashSet<Guid>> SubtreeIdsAsync(Guid rootId, CancellationToken ct)
    {
        var ws = contextAccessor.Required.WorkspaceId;
        var ids = await db.Database.SqlQuery<Guid>($"""
            WITH RECURSIVE sub AS (
                SELECT id FROM nodes WHERE id = {rootId} AND workspace_id = {ws}
                UNION
                SELECT n.id FROM nodes n JOIN sub ON n.parent_id = sub.id WHERE n.workspace_id = {ws}
            )
            SELECT id AS "Value" FROM sub
            """).ToListAsync(ct);
        return ids.ToHashSet();
    }
}

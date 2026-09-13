using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;

namespace Nook.Application.Trash;

/// <summary>
/// Permanent deletion of node subtrees (contracts §7.2): nodes, documents, document_updates, blocks, links, page_snapshots,
/// attachment rows, favorites/recents, node_tags and aliases. Blobs are left for the §8 <c>blob-gc</c> job.
/// Context-free so both the API and the retention job can use it; callers pass the workspace explicitly.
/// </summary>
public static class TrashPurger
{
    /// <summary>Deletes every row belonging to <paramref name="nodeIds"/> (all must be in <paramref name="workspaceId"/>). Returns the number of nodes removed.</summary>
    public static async Task<int> PurgeAsync(IAppDbContext db, Guid workspaceId, IReadOnlyList<Guid> nodeIds, CancellationToken ct)
    {
        if (nodeIds.Count == 0) return 0;
        var ids = nodeIds.ToArray();
        await db.Database.ExecuteSqlAsync($"DELETE FROM favorites WHERE node_id = ANY({ids})", ct);
        await db.Database.ExecuteSqlAsync($"DELETE FROM recents WHERE node_id = ANY({ids})", ct);
        await db.Database.ExecuteSqlAsync($"DELETE FROM node_tags WHERE node_id = ANY({ids})", ct);
        await db.Database.ExecuteSqlAsync($"DELETE FROM aliases WHERE node_id = ANY({ids})", ct);
        await db.Database.ExecuteSqlAsync($"DELETE FROM attachments WHERE node_id = ANY({ids})", ct);
        await db.Database.ExecuteSqlAsync($"DELETE FROM links WHERE source_node_id = ANY({ids})", ct);
        await db.Database.ExecuteSqlAsync($"DELETE FROM blocks WHERE node_id = ANY({ids})", ct);
        await db.Database.ExecuteSqlAsync($"DELETE FROM page_snapshots WHERE node_id = ANY({ids})", ct);
        await db.Database.ExecuteSqlAsync($"DELETE FROM document_updates WHERE node_id = ANY({ids})", ct);
        await db.Database.ExecuteSqlAsync($"DELETE FROM documents WHERE node_id = ANY({ids})", ct);
        await db.Database.ExecuteSqlAsync($"DELETE FROM node_shares WHERE node_id = ANY({ids})", ct);
        // One statement for the whole subtree: the self-referencing FK is checked at statement end, so parents and children can go together.
        return await db.Database.ExecuteSqlAsync($"DELETE FROM nodes WHERE workspace_id = {workspaceId} AND id = ANY({ids})", ct);
    }
}

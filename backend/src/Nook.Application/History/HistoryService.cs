using Microsoft.EntityFrameworkCore;
using Nook.Application.Collab;
using Nook.Application.Common;
using Nook.Application.Documents;
using Nook.Application.Knowledge;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.History;

/// <summary>Contracts §9.7: page snapshots (list/get/manual/restore) and block reads from the projection.</summary>
public sealed class HistoryService(
    IAppDbContext db,
    IWorkspaceContextAccessor contextAccessor,
    NodeService nodes,
    DocumentStoreService documents,
    ICollabClient collab,
    BreadcrumbService breadcrumbs,
    IOutbox outbox,
    IRealtimeNotifier realtime,
    IClock clock)
{
    public async Task<VersionListResponse> ListAsync(Guid nodeId, int? limit, string? cursor, CancellationToken ct)
    {
        await nodes.RequireAsync(nodeId, WorkspaceRole.Viewer, ct);
        var take = Math.Clamp(limit ?? 50, 1, 200);
        var q = db.PageSnapshots.AsNoTracking().Where(s => s.NodeId == nodeId);
        if (Cursor.DecodeKeyset(cursor) is { } key)
            q = q.Where(s => s.TakenAt < key.At || (s.TakenAt == key.At && s.Id.CompareTo(key.Id) < 0));
        var rows = await q.OrderByDescending(s => s.TakenAt).ThenByDescending(s => s.Id)
            .Take(take + 1)
            .Select(s => new { s.Id, s.Version, s.TakenAt, s.UserId, s.Title, s.BlockCount, s.Kind })
            .ToListAsync(ct);
        var hasMore = rows.Count > take;
        if (hasMore) rows.RemoveAt(rows.Count - 1);

        var users = await UsersAsync(rows.Select(r => r.UserId), ct);
        var items = rows.Select(r => new VersionDto(r.Id, r.Version, r.TakenAt, r.UserId is { } u ? users.GetValueOrDefault(u) : null, r.Title, r.BlockCount, r.Kind.ToWire())).ToList();
        return new VersionListResponse(items, hasMore && rows.Count > 0 ? Cursor.EncodeKeyset(rows[^1].TakenAt, rows[^1].Id) : null);
    }

    public async Task<VersionContentResponse> GetAsync(Guid nodeId, Guid versionId, CancellationToken ct)
    {
        await nodes.RequireAsync(nodeId, WorkspaceRole.Viewer, ct);
        var snap = await db.PageSnapshots.AsNoTracking().FirstOrDefaultAsync(s => s.Id == versionId && s.NodeId == nodeId, ct) ?? throw new NotFoundException("Version not found.");
        var users = await UsersAsync([snap.UserId], ct);
        return new VersionContentResponse(snap.Title, snap.Blocks, snap.TakenAt, snap.UserId is { } u ? users.GetValueOrDefault(u) : null);
    }

    /// <summary>Manual "Save version": snapshot of the current projection.</summary>
    public async Task<VersionDto> CreateManualAsync(Guid nodeId, CancellationToken ct)
    {
        var ctx = contextAccessor.Required;
        var (node, _) = await nodes.RequireAsync(nodeId, WorkspaceRole.Editor, ct);
        var snap = await SnapshotCurrentAsync(node, SnapshotKind.Manual, ctx.UserId, ct);
        await db.SaveChangesAsync(ct);
        await realtime.HistoryChangedAsync(ctx.WorkspaceId, nodeId, ct);
        var users = await UsersAsync([snap.UserId], ct);
        return new VersionDto(snap.Id, snap.Version, snap.TakenAt, snap.UserId is { } u ? users.GetValueOrDefault(u) : null, snap.Title, snap.BlockCount, snap.Kind.ToWire());
    }

    /// <summary>Snapshots the current state (<c>pre-restore</c>), then replaces the live document through the collab service.</summary>
    public async Task<RestoreResponse> RestoreAsync(Guid nodeId, Guid versionId, CancellationToken ct)
    {
        var ctx = contextAccessor.Required;
        var (node, _) = await nodes.RequireAsync(nodeId, WorkspaceRole.Editor, ct, tracking: true);
        var snap = await db.PageSnapshots.AsNoTracking().FirstOrDefaultAsync(s => s.Id == versionId && s.NodeId == nodeId, ct) ?? throw new NotFoundException("Version not found.");

        var pre = await SnapshotCurrentAsync(node, SnapshotKind.PreRestore, ctx.UserId, ct);
        outbox.Enqueue(new VersionRestored(ctx.WorkspaceId, nodeId, snap.Id, snap.Version, ctx.UserId));
        await db.SaveChangesAsync(ct);

        await collab.ImportAsync(nodeId, snap.Title, snap.Blocks, ctx.UserId, ct);
        // Keep the projection in step right away (the collab flush that follows stores the same content).
        await documents.ProjectServerSideAsync(node, snap.Title, snap.Blocks, ctx.UserId, ct);

        await realtime.HistoryChangedAsync(ctx.WorkspaceId, nodeId, ct);
        await realtime.DocumentChangedAsync(ctx.WorkspaceId, nodeId, pre.Version, ct);
        return new RestoreResponse(pre.Version);
    }

    public async Task<NodeBlocksResponse> BlocksAsync(Guid nodeId, CancellationToken ct)
    {
        var (node, _) = await nodes.RequireAsync(nodeId, WorkspaceRole.Viewer, ct);
        var rows = await db.Blocks.AsNoTracking().Where(b => b.NodeId == nodeId).ToListAsync(ct);
        var version = await db.Documents.AsNoTracking().Where(d => d.NodeId == nodeId).Select(d => (int?)d.Version).FirstOrDefaultAsync(ct) ?? 0;
        return new NodeBlocksResponse(node.Title, BlockTreeBuilder.Build(rows), version);
    }

    public async Task<BlockAnchorResponse> BlockAsync(Guid blockId, CancellationToken ct)
    {
        var ws = contextAccessor.Required.WorkspaceId;
        var block = await db.Blocks.AsNoTracking().FirstOrDefaultAsync(b => b.Id == blockId, ct) ?? throw new NotFoundException("Block not found.");
        var (node, _) = await nodes.RequireAsync(block.NodeId, WorkspaceRole.Viewer, ct);
        if (node.WorkspaceId != ws) throw new NotFoundException("Block not found.");
        var rows = await db.Blocks.AsNoTracking().Where(b => b.NodeId == block.NodeId).ToListAsync(ct);
        var descendants = Descendants(rows, blockId);
        var crumb = await breadcrumbs.ForNodeAsync(node.Id, ct);
        var breadcrumb = crumb.Append(NodeSummaryDto.From(node)).ToList();
        return new BlockAnchorResponse(node.Id, BlockTreeBuilder.BuildSingle(block, descendants), breadcrumb);
    }

    // --- helpers ------------------------------------------------------------------------------------------------------

    private async Task<PageSnapshot> SnapshotCurrentAsync(Node node, SnapshotKind kind, Guid? userId, CancellationToken ct)
    {
        var rows = await db.Blocks.AsNoTracking().Where(b => b.NodeId == node.Id).ToListAsync(ct);
        var version = await db.Documents.AsNoTracking().Where(d => d.NodeId == node.Id).Select(d => (int?)d.Version).FirstOrDefaultAsync(ct) ?? 0;
        var snap = DocumentStoreService.NewSnapshot(node.Id, version, node.Title, BlockTreeBuilder.Build(rows), userId, kind, clock.UtcNow);
        db.PageSnapshots.Add(snap);
        return snap;
    }

    private static List<Block> Descendants(List<Block> rows, Guid rootId)
    {
        var byParent = rows.Where(b => b.ParentBlockId is not null).GroupBy(b => b.ParentBlockId!.Value).ToDictionary(g => g.Key, g => g.ToList());
        var result = new List<Block>();
        var stack = new Stack<Guid>();
        stack.Push(rootId);
        var seen = new HashSet<Guid>();
        while (stack.Count > 0)
        {
            var id = stack.Pop();
            if (!byParent.TryGetValue(id, out var children)) continue;
            foreach (var c in children)
            {
                if (!seen.Add(c.Id)) continue;
                result.Add(c);
                stack.Push(c.Id);
            }
        }
        return result;
    }

    private async Task<Dictionary<Guid, VersionUserDto>> UsersAsync(IEnumerable<Guid?> ids, CancellationToken ct)
    {
        var wanted = ids.OfType<Guid>().Distinct().ToArray();
        if (wanted.Length == 0) return [];
        return await db.Users.AsNoTracking().Where(u => wanted.Contains(u.Id)).Select(u => new VersionUserDto(u.Id, u.DisplayName)).ToDictionaryAsync(u => u.Id, ct);
    }
}

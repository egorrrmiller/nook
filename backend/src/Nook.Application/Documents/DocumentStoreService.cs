using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Knowledge;
using Nook.Application.Tags;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Plugins.Sdk;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Documents;

/// <summary>Internal document persistence used by the collab service (contracts §3, "Internal API") plus the derived projections (§9).</summary>
public sealed class DocumentStoreService(
    IAppDbContext db,
    IClock clock,
    IOutbox outbox,
    IRealtimeNotifier realtime,
    IEnumerable<IBlockTypeDefinition> blockTypes)
{
    public const int SnapshotEvery = 25;
    public static readonly TimeSpan SnapshotInterval = TimeSpan.FromMinutes(10);

    public async Task<InternalDocumentResponse> GetAsync(Guid nodeId, CancellationToken ct)
    {
        if (!await db.Nodes.AsNoTracking().AnyAsync(n => n.Id == nodeId, ct)) throw new NotFoundException("Node not found.");
        var doc = await db.Documents.AsNoTracking().FirstOrDefaultAsync(d => d.NodeId == nodeId, ct);
        return doc is null || doc.Ydoc.Length == 0
            ? new InternalDocumentResponse(null, doc?.Version ?? 0)
            : new InternalDocumentResponse(Convert.ToBase64String(doc.Ydoc), doc.Version);
    }

    public async Task<InternalDocumentPutResponse> PutAsync(Guid nodeId, InternalDocumentPutRequest request, CancellationToken ct)
    {
        byte[] ydoc;
        try { ydoc = Convert.FromBase64String(request.Ydoc ?? ""); }
        catch (FormatException) { throw new ValidationException("ydoc must be base64."); }

        var node = await db.Nodes.FirstOrDefaultAsync(n => n.Id == nodeId, ct) ?? throw new NotFoundException("Node not found.");
        var userIds = (request.UserIds ?? []).Select(s => Guid.TryParse(s, out var g) ? g : (Guid?)null).OfType<Guid>().Distinct().ToArray();
        var now = clock.UtcNow;
        var titleChanged = false;
        int newVersion;
        ProjectionChanges changes;
        var snapshotTaken = false;

        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            var doc = await db.Documents.FirstOrDefaultAsync(d => d.NodeId == nodeId, ct);
            var stored = doc?.Version ?? 0;
            if (request.Version < stored)
                throw new ConflictException($"Stale version {request.Version}; stored version is {stored}.") { Extensions = new Dictionary<string, object?> { ["version"] = stored } };

            newVersion = stored + 1;
            if (doc is null)
            {
                doc = new Document { NodeId = nodeId };
                db.Documents.Add(doc);
            }
            doc.Ydoc = ydoc;
            doc.Version = newVersion;
            doc.UpdatedAt = now;

            if (request.Updates is { Length: > 0 })
            {
                var lastSeq = await db.DocumentUpdates.Where(u => u.NodeId == nodeId).Select(u => (long?)u.Seq).MaxAsync(ct) ?? 0;
                var author = userIds.Length == 1 ? userIds[0] : (Guid?)null;
                foreach (var update in request.Updates)
                {
                    byte[] bytes;
                    try { bytes = Convert.FromBase64String(update); }
                    catch (FormatException) { throw new ValidationException("updates must be base64."); }
                    db.DocumentUpdates.Add(new DocumentUpdate { NodeId = nodeId, Seq = ++lastSeq, Update = bytes, UserId = author, At = now });
                }
            }

            if (request.Title is not null)
            {
                var title = request.Title.Trim();
                if (title.Length > 1000) title = title[..1000];
                if (title != node.Title)
                {
                    node.Title = title;
                    node.UpdatedAt = now;
                    titleChanged = true;
                }
            }

            changes = await ProjectAsync(node, request.Blocks, now, ct);

            // Automatic snapshots (§9.7): every 25 stores, or at most once per 10 minutes of activity — whichever comes first.
            if (request.Blocks.ValueKind == JsonValueKind.Array)
            {
                var lastSnapshot = await db.PageSnapshots.Where(s => s.NodeId == nodeId).Select(s => (DateTimeOffset?)s.TakenAt).MaxAsync(ct);
                if (newVersion % SnapshotEvery == 0 || lastSnapshot is null || now - lastSnapshot.Value >= SnapshotInterval)
                {
                    db.PageSnapshots.Add(NewSnapshot(nodeId, newVersion, node.Title, request.Blocks, userIds.Length == 1 ? userIds[0] : null, SnapshotKind.Auto, now));
                    snapshotTaken = true;
                }
            }

            outbox.Enqueue(new DocumentChanged(node.WorkspaceId, nodeId, newVersion, userIds));
            if (changes.TagsChanged) outbox.Enqueue(new TagsChanged(node.WorkspaceId, nodeId, changes.Tags.Select(t => t.Id).ToArray(), userIds.Length == 1 ? userIds[0] : null));
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }

        await realtime.DocumentChangedAsync(node.WorkspaceId, nodeId, newVersion, ct);
        if (titleChanged) await realtime.NodeChangedAsync(node.WorkspaceId, NodeDto.From(node, null), ct);
        await NotifyProjectionAsync(node.WorkspaceId, nodeId, changes, ct);
        if (snapshotTaken) await realtime.HistoryChangedAsync(node.WorkspaceId, nodeId, ct);
        return new InternalDocumentPutResponse(newVersion);
    }

    /// <summary>
    /// Rebuilds the derived projections for a document the backend itself produced (import, restore) without touching
    /// the stored ydoc/version — the collab service stores the same content on its next flush and the diff is a no-op.
    /// </summary>
    public async Task ProjectServerSideAsync(Node node, string title, JsonElement blocks, Guid? userId, CancellationToken ct)
    {
        var now = clock.UtcNow;
        ProjectionChanges changes;
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            var t = title.Trim();
            if (t.Length > 1000) t = t[..1000];
            if (t != node.Title) { node.Title = t; node.UpdatedAt = now; }
            changes = await ProjectAsync(node, blocks, now, ct);
            if (changes.TagsChanged) outbox.Enqueue(new TagsChanged(node.WorkspaceId, node.Id, changes.Tags.Select(x => x.Id).ToArray(), userId));
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        await NotifyProjectionAsync(node.WorkspaceId, node.Id, changes, ct);
    }

    public static PageSnapshot NewSnapshot(Guid nodeId, int version, string title, JsonElement blocks, Guid? userId, SnapshotKind kind, DateTimeOffset at) => new()
    {
        NodeId = nodeId, TakenAt = at, Version = version, Title = title, Blocks = blocks.Clone(), UserId = userId, Kind = kind,
        BlockCount = BlockTreeBuilder.Count(blocks),
    };

    // --- projection ---------------------------------------------------------------------------------------------------

    public sealed record ProjectionChanges(bool LinksChanged, bool TagsChanged, IReadOnlyList<TagDto> Tags);

    private async Task NotifyProjectionAsync(Guid workspaceId, Guid nodeId, ProjectionChanges changes, CancellationToken ct)
    {
        if (changes.LinksChanged) await realtime.LinksChangedAsync(workspaceId, nodeId, ct);
        if (changes.TagsChanged) await realtime.TagsChangedAsync(workspaceId, nodeId, changes.Tags, ct);
    }

    /// <summary>blocks + links + inline tags for one node. Must run inside the caller's transaction; does not save.</summary>
    private async Task<ProjectionChanges> ProjectAsync(Node node, JsonElement blocks, DateTimeOffset now, CancellationToken ct)
    {
        var nodeId = node.Id;
        var flat = BlockFlattener.Flatten(blocks, blockTypes.ToDictionary(b => b.TypeName, b => b, StringComparer.Ordinal));
        await RebuildProjectionAsync(nodeId, flat, now, ct);

        var linksChanged = await RebuildLinksAsync(nodeId, flat, ct);
        var (tagsChanged, tags) = await SyncInlineTagsAsync(node, flat, ct);
        return new ProjectionChanges(linksChanged, tagsChanged, tags);
    }

    /// <summary>Diffs incoming rows against the stored projection by block id; unchanged rows keep version/updated_at.</summary>
    private async Task RebuildProjectionAsync(Guid nodeId, IReadOnlyList<FlatBlock> incoming, DateTimeOffset now, CancellationToken ct)
    {
        var existing = await db.Blocks.Where(b => b.NodeId == nodeId).ToDictionaryAsync(b => b.Id, ct);
        var incomingIds = new HashSet<Guid>(incoming.Select(b => b.Id));

        foreach (var (id, row) in existing)
        {
            if (!incomingIds.Contains(id)) db.Blocks.Remove(row);
        }

        foreach (var b in incoming)
        {
            if (existing.TryGetValue(b.Id, out var row))
            {
                var same = row.Type == b.Type
                           && row.ParentBlockId == b.ParentBlockId
                           && row.Position == b.Position
                           && row.PlainText == b.PlainText
                           && JsonElement.DeepEquals(row.Props, b.Props)
                           && NullableDeepEquals(row.Content, b.Content);
                if (same) continue;

                row.Type = b.Type;
                row.ParentBlockId = b.ParentBlockId;
                row.Position = b.Position;
                row.Props = b.Props;
                row.Content = b.Content;
                row.PlainText = b.PlainText;
                row.Version += 1;
                row.UpdatedAt = now;
            }
            else
            {
                db.Blocks.Add(new Block
                {
                    Id = b.Id, NodeId = nodeId, ParentBlockId = b.ParentBlockId, Position = b.Position, Type = b.Type,
                    Props = b.Props, Content = b.Content, SchemaVersion = 1, Version = 1, PlainText = b.PlainText, UpdatedAt = now,
                });
            }
        }
    }

    /// <summary>Replaces the node's outgoing links; block-only targets (<c>nook://block/{id}</c>) are resolved to their node. Returns whether the set changed.</summary>
    private async Task<bool> RebuildLinksAsync(Guid nodeId, IReadOnlyList<FlatBlock> flat, CancellationToken ct)
    {
        var fresh = LinkExtractor.Extract(nodeId, flat).ToList();

        var unresolvedBlocks = fresh.Where(l => l.TargetNodeId is null && l.TargetBlockId is not null).Select(l => l.TargetBlockId!.Value).Distinct().ToArray();
        if (unresolvedBlocks.Length > 0)
        {
            var owners = await db.Blocks.AsNoTracking().Where(b => unresolvedBlocks.Contains(b.Id)).Select(b => new { b.Id, b.NodeId }).ToDictionaryAsync(b => b.Id, b => b.NodeId, ct);
            foreach (var l in fresh)
            {
                if (l.TargetNodeId is null && l.TargetBlockId is { } bid && owners.TryGetValue(bid, out var owner)) l.TargetNodeId = owner;
            }
        }

        var old = await db.Links.Where(l => l.SourceNodeId == nodeId).ToListAsync(ct);
        static (Guid?, Guid?, Guid?, LinkKind, string?) Key(Link l) => (l.SourceBlockId, l.TargetNodeId, l.TargetBlockId, l.Kind, l.Href);
        var changed = old.Count != fresh.Count || !old.Select(Key).ToHashSet().SetEquals(fresh.Select(Key));
        if (!changed) return false;

        db.Links.RemoveRange(old);
        db.Links.AddRange(fresh);
        return true;
    }

    /// <summary>Synchronises <c>node_tags(source = inline)</c> with the <c>#hashtags</c> found in the blocks; creates unknown tags.</summary>
    private async Task<(bool Changed, IReadOnlyList<TagDto> Tags)> SyncInlineTagsAsync(Node node, IReadOnlyList<FlatBlock> flat, CancellationToken ct)
    {
        var names = HashtagExtractor.Extract(flat);
        var lowered = names.Select(n => n.ToLowerInvariant()).ToArray();

        var workspaceTags = lowered.Length == 0
            ? []
            : await db.Tags.Where(t => t.WorkspaceId == node.WorkspaceId && lowered.Contains(t.Name.ToLower())).ToListAsync(ct);
        var byName = workspaceTags.ToDictionary(t => t.Name.ToLowerInvariant(), t => t);
        foreach (var name in names)
        {
            if (byName.ContainsKey(name.ToLowerInvariant())) continue;
            var tag = new Tag { WorkspaceId = node.WorkspaceId, Name = name };
            db.Tags.Add(tag);
            byName[name.ToLowerInvariant()] = tag;
        }
        var wanted = byName.Values.Select(t => t.Id).ToHashSet();

        var rows = await db.NodeTags.Where(nt => nt.NodeId == node.Id).ToListAsync(ct);
        var inlineRows = rows.Where(r => r.Source == TagSource.Inline).ToList();
        var changed = false;
        foreach (var row in inlineRows)
        {
            if (wanted.Contains(row.TagId)) continue;
            db.NodeTags.Remove(row);
            changed = true;
        }
        var present = inlineRows.Select(r => r.TagId).ToHashSet();
        foreach (var id in wanted)
        {
            if (present.Contains(id)) continue;
            db.NodeTags.Add(new NodeTag { NodeId = node.Id, TagId = id, Source = TagSource.Inline });
            changed = true;
        }
        if (!changed) return (false, []);

        var manualIds = rows.Where(r => r.Source == TagSource.Manual).Select(r => r.TagId).ToHashSet();
        var allIds = manualIds.Union(wanted).ToArray();
        var known = byName.Values.ToDictionary(t => t.Id);
        var missing = allIds.Where(id => !known.ContainsKey(id)).ToArray();
        if (missing.Length > 0)
        {
            foreach (var t in await db.Tags.Where(t => missing.Contains(t.Id)).ToListAsync(ct)) known[t.Id] = t;
        }
        var tags = allIds.Where(known.ContainsKey).Select(id =>
        {
            var t = known[id];
            var source = manualIds.Contains(id) && wanted.Contains(id) ? "manual,inline" : wanted.Contains(id) ? "inline" : "manual";
            return TagDto.From(t, 0, source);
        }).OrderBy(t => t.Name, StringComparer.OrdinalIgnoreCase).ToList();
        return (true, tags);
    }

    private static bool NullableDeepEquals(JsonElement? a, JsonElement? b)
    {
        if (a is null && b is null) return true;
        if (a is null || b is null) return false;
        return JsonElement.DeepEquals(a.Value, b.Value);
    }
}

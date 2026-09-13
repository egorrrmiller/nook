using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Domain.Entities;
using Nook.Plugins.Sdk;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Documents;

/// <summary>Internal document persistence used by the collab service (contracts §3, "Internal API").</summary>
public sealed class DocumentStoreService(
    IAppDbContext db,
    IClock clock,
    IOutbox outbox,
    IRealtimeNotifier realtime,
    IEnumerable<IBlockTypeDefinition> blockTypes)
{
    public const int SnapshotEvery = 25;

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

            var flat = BlockFlattener.Flatten(request.Blocks, blockTypes.ToDictionary(b => b.TypeName, b => b, StringComparer.Ordinal));
            await RebuildProjectionAsync(nodeId, flat, now, ct);

            db.Links.RemoveRange(db.Links.Where(l => l.SourceNodeId == nodeId));
            db.Links.AddRange(LinkExtractor.Extract(nodeId, flat));

            if (newVersion % SnapshotEvery == 0 && request.Blocks.ValueKind == JsonValueKind.Array)
            {
                db.PageSnapshots.Add(new PageSnapshot
                {
                    NodeId = nodeId, TakenAt = now, Version = newVersion, Title = node.Title,
                    Blocks = request.Blocks.Clone(), UserId = userIds.Length == 1 ? userIds[0] : null,
                });
            }

            outbox.Enqueue(new DocumentChanged(node.WorkspaceId, nodeId, newVersion, userIds));
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }

        await realtime.DocumentChangedAsync(node.WorkspaceId, nodeId, newVersion, ct);
        if (titleChanged) await realtime.NodeChangedAsync(node.WorkspaceId, NodeDto.From(node, null), ct);
        return new InternalDocumentPutResponse(newVersion);
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

    private static bool NullableDeepEquals(JsonElement? a, JsonElement? b)
    {
        if (a is null && b is null) return true;
        if (a is null || b is null) return false;
        return JsonElement.DeepEquals(a.Value, b.Value);
    }
}

using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Knowledge;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Tags;

/// <summary>Contracts §9.2: workspace tags, manual node tags (inline ones are collected by <c>DocumentStoreService</c>).</summary>
public sealed class TagService(
    IAppDbContext db,
    IWorkspaceContextAccessor contextAccessor,
    NodeService nodes,
    NodeAccess access,
    NodeVisibility visibility,
    IOutbox outbox,
    IRealtimeNotifier realtime,
    IClock clock)
{
    public const int MaxNameLength = 100;
    private WorkspaceContext Ctx => contextAccessor.Required;

    public async Task<IReadOnlyList<TagDto>> ListAsync(CancellationToken ct)
    {
        var ws = Ctx.WorkspaceId;
        var tags = await db.Tags.AsNoTracking().Where(t => t.WorkspaceId == ws).OrderBy(t => t.Name).ToListAsync(ct);
        var counts = await CountsAsync(tags.Select(t => t.Id).ToArray(), ct);
        return tags.Select(t => TagDto.From(t, counts.GetValueOrDefault(t.Id))).OrderBy(t => t.Name, StringComparer.OrdinalIgnoreCase).ToList();
    }

    public async Task<TagDto> CreateAsync(CreateTagRequest request, CancellationToken ct)
    {
        RequireEditor();
        var name = NormalizeName(request.Name);
        var color = NormalizeColor(request.Color);
        var ws = Ctx.WorkspaceId;
        var lower = name.ToLowerInvariant();
        var existing = await db.Tags.AsNoTracking().FirstOrDefaultAsync(t => t.WorkspaceId == ws && t.Name.ToLower() == lower, ct);
        if (existing is not null)
            throw new ConflictException($"Tag '{existing.Name}' already exists.") { Extensions = new Dictionary<string, object?> { ["tagId"] = existing.Id } };
        var tag = new Tag { WorkspaceId = ws, Name = name, Color = color };
        db.Tags.Add(tag);
        await db.SaveChangesAsync(ct);
        return TagDto.From(tag, 0);
    }

    public async Task<TagDto> PatchAsync(Guid id, PatchTagRequest request, CancellationToken ct)
    {
        RequireEditor();
        var ws = Ctx.WorkspaceId;
        var tag = await db.Tags.FirstOrDefaultAsync(t => t.Id == id && t.WorkspaceId == ws, ct) ?? throw new NotFoundException("Tag not found.");
        if (request.Name is not null)
        {
            var name = NormalizeName(request.Name);
            var lower = name.ToLowerInvariant();
            var clash = await db.Tags.AsNoTracking().FirstOrDefaultAsync(t => t.WorkspaceId == ws && t.Id != id && t.Name.ToLower() == lower, ct);
            if (clash is not null)
                throw new ConflictException($"Tag '{clash.Name}' already exists.") { Extensions = new Dictionary<string, object?> { ["tagId"] = clash.Id } };
            tag.Name = name;
        }
        if (request.Color is not null) tag.Color = NormalizeColor(request.Color);
        await db.SaveChangesAsync(ct);
        var counts = await CountsAsync([tag.Id], ct);
        return TagDto.From(tag, counts.GetValueOrDefault(tag.Id));
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        RequireEditor();
        var ws = Ctx.WorkspaceId;
        var tag = await db.Tags.FirstOrDefaultAsync(t => t.Id == id && t.WorkspaceId == ws, ct) ?? throw new NotFoundException("Tag not found.");
        db.Tags.Remove(tag); // node_tags cascade
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Union of manual + inline tags with their <c>source</c>.</summary>
    public async Task<IReadOnlyList<TagDto>> ForNodeAsync(Guid nodeId, CancellationToken ct)
    {
        await nodes.RequireAsync(nodeId, WorkspaceRole.Viewer, ct);
        return await UnionAsync(nodeId, ct);
    }

    public async Task<IReadOnlyList<TagDto>> SetManualAsync(Guid nodeId, SetNodeTagsRequest request, CancellationToken ct)
    {
        var ctx = Ctx;
        var (node, _) = await nodes.RequireAsync(nodeId, WorkspaceRole.Editor, ct, tracking: true);
        var ws = ctx.WorkspaceId;

        var wanted = new Dictionary<Guid, Tag>();
        if (request.TagIds is { Length: > 0 })
        {
            var ids = request.TagIds.Distinct().ToArray();
            var found = await db.Tags.Where(t => t.WorkspaceId == ws && ids.Contains(t.Id)).ToListAsync(ct);
            if (found.Count != ids.Length) throw new NotFoundException("One or more tags do not exist in this workspace.");
            foreach (var t in found) wanted[t.Id] = t;
        }
        if (request.Names is { Length: > 0 })
        {
            var names = request.Names.Select(NormalizeName).DistinctBy(n => n.ToLowerInvariant()).ToList();
            var lowered = names.Select(n => n.ToLowerInvariant()).ToArray();
            var found = await db.Tags.Where(t => t.WorkspaceId == ws && lowered.Contains(t.Name.ToLower())).ToListAsync(ct);
            var byName = found.ToDictionary(t => t.Name.ToLowerInvariant());
            foreach (var name in names)
            {
                if (!byName.TryGetValue(name.ToLowerInvariant(), out var tag))
                {
                    tag = new Tag { WorkspaceId = ws, Name = name };
                    db.Tags.Add(tag);
                }
                wanted[tag.Id] = tag;
            }
        }

        var rows = await db.NodeTags.Where(nt => nt.NodeId == nodeId).ToListAsync(ct);
        var changed = false;
        foreach (var row in rows.Where(r => r.Source == TagSource.Manual))
        {
            if (wanted.ContainsKey(row.TagId)) continue;
            db.NodeTags.Remove(row);
            changed = true;
        }
        var present = rows.Where(r => r.Source == TagSource.Manual).Select(r => r.TagId).ToHashSet();
        foreach (var id in wanted.Keys)
        {
            if (present.Contains(id)) continue;
            db.NodeTags.Add(new NodeTag { NodeId = nodeId, TagId = id, Source = TagSource.Manual });
            changed = true;
        }

        if (changed) node.UpdatedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);

        var union = await UnionAsync(nodeId, ct);
        if (changed)
        {
            outbox.Enqueue(new TagsChanged(ws, nodeId, union.Select(t => t.Id).ToArray(), ctx.UserId));
            await db.SaveChangesAsync(ct);
            await realtime.TagsChangedAsync(ws, nodeId, union, ct);
        }
        return union;
    }

    public async Task<TagNodesPage> NodesAsync(Guid tagId, int? limit, string? cursor, CancellationToken ct)
    {
        var ctx = Ctx;
        var ws = ctx.WorkspaceId;
        if (!await db.Tags.AsNoTracking().AnyAsync(t => t.Id == tagId && t.WorkspaceId == ws, ct)) throw new NotFoundException("Tag not found.");
        var take = Math.Clamp(limit ?? 50, 1, 200);
        var visible = await visibility.VisibleIdsAsync(ct);

        var q = from nt in db.NodeTags.AsNoTracking()
                join n in db.Nodes.AsNoTracking() on nt.NodeId equals n.Id
                where nt.TagId == tagId && n.WorkspaceId == ws && n.DeletedAt == null
                select n;
        q = q.Distinct();
        if (visible is not null)
        {
            var ids = visible.ToArray();
            q = q.Where(n => ids.Contains(n.Id));
        }
        if (Cursor.DecodeKeyset(cursor) is { } key)
            q = q.Where(n => n.UpdatedAt < key.At || (n.UpdatedAt == key.At && n.Id.CompareTo(key.Id) < 0));

        var page = await q.OrderByDescending(n => n.UpdatedAt).ThenByDescending(n => n.Id).Take(take + 1).ToListAsync(ct);
        var hasMore = page.Count > take;
        if (hasMore) page.RemoveAt(page.Count - 1);
        var items = new List<NodeDto>(page.Count);
        foreach (var n in page)
        {
            access.Remember(n);
            items.Add(NodeDto.From(n, await access.EffectiveRoleAsync(n, ct)));
        }
        return new TagNodesPage(items, hasMore && page.Count > 0 ? Cursor.EncodeKeyset(page[^1].UpdatedAt, page[^1].Id) : null);
    }

    // --- helpers ------------------------------------------------------------------------------------------------------

    private async Task<IReadOnlyList<TagDto>> UnionAsync(Guid nodeId, CancellationToken ct)
    {
        var rows = await (from nt in db.NodeTags.AsNoTracking()
                          join t in db.Tags.AsNoTracking() on nt.TagId equals t.Id
                          where nt.NodeId == nodeId
                          select new { Tag = t, nt.Source }).ToListAsync(ct);
        var counts = await CountsAsync(rows.Select(r => r.Tag.Id).Distinct().ToArray(), ct);
        return rows.GroupBy(r => r.Tag.Id)
            .Select(g =>
            {
                var sources = g.Select(r => r.Source).Distinct().OrderBy(s => s).Select(s => s.ToWire());
                return TagDto.From(g.First().Tag, counts.GetValueOrDefault(g.Key), string.Join(",", sources));
            })
            .OrderBy(t => t.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>Distinct live nodes per tag.</summary>
    private async Task<Dictionary<Guid, int>> CountsAsync(Guid[] tagIds, CancellationToken ct)
    {
        if (tagIds.Length == 0) return [];
        var rows = await (from nt in db.NodeTags.AsNoTracking()
                          join n in db.Nodes.AsNoTracking() on nt.NodeId equals n.Id
                          where tagIds.Contains(nt.TagId) && n.DeletedAt == null
                          select new { nt.TagId, nt.NodeId }).Distinct().ToListAsync(ct);
        return rows.GroupBy(r => r.TagId).ToDictionary(g => g.Key, g => g.Count());
    }

    private void RequireEditor()
    {
        if (Ctx.MembershipRole is null || !Ctx.MembershipRole.Value.CanEdit()) throw new ForbiddenException("Only workspace editors can manage tags.");
    }

    public static string NormalizeName(string? raw)
    {
        var name = (raw ?? "").Trim().TrimStart('#').Trim();
        if (name.Length == 0) throw new ValidationException("Tag name is required.");
        if (name.Length > MaxNameLength) throw new ValidationException($"Tag name is too long (max {MaxNameLength} chars).");
        return name;
    }

    private static string? NormalizeColor(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var c = raw.Trim();
        if (c.Length > 32) throw new ValidationException("Color is too long.");
        return c;
    }
}

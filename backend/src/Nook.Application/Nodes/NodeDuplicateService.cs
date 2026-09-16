using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Nook.Application.Collab;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Domain.Ordering;
using Nook.Domain.ValueObjects;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Nodes;

/// <summary>
/// Contracts §7.1 <c>POST /nodes/{id}/duplicate</c>: deep-copies a subtree (icons, covers, page settings, properties,
/// tags, attachment rows re-linked to the same blob) and its page content through the collab internal API
/// (<c>GET blocks → strip ids → import</c>). Aliases and shares are not copied. If collab is unreachable the nodes are
/// still created and the response carries a warning (see <see cref="DuplicateResult.Warnings"/>).
/// </summary>
public sealed class NodeDuplicateService(
    IAppDbContext db,
    IWorkspaceContextAccessor contextAccessor,
    NodeService nodes,
    NodeAccess access,
    TreeQueries tree,
    ICollabClient collab,
    IClock clock,
    IOutbox outbox,
    IRealtimeNotifier realtime,
    ILogger<NodeDuplicateService> logger)
{
    public const string CopySuffix = " (copy)";

    private WorkspaceContext Ctx => contextAccessor.Required;

    private IQueryable<Node> Scoped => db.Nodes.Where(n => n.WorkspaceId == Ctx.WorkspaceId);

    public sealed record DuplicateResult(NodeDto Node, IReadOnlyList<string> Warnings);

    public async Task<DuplicateResult> DuplicateAsync(Guid id, DuplicateNodeRequest request, CancellationToken ct)
    {
        var ctx = Ctx;
        var (source, _) = await nodes.RequireAsync(id, WorkspaceRole.Viewer, ct);

        var target = request.ParentId ?? source.ParentId;
        if (target is Guid tid)
        {
            if (tid == source.Id) throw new ValidationException("Cannot duplicate a node into itself.");
            var (parent, _) = await nodes.RequireAsync(tid, WorkspaceRole.Editor, ct);
            if (parent.Kind == NodeKind.File) throw new ValidationException("Files cannot contain child nodes.");
            var ancestors = await access.AncestorIdsAsync(parent.ParentId, ct);
            if (ancestors.Contains(source.Id)) throw new ValidationException("Cannot duplicate a node into its own subtree.");
        }
        else if (ctx.MembershipRole is null || !ctx.MembershipRole.Value.CanEdit())
        {
            throw new ForbiddenException("Only workspace editors can create root nodes.");
        }

        // Live subtree, parents before children.
        var subtreeIds = await tree.SubtreeIdsAsync(source.Id, ct);
        var idArray = subtreeIds.ToArray();
        var originals = await Scoped.AsNoTracking().Where(n => idArray.Contains(n.Id) && n.DeletedAt == null).ToListAsync(ct);
        var byId = originals.ToDictionary(n => n.Id);
        var ordered = subtreeIds.Where(byId.ContainsKey).Select(i => byId[i]).ToList();
        var idMap = ordered.ToDictionary(n => n.Id, _ => Guid.NewGuid());

        var tagRows = await db.NodeTags.AsNoTracking().Where(t => idArray.Contains(t.NodeId)).ToListAsync(ct);
        var attachments = await db.Attachments.AsNoTracking().Where(a => idArray.Contains(a.NodeId)).ToListAsync(ct);
        var attachmentMap = attachments.ToDictionary(a => a.Id, _ => Guid.NewGuid());

        var now = clock.UtcNow;
        var rootPosition = request.Position is not null && FractionalIndex.IsValid(request.Position)
            ? request.Position
            : await NextPositionAsync(target, ct);

        var copies = new List<Node>(ordered.Count);
        foreach (var n in ordered)
        {
            var isRoot = n.Id == source.Id;
            copies.Add(new Node
            {
                Id = idMap[n.Id],
                WorkspaceId = ctx.WorkspaceId,
                ParentId = isRoot ? target : (n.ParentId is Guid p && idMap.TryGetValue(p, out var np) ? np : target),
                Kind = n.Kind,
                Title = isRoot ? Truncate(n.Title + CopySuffix, 1000) : n.Title,
                Icon = RemapIcon(n.Icon, attachmentMap),
                Cover = RemapCover(n.Cover, attachmentMap),
                Position = isRoot ? rootPosition : n.Position,
                PageSettings = n.PageSettings,
                CollectionId = n.CollectionId,
                Properties = n.Properties?.Clone(),
                ArchivedAt = n.ArchivedAt,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }
        db.Nodes.AddRange(copies);
        foreach (var t in tagRows)
        {
            if (idMap.TryGetValue(t.NodeId, out var newNode)) db.NodeTags.Add(new NodeTag { NodeId = newNode, TagId = t.TagId });
        }
        foreach (var a in attachments)
        {
            if (!idMap.TryGetValue(a.NodeId, out var newNode)) continue;
            db.Attachments.Add(new Attachment
            {
                Id = attachmentMap[a.Id],
                WorkspaceId = a.WorkspaceId,
                BlobSha = a.BlobSha,
                NodeId = newNode,
                BlockId = null, // block ids are regenerated by the import; the content still references the attachment by id
                PropertyId = a.PropertyId,
                Filename = a.Filename,
                Mime = a.Mime,
                Size = a.Size,
                Meta = a.Meta?.Clone(),
                CreatedAt = now,
            });
        }
        var rootCopy = copies[0];
        outbox.Enqueue(new NodeDuplicated(ctx.WorkspaceId, source.Id, rootCopy.Id, rootCopy.ParentId, copies.Count, ctx.UserId));
        await db.SaveChangesAsync(ct);

        // Page content: one round-trip pair per page. Nodes already exist so collab can persist through /internal/documents.
        var warnings = new List<string>();
        foreach (var n in ordered.Where(n => n.Kind == NodeKind.Page))
        {
            var dst = idMap[n.Id];
            try
            {
                var (_, blocks) = await collab.GetBlocksAsync(n.Id, ct);
                if (blocks.ValueKind != JsonValueKind.Array || blocks.GetArrayLength() == 0) continue;
                var copied = PrepareBlocks(blocks, attachmentMap);
                await collab.ImportAsync(dst, n.Id == source.Id ? rootCopy.Title : n.Title, copied, ctx.UserId, ct);
            }
            catch (CollabUnavailableException e)
            {
                logger.LogWarning("Duplicate {Source}: collab unavailable, page content not copied ({Message})", source.Id, e.Message);
                warnings.Add("Collab service unavailable: page content was not copied.");
                break;
            }
            catch (CollabRequestException e)
            {
                logger.LogWarning("Duplicate {Source}: collab refused content copy for {Node} ({Status}: {Message})", source.Id, n.Id, e.UpstreamStatus, e.Message);
                warnings.Add($"Content of page {n.Id} was not copied (collab {e.UpstreamStatus}).");
            }
        }

        var dto = await tree.ToDtoAsync(rootCopy, ct) ?? NodeDto.From(rootCopy, null, copies.Count > 1);
        await realtime.NodeChangedAsync(ctx.WorkspaceId, dto with { EffectiveRole = null }, ct);
        return new DuplicateResult(dto, warnings);
    }

    // --- content helpers --------------------------------------------------------------------------------------------

    /// <summary>Strips every block <c>id</c> (recursively through <c>children</c>) and rewrites attachment ids to the copies.</summary>
    public static JsonElement PrepareBlocks(JsonElement blocks, IReadOnlyDictionary<Guid, Guid> attachmentMap)
    {
        var text = blocks.GetRawText();
        foreach (var (oldId, newId) in attachmentMap)
            text = text.Replace(oldId.ToString("D"), newId.ToString("D"), StringComparison.OrdinalIgnoreCase);
        var root = JsonNode.Parse(text);
        if (root is JsonArray arr) StripIds(arr);
        return JsonSerializer.SerializeToElement(root);
    }

    private static void StripIds(JsonArray blocks)
    {
        foreach (var item in blocks)
        {
            if (item is not JsonObject block) continue;
            block.Remove("id");
            if (block["children"] is JsonArray children) StripIds(children);
        }
    }

    private static NodeIcon? RemapIcon(NodeIcon? icon, IReadOnlyDictionary<Guid, Guid> attachmentMap) =>
        icon is { Type: "upload" } && Guid.TryParse(icon.Value, out var id) && attachmentMap.TryGetValue(id, out var mapped)
            ? icon with { Value = mapped.ToString("D") }
            : icon;

    private static NodeCover? RemapCover(NodeCover? cover, IReadOnlyDictionary<Guid, Guid> attachmentMap) =>
        cover is { Type: "upload" } && Guid.TryParse(cover.Value, out var id) && attachmentMap.TryGetValue(id, out var mapped)
            ? cover with { Value = mapped.ToString("D") }
            : cover;

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];

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

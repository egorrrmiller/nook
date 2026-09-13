using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Knowledge;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;

namespace Nook.Application.Links;

/// <summary>Contracts §9.1: backlinks, outgoing links and the broken-links report over the derived <c>links</c> table.</summary>
public sealed class LinkService(IAppDbContext db, IWorkspaceContextAccessor contextAccessor, NodeService nodes, NodeVisibility visibility)
{
    public const int SnippetLength = 200;
    private WorkspaceContext Ctx => contextAccessor.Required;

    public async Task<IReadOnlyList<BacklinkDto>> BacklinksAsync(Guid nodeId, CancellationToken ct)
    {
        var (node, _) = await nodes.RequireAsync(nodeId, WorkspaceRole.Viewer, ct);
        var ws = Ctx.WorkspaceId;

        // Wikilinks resolve lazily by title or alias (case-insensitive).
        var names = new List<string> { $"[[{node.Title.Trim().ToLowerInvariant()}]]" };
        names.AddRange(await db.Aliases.AsNoTracking().Where(a => a.NodeId == nodeId).Select(a => "[[" + a.Value.ToLower() + "]]").ToListAsync(ct));
        var nameArray = names.Distinct().ToArray();

        var rows = await (from l in db.Links.AsNoTracking()
                          join s in db.Nodes.AsNoTracking() on l.SourceNodeId equals s.Id
                          where s.WorkspaceId == ws && s.DeletedAt == null && s.Id != nodeId
                                && (l.TargetNodeId == nodeId || (l.Kind == LinkKind.Wikilink && l.Href != null && nameArray.Contains(l.Href.ToLower())))
                          select new { Link = l, Source = s }).ToListAsync(ct);
        if (rows.Count == 0) return [];

        var visible = await visibility.VisibleIdsAsync(ct);
        if (visible is not null) rows = rows.Where(r => visible.Contains(r.Source.Id)).ToList();

        var blockIds = rows.Where(r => r.Link.SourceBlockId is not null).Select(r => r.Link.SourceBlockId!.Value).Distinct().ToArray();
        var snippets = blockIds.Length == 0
            ? new Dictionary<Guid, string>()
            : await db.Blocks.AsNoTracking().Where(b => blockIds.Contains(b.Id)).ToDictionaryAsync(b => b.Id, b => b.PlainText, ct);

        return rows
            .OrderBy(r => r.Source.Title, StringComparer.OrdinalIgnoreCase).ThenBy(r => r.Link.SourceBlockId)
            .Select(r => new BacklinkDto(
                NodeSummaryDto.From(r.Source),
                r.Link.SourceBlockId,
                r.Link.Kind.ToWire(),
                Snippet(r.Link.SourceBlockId is { } b && snippets.TryGetValue(b, out var text) ? text : r.Source.Title)))
            .ToList();
    }

    public async Task<IReadOnlyList<OutgoingLinkDto>> LinksAsync(Guid nodeId, CancellationToken ct)
    {
        await nodes.RequireAsync(nodeId, WorkspaceRole.Viewer, ct);
        var ws = Ctx.WorkspaceId;
        var links = await db.Links.AsNoTracking().Where(l => l.SourceNodeId == nodeId).ToListAsync(ct);
        if (links.Count == 0) return [];

        var resolved = await ResolveTargetsAsync(links, ws, ct);
        return links.Select(l =>
        {
            var target = resolved.GetValueOrDefault(l.Id);
            var broken = l.Kind != LinkKind.Url && target is null;
            return new OutgoingLinkDto(target is null ? null : NodeSummaryDto.From(target), l.TargetBlockId, l.Kind.ToWire(), l.Href, broken);
        }).ToList();
    }

    public async Task<IReadOnlyList<BrokenLinkDto>> BrokenAsync(int? limit, CancellationToken ct)
    {
        var ws = Ctx.WorkspaceId;
        var take = Math.Clamp(limit ?? 100, 1, 1000);
        var visible = await visibility.VisibleIdsAsync(ct);

        // Candidates: internal links whose target is missing/trashed, plus every wikilink (resolved below).
        var rows = await (from l in db.Links.AsNoTracking()
                          join s in db.Nodes.AsNoTracking() on l.SourceNodeId equals s.Id
                          from t in db.Nodes.AsNoTracking().Where(t => t.Id == l.TargetNodeId && t.WorkspaceId == ws).DefaultIfEmpty()
                          where s.WorkspaceId == ws && s.DeletedAt == null && l.Kind != LinkKind.Url
                                && (l.Kind == LinkKind.Wikilink || t == null || t.DeletedAt != null)
                          orderby s.Title, l.SourceBlockId
                          select new { Link = l, Source = s }).ToListAsync(ct);
        if (visible is not null) rows = rows.Where(r => visible.Contains(r.Source.Id)).ToList();

        var resolved = await ResolveTargetsAsync(rows.Select(r => r.Link).ToList(), ws, ct);
        return rows
            .Where(r => !resolved.ContainsKey(r.Link.Id))
            .Take(take)
            .Select(r => new BrokenLinkDto(NodeSummaryDto.From(r.Source), r.Link.SourceBlockId ?? Guid.Empty, r.Link.Href, r.Link.TargetNodeId))
            .ToList();
    }

    /// <summary>link id → live target node (direct ids, or wikilinks matched by title/alias, case-insensitive).</summary>
    private async Task<Dictionary<Guid, Node>> ResolveTargetsAsync(IReadOnlyList<Link> links, Guid ws, CancellationToken ct)
    {
        var result = new Dictionary<Guid, Node>();
        var ids = links.Where(l => l.TargetNodeId is not null).Select(l => l.TargetNodeId!.Value).Distinct().ToArray();
        var targets = ids.Length == 0
            ? new Dictionary<Guid, Node>()
            : await db.Nodes.AsNoTracking().Where(n => ids.Contains(n.Id) && n.WorkspaceId == ws && n.DeletedAt == null).ToDictionaryAsync(n => n.Id, ct);
        foreach (var l in links)
        {
            if (l.TargetNodeId is { } id && targets.TryGetValue(id, out var n)) result[l.Id] = n;
        }

        var wikis = links.Where(l => l.Kind == LinkKind.Wikilink && !result.ContainsKey(l.Id) && WikiTitle(l.Href) is not null).ToList();
        if (wikis.Count == 0) return result;
        var titles = wikis.Select(l => WikiTitle(l.Href)!).Distinct().ToArray();

        var byTitle = await db.Nodes.AsNoTracking()
            .Where(n => n.WorkspaceId == ws && n.DeletedAt == null && titles.Contains(n.Title.ToLower()))
            .ToListAsync(ct);
        var byAlias = await (from a in db.Aliases.AsNoTracking()
                             join n in db.Nodes.AsNoTracking() on a.NodeId equals n.Id
                             where n.WorkspaceId == ws && n.DeletedAt == null && titles.Contains(a.Value.ToLower())
                             select new { Key = a.Value.ToLower(), Node = n }).ToListAsync(ct);
        var lookup = new Dictionary<string, Node>();
        foreach (var n in byTitle.OrderByDescending(n => n.UpdatedAt)) lookup.TryAdd(n.Title.Trim().ToLowerInvariant(), n);
        foreach (var a in byAlias) lookup.TryAdd(a.Key, a.Node);
        foreach (var l in wikis)
        {
            if (lookup.TryGetValue(WikiTitle(l.Href)!, out var n)) result[l.Id] = n;
        }
        return result;
    }

    public static string? WikiTitle(string? href)
    {
        if (href is null || href.Length < 5 || !href.StartsWith("[[", StringComparison.Ordinal) || !href.EndsWith("]]", StringComparison.Ordinal)) return null;
        var t = href[2..^2].Trim().ToLowerInvariant();
        return t.Length == 0 ? null : t;
    }

    public static string Snippet(string text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        return text.Length <= SnippetLength ? text : text[..SnippetLength].TrimEnd() + "…";
    }
}

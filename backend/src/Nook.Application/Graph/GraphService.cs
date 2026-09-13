using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Knowledge;
using Nook.Application.Workspaces;
using Nook.Domain.Enums;

namespace Nook.Application.Graph;

/// <summary>Contracts §9.6: the workspace link graph (+ parent edges, + tag edges on request), capped at <see cref="MaxNodes"/> nodes.</summary>
public sealed class GraphService(IAppDbContext db, IWorkspaceContextAccessor contextAccessor, NodeVisibility visibility)
{
    public const int MaxNodes = 2000;
    public const int MaxDepth = 10;

    public async Task<GraphResponse> GetAsync(Guid? rootId, int? depth, bool includeTags, CancellationToken ct)
    {
        var ws = contextAccessor.Required.WorkspaceId;
        var visible = await visibility.VisibleIdsAsync(ct);
        var truncated = false;

        var query = db.Nodes.AsNoTracking().Where(n => n.WorkspaceId == ws && n.DeletedAt == null);
        if (visible is not null)
        {
            var ids = visible.ToArray();
            query = query.Where(n => ids.Contains(n.Id));
        }
        var all = await query.OrderByDescending(n => n.UpdatedAt)
            .Select(n => new { n.Id, n.Title, n.Icon, n.Kind, n.ParentId })
            .Take(MaxNodes + 1)
            .ToListAsync(ct);
        if (all.Count > MaxNodes) { truncated = true; all.RemoveAt(all.Count - 1); }
        var nodeMap = all.ToDictionary(n => n.Id);
        if (rootId is { } root && !nodeMap.ContainsKey(root)) throw new NotFoundException("Root node not found.");

        var idArray = nodeMap.Keys.ToArray();
        var linkRows = await db.Links.AsNoTracking()
            .Where(l => idArray.Contains(l.SourceNodeId) && l.TargetNodeId != null && idArray.Contains(l.TargetNodeId.Value) && l.Kind != LinkKind.Url)
            .Select(l => new { l.SourceNodeId, TargetNodeId = l.TargetNodeId!.Value, l.Kind })
            .Distinct()
            .ToListAsync(ct);

        // Undirected adjacency for the depth walk: parent/child + links.
        var adjacency = new Dictionary<Guid, HashSet<Guid>>();
        void Connect(Guid a, Guid b)
        {
            if (a == b) return;
            (adjacency.TryGetValue(a, out var sa) ? sa : adjacency[a] = []).Add(b);
            (adjacency.TryGetValue(b, out var sb) ? sb : adjacency[b] = []).Add(a);
        }
        foreach (var n in all)
        {
            if (n.ParentId is { } p && nodeMap.ContainsKey(p)) Connect(n.Id, p);
        }
        foreach (var l in linkRows) Connect(l.SourceNodeId, l.TargetNodeId);

        HashSet<Guid> included;
        if (rootId is { } r)
        {
            var maxDepth = Math.Clamp(depth ?? 2, 0, MaxDepth);
            included = [r];
            var frontier = new List<Guid> { r };
            for (var d = 0; d < maxDepth && frontier.Count > 0; d++)
            {
                var next = new List<Guid>();
                foreach (var id in frontier)
                {
                    if (!adjacency.TryGetValue(id, out var neighbours)) continue;
                    foreach (var nb in neighbours)
                    {
                        if (included.Add(nb)) next.Add(nb);
                    }
                }
                frontier = next;
            }
        }
        else
        {
            included = nodeMap.Keys.ToHashSet();
        }

        var edges = new List<GraphEdgeDto>();
        var edgeKeys = new HashSet<(Guid, Guid, string)>();
        void AddEdge(Guid s, Guid t, string kind)
        {
            if (edgeKeys.Add((s, t, kind))) edges.Add(new GraphEdgeDto(s, t, kind));
        }
        foreach (var n in all)
        {
            if (included.Contains(n.Id) && n.ParentId is { } p && included.Contains(p)) AddEdge(p, n.Id, "parent");
        }
        foreach (var l in linkRows)
        {
            if (included.Contains(l.SourceNodeId) && included.Contains(l.TargetNodeId)) AddEdge(l.SourceNodeId, l.TargetNodeId, l.Kind.ToWire());
        }

        Dictionary<Guid, List<Guid>>? tagsByNode = null;
        if (includeTags)
        {
            var incl = included.ToArray();
            var tagRows = await db.NodeTags.AsNoTracking().Where(nt => incl.Contains(nt.NodeId)).Select(nt => new { nt.NodeId, nt.TagId }).Distinct().ToListAsync(ct);
            tagsByNode = tagRows.GroupBy(t => t.NodeId).ToDictionary(g => g.Key, g => g.Select(t => t.TagId).Distinct().ToList());
            foreach (var t in tagRows) AddEdge(t.NodeId, t.TagId, "tag");
        }

        var degree = new Dictionary<Guid, int>();
        foreach (var e in edges)
        {
            degree[e.Source] = degree.GetValueOrDefault(e.Source) + 1;
            if (e.Kind != "tag") degree[e.Target] = degree.GetValueOrDefault(e.Target) + 1;
        }

        var nodes = all.Where(n => included.Contains(n.Id))
            .Select(n => new GraphNodeDto(n.Id, n.Title, n.Icon, n.Kind.ToWire(), degree.GetValueOrDefault(n.Id),
                tagsByNode is null ? null : tagsByNode.GetValueOrDefault(n.Id) ?? []))
            .ToList();
        return new GraphResponse(nodes, edges, truncated);
    }
}

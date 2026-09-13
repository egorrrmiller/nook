using System.Text.Json;
using Nook.Application.Common;
using Nook.Application.Workspaces;
using Nook.Domain.ValueObjects;

namespace Nook.Application.Knowledge;

/// <summary>Builds breadcrumbs (root → … → parent, self excluded) for many nodes with one recursive query.</summary>
public sealed class BreadcrumbService(IAppDbContext db, IWorkspaceContextAccessor contextAccessor)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<NodeSummaryDto>> ForNodeAsync(Guid nodeId, CancellationToken ct)
    {
        var map = await ForNodesAsync([nodeId], ct);
        return map.TryGetValue(nodeId, out var b) ? b : [];
    }

    /// <summary>leaf id → breadcrumb. Nodes without ancestors map to an empty list.</summary>
    public async Task<Dictionary<Guid, IReadOnlyList<NodeSummaryDto>>> ForNodesAsync(IReadOnlyCollection<Guid> nodeIds, CancellationToken ct)
    {
        var result = nodeIds.Distinct().ToDictionary(id => id, _ => (IReadOnlyList<NodeSummaryDto>)[]);
        if (result.Count == 0) return result;
        var ws = contextAccessor.Required.WorkspaceId;

        var rows = await SqlReader.QueryAsync(db, """
            WITH RECURSIVE chain AS (
                SELECT n.id AS leaf, n.parent_id AS current, 1 AS depth
                FROM nodes n WHERE n.id = ANY(@ids) AND n.workspace_id = @ws
                UNION ALL
                SELECT c.leaf, p.parent_id, c.depth + 1
                FROM chain c JOIN nodes p ON p.id = c.current
                WHERE p.workspace_id = @ws AND c.depth < 64
            )
            SELECT c.leaf, c.depth, a.id, a.title, a.icon::text, a.kind::text, a.parent_id
            FROM chain c JOIN nodes a ON a.id = c.current
            ORDER BY c.leaf, c.depth DESC
            """,
            new Dictionary<string, object?> { ["ids"] = result.Keys.ToArray(), ["ws"] = ws },
            r => (Leaf: r.GetGuid(0), Depth: r.GetInt32(1),
                Summary: new NodeSummaryDto(r.GetGuid(2), r.GetString(3), ParseIcon(r.GetStringOrNull(4)), r.GetString(5), r.GetGuidOrNull(6))),
            ct);

        foreach (var group in rows.GroupBy(r => r.Leaf))
            result[group.Key] = group.OrderByDescending(r => r.Depth).Select(r => r.Summary).ToList();
        return result;
    }

    public static NodeIcon? ParseIcon(string? json)
    {
        if (string.IsNullOrEmpty(json)) return null;
        try { return JsonSerializer.Deserialize<NodeIcon>(json, Json); }
        catch (JsonException) { return null; }
    }
}

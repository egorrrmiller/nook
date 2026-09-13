using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;

namespace Nook.Application.Search;

/// <summary>
/// Contracts §7.4: title + alias lookup for the ⌘K palette. Ranking: exact (ci) = 3, prefix = 2 + similarity,
/// trigram (<c>%</c>, threshold 0.2) = similarity; alias hits score 0.01 below the same title hit so titles win ties.
/// Trashed nodes are excluded, archived ones sort last; the result is restricted to nodes the caller may see.
/// </summary>
public sealed class QuickFindService(IAppDbContext db, IWorkspaceContextAccessor contextAccessor, TreeQueries tree)
{
    public const int DefaultLimit = 20;
    public const int MaxLimit = 100;
    public const double SimilarityThreshold = 0.2;

    private WorkspaceContext Ctx => contextAccessor.Required;

    public async Task<IReadOnlyList<QuickHit>> SearchAsync(string? q, int? limit, string? kinds, CancellationToken ct)
    {
        var take = Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);
        var kindFilter = ParseKinds(kinds);
        var query = (q ?? "").Trim();
        if (query.Length > 500) query = query[..500];

        var ws = Ctx.WorkspaceId;
        // Over-fetch so access filtering (share-only callers) and kind filtering still fill the page.
        var fetch = Math.Clamp(take * 5, 100, 500);

        List<Candidate> candidates;
        if (query.Length == 0)
        {
            var effectiveKinds = kindFilter ?? [NodeKind.Page];
            var recent = await db.Nodes.AsNoTracking()
                .Where(n => n.WorkspaceId == ws && n.DeletedAt == null && effectiveKinds.Contains(n.Kind))
                .OrderBy(n => n.ArchivedAt != null).ThenByDescending(n => n.UpdatedAt)
                .Take(fetch)
                .ToListAsync(ct);
            candidates = recent.Select(n => new Candidate(n, null, 0)).ToList();
        }
        else
        {
            var rows = await MatchAsync(ws, query, fetch, ct);
            var ids = rows.Select(r => r.Node).ToArray();
            var nodesById = await db.Nodes.AsNoTracking()
                .Where(n => n.WorkspaceId == ws && n.DeletedAt == null && ids.Contains(n.Id))
                .ToDictionaryAsync(n => n.Id, ct);
            candidates = rows
                .Where(r => nodesById.ContainsKey(r.Node))
                .Select(r => new Candidate(nodesById[r.Node], r.Alias, r.Score))
                .Where(c => kindFilter is null || kindFilter.Contains(c.Node.Kind))
                .OrderBy(c => c.Node.ArchivedAt != null).ThenByDescending(c => c.Score).ThenByDescending(c => c.Node.UpdatedAt)
                .ToList();
        }

        var dtos = await tree.ToDtosAsync(candidates.Select(c => c.Node).ToList(), ct);
        var visible = candidates.Where(c => dtos.ContainsKey(c.Node.Id)).Take(take).ToList();
        var crumbs = await tree.BreadcrumbsAsync(visible.Select(c => (c.Node.Id, c.Node.ParentId)).ToList(), ct);
        return visible.Select(c => new QuickHit(dtos[c.Node.Id], crumbs.GetValueOrDefault(c.Node.Id) ?? [], c.Alias, Math.Round(c.Score, 4))).ToList();
    }

    private async Task<List<MatchRow>> MatchAsync(Guid ws, string query, int fetch, CancellationToken ct)
    {
        var like = EscapeLike(query) + "%";
        // `%` uses pg_trgm.similarity_threshold; SET LOCAL scopes the 0.2 threshold to this transaction only.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SET LOCAL pg_trgm.similarity_threshold = 0.2", ct);
        var rows = await db.Database.SqlQuery<MatchRow>($"""
            SELECT c.node_id AS node, (array_agg(c.alias ORDER BY c.score DESC))[1] AS alias, max(c.score) AS score
            FROM (
                SELECT n.id AS node_id, NULL::text AS alias,
                       (CASE WHEN lower(n.title) = lower({query}) THEN 3.0
                             WHEN lower(n.title) LIKE lower({like}) ESCAPE '\' THEN 2.0 + similarity(n.title, {query})
                             ELSE similarity(n.title, {query}) END)::float8 AS score
                FROM nodes n
                WHERE n.workspace_id = {ws} AND n.deleted_at IS NULL
                  AND (lower(n.title) LIKE lower({like}) ESCAPE '\' OR n.title % {query})
                UNION ALL
                SELECT a.node_id, a.alias,
                       (CASE WHEN lower(a.alias) = lower({query}) THEN 3.0
                             WHEN lower(a.alias) LIKE lower({like}) ESCAPE '\' THEN 2.0 + similarity(a.alias, {query})
                             ELSE similarity(a.alias, {query}) END - 0.01)::float8
                FROM aliases a JOIN nodes n ON n.id = a.node_id
                WHERE n.workspace_id = {ws} AND n.deleted_at IS NULL
                  AND (lower(a.alias) LIKE lower({like}) ESCAPE '\' OR a.alias % {query})
            ) c
            GROUP BY c.node_id
            """)
            .OrderByDescending(r => r.Score)
            .Take(fetch)
            .ToListAsync(ct);
        await tx.CommitAsync(ct);
        return rows;
    }

    private static HashSet<NodeKind>? ParseKinds(string? kinds)
    {
        if (string.IsNullOrWhiteSpace(kinds)) return null;
        var set = new HashSet<NodeKind>();
        foreach (var part in kinds.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            set.Add(NodeKindExtensions.ParseWire(part) ?? throw new ValidationException($"Invalid kind '{part}'."));
        return set.Count == 0 ? null : set;
    }

    private static string EscapeLike(string s) => s.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");

    private sealed record Candidate(Node Node, string? Alias, double Score);

    private sealed class MatchRow
    {
        [Column("node")] public Guid Node { get; set; }
        [Column("alias")] public string? Alias { get; set; }
        [Column("score")] public double Score { get; set; }
    }
}

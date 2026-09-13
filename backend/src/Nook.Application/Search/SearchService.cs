using System.Net;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Knowledge;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Enums;

namespace Nook.Application.Search;

/// <summary>
/// Contracts §9.5 full-text search over titles, aliases, <c>blocks.plain_text</c> and (opt-in) <c>attachments.extracted_text</c>,
/// both <c>russian</c> and <c>english</c> configurations, ranked by <c>ts_rank_cd</c> + trigram title boost, one hit per node.
/// </summary>
public sealed class SearchService(
    IAppDbContext db,
    IWorkspaceContextAccessor contextAccessor,
    NodeAccess access,
    NodeVisibility visibility,
    BreadcrumbService breadcrumbs)
{
    public const int DefaultLimit = 20;
    public const int MaxLimit = 100;
    public const int SnippetLength = 300;
    private const string HeadlineOptions = "StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=12, MaxFragments=2, FragmentDelimiter=\" ... \"";
    private const string MarkOpen = "";
    private const string MarkClose = "";

    /// <summary>Whether <c>attachments.extracted_text</c> exists (added by the files workstream); probed once per process.</summary>

    public async Task<SearchResponse> SearchAsync(SearchRequest request, CancellationToken ct)
    {
        var ctx = contextAccessor.Required;
        var parsed = SearchQueryParser.Parse(request.Query);
        var limit = Math.Clamp(request.Limit ?? DefaultLimit, 1, MaxLimit);
        if (request.Cursor is { Length: > 0 } && Cursor.DecodeOffset(request.Cursor) is null) throw new ValidationException("Invalid cursor.");
        var offset = Cursor.DecodeOffset(request.Cursor) ?? 0;
        if (parsed.IsEmpty) return new SearchResponse([], null, 0);

        var f = request.Filters;
        var titleOnly = f?.TitleOnly == true;
        var includeFiles = f?.IncludeFiles == true;
        var perBlock = f?.PerBlock == true && !titleOnly;
        var sort = request.Sort?.ToLowerInvariant() switch
        {
            null or "" or "relevance" => "relevance",
            "updated" => "updated",
            "created" => "created",
            _ => throw new ValidationException("sort must be relevance|updated|created."),
        };
        var kinds = f?.Kinds is { Length: > 0 }
            ? f.Kinds.Select(k => NodeKindExtensions.ParseWire(k)?.ToWire() ?? throw new ValidationException($"Invalid kind '{k}'.")).Distinct().ToArray()
            : null;

        var visible = await visibility.VisibleIdsAsync(ct);
        if (visible is { Count: 0 }) return new SearchResponse([], null, 0);
        if (request.Scope?.AncestorId is { } ancestorId && !await db.Nodes.AsNoTracking().AnyAsync(n => n.Id == ancestorId && n.WorkspaceId == ctx.WorkspaceId && n.DeletedAt == null, ct))
            throw new NotFoundException("Ancestor not found.");

        var rawText = parsed.Raw.Length > 0 ? parsed.Raw : string.Join(' ', parsed.TitleTerms);
        var p = new Dictionary<string, object?>
        {
            ["ws"] = ctx.WorkspaceId,
            ["q"] = parsed.TsQuery,
            ["raw"] = rawText,
            ["rawLike"] = "%" + EscapeLike(rawText) + "%",
            ["opts"] = HeadlineOptions,
            ["limit"] = limit,
            ["offset"] = offset,
        };
        var hasQ = parsed.HasContentQuery;
        var hasExclusions = parsed.Excluded.Count > 0;

        var sql = new StringBuilder();
        sql.Append("WITH RECURSIVE q AS (SELECT to_tsquery('russian', @q) AS ru, to_tsquery('english', @q) AS en");
        if (hasExclusions)
        {
            // `-term` excludes the whole node, not just the field that matched, so the exclusion is applied to the
            // candidate set (title, aliases and any block) rather than only inside the positive tsquery.
            p["qneg"] = string.Join(" | ", parsed.Excluded.Select(t => $"'{t}'"));
            sql.Append(", to_tsquery('russian', @qneg) AS neg_ru, to_tsquery('english', @qneg) AS neg_en");
        }
        sql.Append("),\n");
        if (request.Scope?.AncestorId is { } anc)
        {
            p["ancestor"] = anc;
            sql.Append("scope AS (SELECT id FROM nodes WHERE id = @ancestor AND workspace_id = @ws UNION ALL SELECT n.id FROM nodes n JOIN scope s ON n.parent_id = s.id WHERE n.workspace_id = @ws),\n");
        }

        sql.Append("cand AS (SELECT n.id, n.title, n.updated_at, n.created_at FROM nodes n WHERE n.workspace_id = @ws AND n.deleted_at IS NULL");
        if (f?.IncludeArchived != true) sql.Append(" AND n.archived_at IS NULL");
        if (kinds is not null) { p["kinds"] = kinds; sql.Append(" AND n.kind::text = ANY(@kinds)"); }
        if (visible is not null) { p["visible"] = visible.ToArray(); sql.Append(" AND n.id = ANY(@visible)"); }
        if (request.Scope?.AncestorId is not null) sql.Append(" AND n.id IN (SELECT id FROM scope)");
        if (f?.CreatedFrom is { } cf) { p["createdFrom"] = cf.ToUniversalTime(); sql.Append(" AND n.created_at >= @createdFrom"); }
        if (f?.CreatedTo is { } cto) { p["createdTo"] = cto.ToUniversalTime(); sql.Append(" AND n.created_at <= @createdTo"); }
        if (f?.UpdatedFrom is { } uf) { p["updatedFrom"] = uf.ToUniversalTime(); sql.Append(" AND n.updated_at >= @updatedFrom"); }
        if (f?.UpdatedTo is { } uto) { p["updatedTo"] = uto.ToUniversalTime(); sql.Append(" AND n.updated_at <= @updatedTo"); }
        if (f?.TagIds is { Length: > 0 } tagIds) { p["tagIds"] = tagIds.Distinct().ToArray(); sql.Append(" AND EXISTS (SELECT 1 FROM node_tags nt WHERE nt.node_id = n.id AND nt.tag_id = ANY(@tagIds))"); }
        if (parsed.TitleTerms.Count > 0) { p["titleLike"] = parsed.TitleTerms.Select(t => "%" + EscapeLike(t) + "%").ToArray(); sql.Append(" AND n.title ILIKE ALL(@titleLike)"); }
        if (hasExclusions)
        {
            sql.Append(
                " AND NOT EXISTS (SELECT 1 FROM q qn WHERE to_tsvector('russian', n.title) @@ qn.neg_ru OR to_tsvector('english', n.title) @@ qn.neg_en" +
                " OR EXISTS (SELECT 1 FROM blocks b WHERE b.node_id = n.id AND (b.text_ru @@ qn.neg_ru OR b.text_en @@ qn.neg_en))" +
                " OR EXISTS (SELECT 1 FROM aliases a WHERE a.node_id = n.id AND (to_tsvector('russian', a.alias) @@ qn.neg_ru OR to_tsvector('english', a.alias) @@ qn.neg_en)))");
        }
        sql.Append("),\n");

        sql.Append("hits AS (\n");
        if (hasQ)
        {
            sql.Append(
                "SELECT c.id AS node_id, NULL::uuid AS block_id, NULL::uuid AS attachment_id, 'title' AS matched_in, c.title AS text,\n" +
                "       ts_rank_cd(to_tsvector('russian', c.title), q.ru) + ts_rank_cd(to_tsvector('english', c.title), q.en) + similarity(c.title, @raw) * 2 + 1.0 AS score\n" +
                "FROM cand c, q\n" +
                "WHERE to_tsvector('russian', c.title) @@ q.ru OR to_tsvector('english', c.title) @@ q.en OR c.title ILIKE @rawLike\n" +
                "UNION ALL\n" +
                "SELECT c.id, NULL::uuid, NULL::uuid, 'alias', a.alias,\n" +
                "       ts_rank_cd(to_tsvector('russian', a.alias), q.ru) + ts_rank_cd(to_tsvector('english', a.alias), q.en) + similarity(a.alias, @raw) * 2 + 0.5\n" +
                "FROM cand c JOIN aliases a ON a.node_id = c.id, q\n" +
                "WHERE to_tsvector('russian', a.alias) @@ q.ru OR to_tsvector('english', a.alias) @@ q.en OR a.alias ILIKE @rawLike\n");
            if (!titleOnly)
            {
                sql.Append(
                    "UNION ALL\n" +
                    "SELECT c.id, b.id, NULL::uuid, 'content', b.plain_text,\n" +
                    "       ts_rank_cd(b.text_ru, q.ru) + ts_rank_cd(b.text_en, q.en)\n" +
                    "FROM cand c JOIN blocks b ON b.node_id = c.id, q\n" +
                    "WHERE b.text_ru @@ q.ru OR b.text_en @@ q.en\n");
                if (includeFiles)
                {
                    sql.Append(
                        "UNION ALL\n" +
                        "SELECT c.id, at.block_id, at.id, 'file', at.extracted_text,\n" +
                        "       ts_rank_cd(to_tsvector('russian', at.extracted_text), q.ru) + ts_rank_cd(to_tsvector('english', at.extracted_text), q.en)\n" +
                        "FROM cand c JOIN attachments at ON at.node_id = c.id, q\n" +
                        "WHERE at.extracted_text IS NOT NULL AND (to_tsvector('russian', at.extracted_text) @@ q.ru OR to_tsvector('english', at.extracted_text) @@ q.en)\n");
                }
            }
        }
        else
        {
            // Only title: terms -> every candidate (already filtered by ILIKE ALL) is a title hit.
            sql.Append(
                "SELECT c.id AS node_id, NULL::uuid AS block_id, NULL::uuid AS attachment_id, 'title' AS matched_in, c.title AS text,\n" +
                "       similarity(c.title, @raw) * 2 + 1.0 AS score\n" +
                "FROM cand c\n");
        }
        sql.Append("),\n");

        sql.Append(perBlock
            ? "best AS (SELECT * FROM hits),\n"
            : "best AS (SELECT DISTINCT ON (node_id) * FROM hits ORDER BY node_id, score DESC, block_id),\n");

        var order = sort switch
        {
            "updated" => "c.updated_at DESC, b.score DESC, b.node_id, b.block_id",
            "created" => "c.created_at DESC, b.score DESC, b.node_id, b.block_id",
            _ => "b.score DESC, c.updated_at DESC, b.node_id, b.block_id",
        };
        sql.Append(
            "page AS (\n" +
            "  SELECT b.node_id, b.block_id, b.attachment_id, b.matched_in, b.text, b.score, count(*) OVER () AS total\n" +
            "  FROM best b JOIN cand c ON c.id = b.node_id\n" +
            $"  ORDER BY {order}\n" +
            "  LIMIT @limit OFFSET @offset\n" +
            ")\n" +
            "SELECT p.node_id, p.block_id, p.attachment_id, p.matched_in, p.score::float8, p.total::int,\n");
        sql.Append(hasQ
            ? "  CASE WHEN to_tsvector('russian', p.text) @@ q.ru THEN ts_headline('russian', p.text, q.ru, @opts)\n" +
              "       WHEN to_tsvector('english', p.text) @@ q.en THEN ts_headline('english', p.text, q.en, @opts)\n" +
              "       ELSE left(p.text, 300) END AS snippet\n" +
              "FROM page p, q"
            : "  left(p.text, 300) AS snippet\nFROM page p");

        var rows = await SqlReader.QueryAsync(db, sql.ToString(), p,
            r => new Row(r.GetGuid(0), r.GetGuidOrNull(1), r.GetGuidOrNull(2), r.GetString(3), r.GetDouble(4), r.GetInt32(5), r.GetStringOrNull(6) ?? ""),
            ct);
        if (rows.Count == 0) return new SearchResponse([], null, 0);

        var total = rows[0].Total;
        var nodeIds = rows.Select(r => r.NodeId).Distinct().ToArray();
        var nodeMap = await db.Nodes.AsNoTracking().Where(n => nodeIds.Contains(n.Id)).ToDictionaryAsync(n => n.Id, ct);
        var crumbs = await breadcrumbs.ForNodesAsync(nodeIds, ct);
        var attachmentIds = rows.Where(r => r.AttachmentId is not null).Select(r => r.AttachmentId!.Value).Distinct().ToArray();
        var attachments = attachmentIds.Length == 0
            ? new Dictionary<Guid, SearchAttachmentDto>()
            : await db.Attachments.AsNoTracking().Where(a => attachmentIds.Contains(a.Id))
                .Select(a => new SearchAttachmentDto(a.Id, a.NodeId, a.BlockId, a.PropertyId, a.Filename, a.Mime, a.Size, a.BlobSha,
                    "/api/files/" + a.Id, a.Mime.StartsWith("image/") ? "/api/files/" + a.Id + "/thumb" : null, a.Meta, a.CreatedAt))
                .ToDictionaryAsync(a => a.Id, ct);

        var hits = new List<SearchHitDto>(rows.Count);
        foreach (var r in rows)
        {
            if (!nodeMap.TryGetValue(r.NodeId, out var node)) continue;
            access.Remember(node);
            var role = await access.EffectiveRoleAsync(node, ct);
            hits.Add(new SearchHitDto(
                NodeDto.From(node, role),
                crumbs.GetValueOrDefault(r.NodeId) ?? [],
                r.BlockId,
                r.AttachmentId is { } aid ? attachments.GetValueOrDefault(aid) : null,
                CleanSnippet(r.Snippet),
                Math.Round(r.Score, 4),
                r.MatchedIn));
        }
        var next = offset + rows.Count < total ? Cursor.EncodeOffset(offset + rows.Count) : null;
        return new SearchResponse(hits, next, total);
    }

    private sealed record Row(Guid NodeId, Guid? BlockId, Guid? AttachmentId, string MatchedIn, double Score, int Total, string Snippet);

    /// <summary>HTML-escapes the snippet (only <c>&lt;mark&gt;</c> survives) and trims it to <see cref="SnippetLength"/> chars.</summary>
    public static string CleanSnippet(string headline)
    {
        var text = headline.Replace("\r", "").Replace('\n', ' ');
        text = text.Replace("<mark>", MarkOpen).Replace("</mark>", MarkClose);
        text = WebUtility.HtmlEncode(text);
        if (text.Length > SnippetLength)
        {
            text = text[..SnippetLength].TrimEnd() + "...";
            var lastOpen = text.LastIndexOf(MarkOpen, StringComparison.Ordinal);
            var lastClose = text.LastIndexOf(MarkClose, StringComparison.Ordinal);
            if (lastOpen > lastClose) text += MarkClose;
        }
        return text.Replace(MarkOpen, "<mark>").Replace(MarkClose, "</mark>");
    }

    private static string EscapeLike(string s) => s.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
}

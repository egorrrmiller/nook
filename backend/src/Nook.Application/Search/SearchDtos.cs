using System.Text.Json;
using Nook.Application.Contracts;
using Nook.Application.Knowledge;

namespace Nook.Application.Search;

/// <summary>Contracts §9.5 <c>POST /search</c>.</summary>
public sealed record SearchRequest(
    string Query,
    SearchScope? Scope,
    SearchFilters? Filters,
    string? Sort,
    int? Limit,
    string? Cursor);

public sealed record SearchScope(Guid? AncestorId);

public sealed record SearchFilters(
    bool? TitleOnly,
    string[]? Kinds,
    Guid[]? TagIds,
    DateTimeOffset? CreatedFrom,
    DateTimeOffset? CreatedTo,
    DateTimeOffset? UpdatedFrom,
    DateTimeOffset? UpdatedTo,
    bool? IncludeArchived,
    bool? IncludeFiles,
    /// <summary>Optional extension: one hit per matching block instead of one per node.</summary>
    bool? PerBlock);

public sealed record SearchResponse(IReadOnlyList<SearchHitDto> Hits, string? NextCursor, int Total);

/// <summary><see cref="MatchedIn"/>: <c>title</c> | <c>content</c> | <c>file</c> | <c>alias</c>.</summary>
public sealed record SearchHitDto(
    NodeDto Node,
    IReadOnlyList<NodeSummaryDto> Breadcrumb,
    Guid? BlockId,
    SearchAttachmentDto? Attachment,
    string Snippet,
    double Score,
    string MatchedIn);

/// <summary>Minimal §8 <c>Attachment</c> shape for file hits (built from the <c>attachments</c> table; <c>purpose</c>/<c>meta</c> as stored).</summary>
public sealed record SearchAttachmentDto(
    Guid Id,
    Guid NodeId,
    Guid? BlockId,
    string? PropertyId,
    string Filename,
    string Mime,
    long Size,
    string Sha256,
    string Url,
    string? ThumbUrl,
    JsonElement? Meta,
    DateTimeOffset CreatedAt);

using Nook.Application.Knowledge;

namespace Nook.Application.Links;

/// <summary>Contracts §9.1 <c>GET /nodes/{id}/backlinks</c>.</summary>
public sealed record BacklinkDto(NodeSummaryDto SourceNode, Guid? BlockId, string Kind, string Snippet);

/// <summary>Contracts §9.1 <c>GET /nodes/{id}/links</c>.</summary>
public sealed record OutgoingLinkDto(NodeSummaryDto? TargetNode, Guid? TargetBlockId, string Kind, string? Href, bool Broken);

/// <summary>Contracts §9.1 <c>GET /links/broken</c>.</summary>
public sealed record BrokenLinkDto(NodeSummaryDto SourceNode, Guid BlockId, string? Href, Guid? TargetNodeId);

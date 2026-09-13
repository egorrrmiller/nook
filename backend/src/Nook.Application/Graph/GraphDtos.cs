using Nook.Domain.ValueObjects;

namespace Nook.Application.Graph;

/// <summary>Contracts §9.6 <c>GET /graph</c>.</summary>
public sealed record GraphResponse(IReadOnlyList<GraphNodeDto> Nodes, IReadOnlyList<GraphEdgeDto> Edges, bool Truncated);

public sealed record GraphNodeDto(Guid Id, string Title, NodeIcon? Icon, string Kind, int Degree, IReadOnlyList<Guid>? TagIds);

/// <summary><see cref="Kind"/> is a <c>LinkKind</c> wire value, <c>"tag"</c> or <c>"parent"</c>.</summary>
public sealed record GraphEdgeDto(Guid Source, Guid Target, string Kind);

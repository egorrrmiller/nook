using Nook.Application.Contracts;
using Nook.Application.Nodes;

namespace Nook.Application.Search;

/// <summary>Contracts §7.4.</summary>
public sealed record QuickHit(NodeDto Node, IReadOnlyList<NodeSummary> Breadcrumb, string? MatchedAlias, double Score);

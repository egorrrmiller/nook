using Nook.Application.Contracts;

namespace Nook.Application.Recents;

/// <summary>Contracts §7.3.</summary>
public sealed record RecentDto(NodeDto Node, DateTimeOffset VisitedAt);

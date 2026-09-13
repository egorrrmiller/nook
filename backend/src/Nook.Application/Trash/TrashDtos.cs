using Nook.Application.Contracts;
using Nook.Application.Nodes;

namespace Nook.Application.Trash;

/// <summary>Contracts §7.2.</summary>
public sealed record TrashItem(NodeDto Node, DateTimeOffset DeletedAt, NodeSummary? OriginalParent, IReadOnlyList<NodeSummary> Breadcrumb);

public sealed record RestoreNodeRequest(Guid? ParentId);

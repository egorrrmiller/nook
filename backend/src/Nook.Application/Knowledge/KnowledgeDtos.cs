using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Domain.ValueObjects;

namespace Nook.Application.Knowledge;

/// <summary>Contracts "Shared shapes": <c>NodeSummary = { id, title, icon?, kind, parentId? }</c>. A breadcrumb is a list of these (root → parent, self excluded).</summary>
public sealed record NodeSummaryDto(Guid Id, string Title, NodeIcon? Icon, string Kind, Guid? ParentId)
{
    public static NodeSummaryDto From(Node n) => new(n.Id, n.Title, n.Icon, n.Kind.ToWire(), n.ParentId);
}

using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Domain.ValueObjects;

namespace Nook.Application.Nodes;

/// <summary>Contracts "Shared shapes": a light node reference used by breadcrumbs, trash items and link/tag payloads.</summary>
public sealed record NodeSummary(Guid Id, string Title, NodeIcon? Icon, string Kind, Guid? ParentId)
{
    public static NodeSummary From(Node n) => new(n.Id, n.Title, n.Icon, n.Kind.ToWire(), n.ParentId);
}

/// <summary>Contracts §7.1: <c>POST /nodes/{id}/duplicate</c> body.</summary>
public sealed record DuplicateNodeRequest(Guid? ParentId, string? Position);

/// <summary>Contracts §7.1: <c>PATCH /nodes/{id}</c> accepts <c>Partial&lt;PageSettings&gt;</c> — every field optional, merged into the stored settings.</summary>
public sealed record PageSettingsPatch(string? Font, bool? SmallText, bool? FullWidth, bool? Locked)
{
    public static readonly HashSet<string> Fonts = ["default", "serif", "mono"];

    public PageSettings ApplyTo(PageSettings? current)
    {
        var c = current ?? PageSettings.Default;
        return c with
        {
            Font = Font ?? c.Font,
            SmallText = SmallText ?? c.SmallText,
            FullWidth = FullWidth ?? c.FullWidth,
            Locked = Locked ?? c.Locked,
        };
    }
}

using Nook.Application.Contracts;
using Nook.Domain.Entities;

namespace Nook.Application.Tags;

/// <summary>Contracts §9.2 <c>Tag = { id, name, color?, count }</c>; <see cref="Source"/> is filled by <c>GET /nodes/{id}/tags</c> (<c>manual</c> | <c>inline</c> | <c>manual,inline</c>).</summary>
public sealed record TagDto(Guid Id, string Name, string? Color, int Count, string? Source = null)
{
    public static TagDto From(Tag t, int count, string? source = null) => new(t.Id, t.Name, t.Color, count, source);
}

public sealed record CreateTagRequest(string Name, string? Color);

public sealed record PatchTagRequest(string? Name, string? Color);

/// <summary><c>PUT /nodes/{id}/tags</c>: replaces the manual set; unknown <see cref="Names"/> are created.</summary>
public sealed record SetNodeTagsRequest(Guid[]? TagIds, string[]? Names);

public sealed record TagNodesPage(IReadOnlyList<NodeDto> Items, string? NextCursor);

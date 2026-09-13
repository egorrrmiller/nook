using System.Text.Json;
using Nook.Application.Knowledge;

namespace Nook.Application.History;

/// <summary>Contracts §9.7 <c>Version</c>.</summary>
public sealed record VersionDto(Guid Id, int Version, DateTimeOffset TakenAt, VersionUserDto? User, string Title, int BlockCount, string Kind);

public sealed record VersionUserDto(Guid Id, string DisplayName);

public sealed record VersionListResponse(IReadOnlyList<VersionDto> Items, string? NextCursor);

public sealed record VersionContentResponse(string Title, JsonElement Blocks, DateTimeOffset TakenAt, VersionUserDto? User);

public sealed record RestoreResponse(int Version);

/// <summary><c>GET /nodes/{id}/blocks</c>.</summary>
public sealed record NodeBlocksResponse(string Title, JsonElement Blocks, int Version);

/// <summary><c>GET /blocks/{blockId}</c>.</summary>
public sealed record BlockAnchorResponse(Guid NodeId, JsonElement Block, IReadOnlyList<NodeSummaryDto> Breadcrumb);

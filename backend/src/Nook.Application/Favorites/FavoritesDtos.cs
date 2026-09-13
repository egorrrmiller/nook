using Nook.Application.Contracts;

namespace Nook.Application.Favorites;

/// <summary>Contracts §7.3.</summary>
public sealed record FavoriteDto(Guid NodeId, string Position, NodeDto Node);

public sealed record PutFavoriteRequest(string? Position);

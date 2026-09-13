using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Application.Favorites;

namespace Nook.Api.Endpoints;

/// <summary>Contracts §7.3 (favorites).</summary>
public static class FavoriteEndpoints
{
    public static RouteGroupBuilder MapFavoriteEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/favorites").WithTags("Favorites").AddEndpointFilter<WorkspaceContextFilter>();

        g.MapGet("/", async Task<Ok<IReadOnlyList<FavoriteDto>>> (FavoriteService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ListAsync(ct)))
            .WithName("ListFavorites")
            .WithDescription("The caller's favorites in this workspace, ordered by position (fractional index).");

        g.MapPut("/{nodeId:guid}", async Task<Ok<FavoriteDto>> (Guid nodeId, PutFavoriteRequest? request, FavoriteService service, CancellationToken ct) =>
                TypedResults.Ok(await service.PutAsync(nodeId, request ?? new PutFavoriteRequest(null), ct)))
            .WithName("PutFavorite")
            .WithDescription("Idempotent. `position` omitted = append (or keep the current position when already a favorite).");

        g.MapDelete("/{nodeId:guid}", async Task<NoContent> (Guid nodeId, FavoriteService service, CancellationToken ct) =>
            {
                await service.DeleteAsync(nodeId, ct);
                return TypedResults.NoContent();
            })
            .WithName("DeleteFavorite");

        return api;
    }
}

using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Application.Recents;

namespace Nook.Api.Endpoints;

/// <summary>Contracts §7.3 (recents).</summary>
public static class RecentEndpoints
{
    public static RouteGroupBuilder MapRecentEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/recents").WithTags("Recents").AddEndpointFilter<WorkspaceContextFilter>();

        g.MapGet("/", async Task<Ok<IReadOnlyList<RecentDto>>> (int? limit, RecentService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ListAsync(limit, ct)))
            .WithName("ListRecents")
            .WithDescription("Newest first; trashed nodes excluded. `limit` defaults to 20 (max 100).");

        g.MapPost("/{nodeId:guid}", async Task<NoContent> (Guid nodeId, RecentService service, CancellationToken ct) =>
            {
                await service.RecordAsync(nodeId, ct);
                return TypedResults.NoContent();
            })
            .WithName("RecordRecent")
            .WithDescription("Records a visit; the server keeps the last 100 per user and workspace.");

        return api;
    }
}

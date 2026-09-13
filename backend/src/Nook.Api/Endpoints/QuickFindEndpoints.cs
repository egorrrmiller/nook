using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Application.Search;

namespace Nook.Api.Endpoints;

/// <summary>Contracts §7.4: <c>GET /api/search/quick</c>.</summary>
public static class QuickFindEndpoints
{
    public static RouteGroupBuilder MapQuickFindEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/search").WithTags("Search").AddEndpointFilter<WorkspaceContextFilter>();

        g.MapGet("/quick", async Task<Ok<IReadOnlyList<QuickHit>>> (string? q, int? limit, string? kinds, QuickFindService service, CancellationToken ct) =>
                TypedResults.Ok(await service.SearchAsync(q, limit, kinds, ct)))
            .WithName("QuickFind")
            .WithDescription("Title + alias lookup: exact > prefix > trigram similarity (pg_trgm, threshold 0.2). Trashed excluded, archived last. Empty `q` = most recently updated pages. `kinds` = comma-separated NodeKind list.");

        return api;
    }
}

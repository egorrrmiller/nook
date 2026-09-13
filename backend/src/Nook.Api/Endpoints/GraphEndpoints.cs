using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Application.Graph;

namespace Nook.Api.Endpoints;

/// <summary>Contracts §9.6 the knowledge graph.</summary>
public static class GraphEndpoints
{
    public static RouteGroupBuilder MapGraphEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/graph", async Task<Ok<GraphResponse>> (Guid? rootId, int? depth, bool? includeTags, GraphService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetAsync(rootId, depth, includeTags ?? false, ct)))
            .WithTags("Graph")
            .WithName("GetGraph")
            .WithDescription("Link + parent edges for the workspace (capped at 2000 nodes; truncated=true when capped).")
            .AddEndpointFilter<WorkspaceContextFilter>();
        return api;
    }
}

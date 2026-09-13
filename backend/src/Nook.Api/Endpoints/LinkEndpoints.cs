using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Application.Links;

namespace Nook.Api.Endpoints;

/// <summary>Contracts §9.1: backlinks, outgoing links, broken links.</summary>
public static class LinkEndpoints
{
    public static RouteGroupBuilder MapLinkEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/").WithTags("Links").AddEndpointFilter<WorkspaceContextFilter>();

        g.MapGet("/nodes/{id:guid}/backlinks", async Task<Ok<IReadOnlyList<BacklinkDto>>> (Guid id, LinkService service, CancellationToken ct) =>
                TypedResults.Ok(await service.BacklinksAsync(id, ct)))
            .WithName("GetBacklinks")
            .WithDescription("Links pointing at this page, including unresolved [[wikilinks]] that match its title or aliases.");

        g.MapGet("/nodes/{id:guid}/links", async Task<Ok<IReadOnlyList<OutgoingLinkDto>>> (Guid id, LinkService service, CancellationToken ct) =>
                TypedResults.Ok(await service.LinksAsync(id, ct)))
            .WithName("GetOutgoingLinks");

        g.MapGet("/links/broken", async Task<Ok<IReadOnlyList<BrokenLinkDto>>> (int? limit, LinkService service, CancellationToken ct) =>
                TypedResults.Ok(await service.BrokenAsync(limit, ct)))
            .WithName("GetBrokenLinks");

        return api;
    }
}

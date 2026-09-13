using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Application.Search;

namespace Nook.Api.Endpoints;

/// <summary>Contracts §9.5 full-text search.</summary>
public static class SearchEndpoints
{
    public static RouteGroupBuilder MapSearchEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/search", async Task<Ok<SearchResponse>> (SearchRequest request, SearchService service, CancellationToken ct) =>
                TypedResults.Ok(await service.SearchAsync(request, ct)))
            .WithTags("Search")
            .WithName("Search")
            .WithDescription("""
                Query grammar: terms are AND-ed with prefix matching, "quoted phrase" is a phrase, -term excludes,
                title:foo restricts to titles. Titles, aliases, block text and (includeFiles) extracted file text are
                searched in both the russian and english configurations; results are collapsed to one hit per node.
                """)
            .AddEndpointFilter<WorkspaceContextFilter>();
        return api;
    }
}

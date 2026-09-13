using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Application.Tags;

namespace Nook.Api.Endpoints;

/// <summary>Contracts §9.2: workspace tags and node tags.</summary>
public static class TagEndpoints
{
    public static RouteGroupBuilder MapTagEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/").WithTags("Tags").AddEndpointFilter<WorkspaceContextFilter>();

        g.MapGet("/tags", async Task<Ok<IReadOnlyList<TagDto>>> (TagService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ListAsync(ct)))
            .WithName("ListTags");

        g.MapPost("/tags", async Task<Created<TagDto>> (CreateTagRequest request, TagService service, CancellationToken ct) =>
            {
                var tag = await service.CreateAsync(request, ct);
                return TypedResults.Created($"/api/tags/{tag.Id}", tag);
            })
            .WithName("CreateTag")
            .ProducesProblem(StatusCodes.Status409Conflict);

        g.MapPatch("/tags/{id:guid}", async Task<Ok<TagDto>> (Guid id, PatchTagRequest request, TagService service, CancellationToken ct) =>
                TypedResults.Ok(await service.PatchAsync(id, request, ct)))
            .WithName("PatchTag")
            .ProducesProblem(StatusCodes.Status409Conflict);

        g.MapDelete("/tags/{id:guid}", async Task<NoContent> (Guid id, TagService service, CancellationToken ct) =>
            {
                await service.DeleteAsync(id, ct);
                return TypedResults.NoContent();
            })
            .WithName("DeleteTag");

        g.MapGet("/tags/{id:guid}/nodes", async Task<Ok<TagNodesPage>> (Guid id, int? limit, string? cursor, TagService service, CancellationToken ct) =>
                TypedResults.Ok(await service.NodesAsync(id, limit, cursor, ct)))
            .WithName("ListTagNodes");

        g.MapGet("/nodes/{id:guid}/tags", async Task<Ok<IReadOnlyList<TagDto>>> (Guid id, TagService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ForNodeAsync(id, ct)))
            .WithName("GetNodeTags")
            .WithDescription("Union of manual and inline (#hashtag) tags; each entry carries its source.");

        g.MapPut("/nodes/{id:guid}/tags", async Task<Ok<IReadOnlyList<TagDto>>> (Guid id, SetNodeTagsRequest request, TagService service, CancellationToken ct) =>
                TypedResults.Ok(await service.SetManualAsync(id, request, ct)))
            .WithName("SetNodeTags")
            .WithDescription("Replaces the manual tag set; inline tags collected from the document text are untouched.");

        return api;
    }
}

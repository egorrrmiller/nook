using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Application.Contracts;
using Nook.Application.Trash;

namespace Nook.Api.Endpoints;

/// <summary>Contracts §7.2.</summary>
public static class TrashEndpoints
{
    public static RouteGroupBuilder MapTrashEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/trash").WithTags("Trash").AddEndpointFilter<WorkspaceContextFilter>();

        g.MapGet("/", async Task<Ok<IReadOnlyList<TrashItem>>> (string? q, int? limit, TrashService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ListAsync(q, limit, ct)))
            .WithName("ListTrash")
            .WithDescription("Trashed subtree roots, newest first. `q` filters by title (ci substring), `limit` defaults to 50 (max 200).");

        g.MapPost("/{id:guid}/restore", async Task<Ok<NodeDto>> (Guid id, RestoreNodeRequest? request, TrashService service, CancellationToken ct) =>
                TypedResults.Ok(await service.RestoreAsync(id, request ?? new RestoreNodeRequest(null), ct)))
            .WithName("RestoreNode")
            .WithDescription("Restores the subtree. Target = parentId ?? original parent if alive ?? workspace root.");

        g.MapDelete("/{id:guid}", async Task<NoContent> (Guid id, TrashService service, CancellationToken ct) =>
            {
                await service.PurgeAsync(id, ct);
                return TypedResults.NoContent();
            })
            .WithName("PurgeNode")
            .WithDescription("Permanently deletes the trashed subtree (nodes, documents, updates, blocks, links, snapshots, attachment rows).");

        g.MapDelete("/", async Task<NoContent> (TrashService service, CancellationToken ct) =>
            {
                await service.EmptyAsync(ct);
                return TypedResults.NoContent();
            })
            .WithName("EmptyTrash")
            .WithDescription("Permanently deletes everything in the trash the caller may edit.");

        return api;
    }
}

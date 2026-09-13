using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Application.History;

namespace Nook.Api.Endpoints;

/// <summary>Contracts §9.7 page history and block reads.</summary>
public static class HistoryEndpoints
{
    public static RouteGroupBuilder MapHistoryEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/").WithTags("History").AddEndpointFilter<WorkspaceContextFilter>();

        g.MapGet("/nodes/{id:guid}/history", async Task<Ok<VersionListResponse>> (Guid id, int? limit, string? cursor, HistoryService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ListAsync(id, limit, cursor, ct)))
            .WithName("ListNodeHistory");

        g.MapGet("/nodes/{id:guid}/history/{versionId:guid}", async Task<Ok<VersionContentResponse>> (Guid id, Guid versionId, HistoryService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetAsync(id, versionId, ct)))
            .WithName("GetNodeVersion");

        g.MapPost("/nodes/{id:guid}/history", async Task<Created<VersionDto>> (Guid id, HistoryService service, CancellationToken ct) =>
            {
                var version = await service.CreateManualAsync(id, ct);
                return TypedResults.Created($"/api/nodes/{id}/history/{version.Id}", version);
            })
            .WithName("CreateNodeVersion")
            .WithDescription("Manual \"Save version\": snapshots the current block projection.");

        g.MapPost("/nodes/{id:guid}/history/{versionId:guid}/restore", async Task<Ok<RestoreResponse>> (Guid id, Guid versionId, HistoryService service, CancellationToken ct) =>
                TypedResults.Ok(await service.RestoreAsync(id, versionId, ct)))
            .WithName("RestoreNodeVersion")
            .WithDescription("Snapshots the current state as kind \"pre-restore\", then replaces the live document with the chosen version.");

        g.MapGet("/nodes/{id:guid}/blocks", async Task<Ok<NodeBlocksResponse>> (Guid id, HistoryService service, CancellationToken ct) =>
                TypedResults.Ok(await service.BlocksAsync(id, ct)))
            .WithName("GetNodeBlocks")
            .WithDescription("Current block projection rebuilt as a tree (read-only rendering, embeds, previews).");

        g.MapGet("/blocks/{blockId:guid}", async Task<Ok<BlockAnchorResponse>> (Guid blockId, HistoryService service, CancellationToken ct) =>
                TypedResults.Ok(await service.BlockAsync(blockId, ct)))
            .WithName("GetBlock");

        return api;
    }
}

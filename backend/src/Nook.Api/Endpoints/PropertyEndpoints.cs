using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Application.Properties;

namespace Nook.Api.Endpoints;

/// <summary>Contracts §9.3 page properties and §9.4 aliases.</summary>
public static class PropertyEndpoints
{
    public static RouteGroupBuilder MapPropertyEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/nodes/{id:guid}").WithTags("Properties").AddEndpointFilter<WorkspaceContextFilter>();

        g.MapGet("/properties", async Task<Ok<JsonElement>> (Guid id, PropertyService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetAsync(id, ct)))
            .WithName("GetNodeProperties");

        g.MapPut("/properties", async Task<Ok<JsonElement>> (Guid id, JsonElement body, PropertyService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ReplaceAsync(id, body, ct)))
            .WithName("SetNodeProperties")
            .WithDescription("Replaces all page properties. Values are validated by type (dates must be ISO-8601).");

        g.MapPatch("/properties", async Task<Ok<JsonElement>> (Guid id, JsonElement body, PropertyService service, CancellationToken ct) =>
                TypedResults.Ok(await service.MergeAsync(id, body, ct)))
            .WithName("PatchNodeProperties")
            .WithDescription("Merges the given properties; a null value removes that property.");

        g.MapGet("/aliases", async Task<Ok<IReadOnlyList<string>>> (Guid id, AliasService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetAsync(id, ct)))
            .WithName("GetNodeAliases");

        g.MapPut("/aliases", async Task<Ok<IReadOnlyList<string>>> (Guid id, SetAliasesRequest request, AliasService service, CancellationToken ct) =>
                TypedResults.Ok(await service.SetAsync(id, request, ct)))
            .WithName("SetNodeAliases")
            .WithDescription("Aliases are unique (case-insensitive) per workspace; 409 carries the conflicting node id.")
            .ProducesProblem(StatusCodes.Status409Conflict);

        return api;
    }
}

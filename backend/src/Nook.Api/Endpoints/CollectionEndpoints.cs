using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Application.Collections;

namespace Nook.Api.Endpoints;

/// <summary>Minimal API surface for the Wave 2 collections/databases MVP.</summary>
public static class CollectionEndpoints
{
    public static RouteGroupBuilder MapCollectionEndpoints(this RouteGroupBuilder api)
    {
        var collections = api.MapGroup("/collections").WithTags("Collections").AddEndpointFilter<WorkspaceContextFilter>();

        collections.MapPost("/", async Task<Created<CollectionDto>> (CreateCollectionRequest request, CollectionService service, CancellationToken ct) =>
            {
                var result = await service.CreateCollectionAsync(request, ct);
                return TypedResults.Created($"/api/collections/{result.Id}", result);
            })
            .WithName("CreateCollection")
            .WithDescription("Creates a workspace-scoped reusable collection. A title property is added when omitted.");

        collections.MapGet("/{id:guid}", async Task<Ok<CollectionDto>> (Guid id, CollectionService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetCollectionAsync(id, ct)))
            .WithName("GetCollection");

        collections.MapPatch("/{id:guid}", async Task<Ok<CollectionDto>> (Guid id, PatchCollectionRequest request, CollectionService service, CancellationToken ct) =>
                TypedResults.Ok(await service.PatchCollectionAsync(id, request, ct)))
            .WithName("PatchCollection");

        collections.MapPut("/{id:guid}/schema", async Task<Ok<CollectionDto>> (Guid id, UpdateCollectionSchemaRequest request, CollectionService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ReplaceSchemaAsync(id, request, ct)))
            .WithName("ReplaceCollectionSchema")
            .WithDescription("Replaces schema after checking that existing row values remain valid.");

        collections.MapPost("/{id:guid}/databases", async Task<Created<DatabaseDto>> (Guid id, CreateDatabaseRequest request, CollectionService service, CancellationToken ct) =>
            {
                var result = await service.CreateDatabaseAsync(id, request, ct);
                return TypedResults.Created($"/api/databases/{result.Id}", result);
            })
            .WithName("CreateDatabase");

        var databases = api.MapGroup("/databases").WithTags("Databases").AddEndpointFilter<WorkspaceContextFilter>();

        databases.MapGet("/{id:guid}", async Task<Ok<DatabaseDto>> (Guid id, CollectionService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetDatabaseAsync(id, ct)))
            .WithName("GetDatabase");

        databases.MapGet("/{id:guid}/views", async Task<Ok<IReadOnlyList<CollectionViewDto>>> (Guid id, CollectionService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ListViewsAsync(id, ct)))
            .WithName("ListDatabaseViews");

        databases.MapPost("/{id:guid}/views", async Task<Created<CollectionViewDto>> (Guid id, CreateCollectionViewRequest request, CollectionService service, CancellationToken ct) =>
            {
                var result = await service.CreateViewAsync(id, request, ct);
                return TypedResults.Created($"/api/views/{result.Id}", result);
            })
            .WithName("CreateDatabaseView");

        databases.MapPost("/{id:guid}/rows", async Task<Created<CollectionRowDto>> (Guid id, CreateCollectionRowRequest request, CollectionService service, CancellationToken ct) =>
            {
                var result = await service.CreateRowAsync(id, request, ct);
                return TypedResults.Created($"/api/nodes/{result.Node.Id}", result);
            })
            .WithName("CreateCollectionRow");

        var views = api.MapGroup("/views").WithTags("Database Views").AddEndpointFilter<WorkspaceContextFilter>();

        views.MapGet("/{id:guid}", async Task<Ok<CollectionViewDto>> (Guid id, CollectionService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetViewAsync(id, ct)))
            .WithName("GetDatabaseView");

        views.MapPatch("/{id:guid}", async Task<Ok<CollectionViewDto>> (Guid id, PatchCollectionViewRequest request, CollectionService service, CancellationToken ct) =>
                TypedResults.Ok(await service.PatchViewAsync(id, request, ct)))
            .WithName("PatchDatabaseView");

        views.MapPost("/{id:guid}/query", async Task<Ok<CollectionQueryResponse>> (Guid id, CollectionQueryRequest? request, CollectionService service, CancellationToken ct) =>
                TypedResults.Ok(await service.QueryViewAsync(id, request, ct)))
            .WithName("QueryDatabaseView")
            .WithDescription("Queries a saved view using recursive AND/OR filters, sorts and up to three group levels.");

        views.MapPatch("/rows/{id:guid}", async Task<Ok<CollectionRowDto>> (Guid id, PatchCollectionRowRequest request, CollectionService service, CancellationToken ct) =>
                TypedResults.Ok(await service.PatchRowAsync(id, request, ct)))
            .WithName("PatchCollectionRow");

        return api;
    }
}

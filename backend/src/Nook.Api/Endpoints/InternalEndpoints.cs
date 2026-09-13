using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Application.Contracts;
using Nook.Application.Documents;

namespace Nook.Api.Endpoints;

public static class InternalEndpoints
{
    /// <summary>Collab service ↔ backend. Guarded by <c>X-Internal-Token</c>; must not be exposed through the reverse proxy.</summary>
    public static IEndpointRouteBuilder MapInternalEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/internal").WithTags("Internal").AddEndpointFilter<InternalTokenFilter>().AllowAnonymous();

        g.MapGet("/documents/{nodeId:guid}", async Task<Ok<InternalDocumentResponse>> (Guid nodeId, DocumentStoreService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetAsync(nodeId, ct)))
            .WithName("InternalGetDocument");

        g.MapPut("/documents/{nodeId:guid}", async Task<Ok<InternalDocumentPutResponse>> (Guid nodeId, InternalDocumentPutRequest request, DocumentStoreService service, CancellationToken ct) =>
                TypedResults.Ok(await service.PutAsync(nodeId, request, ct)))
            .WithName("InternalPutDocument")
            .ProducesProblem(StatusCodes.Status409Conflict);

        return app;
    }
}

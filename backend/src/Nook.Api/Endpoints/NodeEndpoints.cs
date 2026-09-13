using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Nodes;
using Nook.Domain.Enums;

namespace Nook.Api.Endpoints;

public static class NodeEndpoints
{
    public static RouteGroupBuilder MapNodeEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/nodes").WithTags("Nodes").AddEndpointFilter<WorkspaceContextFilter>();

        g.MapGet("/", async Task<Ok<IReadOnlyList<NodeDto>>> (Guid? parentId, string? kind, bool? includeArchived, NodeService service, CancellationToken ct) =>
            {
                NodeKind? k = null;
                if (!string.IsNullOrEmpty(kind)) k = NodeKindExtensions.ParseWire(kind) ?? throw new ValidationException("Invalid kind.");
                return TypedResults.Ok(await service.ListAsync(parentId, k, includeArchived ?? false, ct));
            })
            .WithName("ListNodes")
            .WithDescription("Children of parentId (roots when omitted). Archived nodes are hidden unless includeArchived=true; trashed nodes are never listed. Requires the X-Workspace-Id header.");

        // --- wave1: tree (contracts §7.1) ---
        g.MapGet("/{id:guid}/ancestors", async Task<Ok<IReadOnlyList<NodeSummary>>> (Guid id, NodeService service, CancellationToken ct) =>
                TypedResults.Ok(await service.AncestorsAsync(id, ct)))
            .WithName("GetNodeAncestors")
            .WithDescription("Breadcrumb: root → parent (self excluded).");

        g.MapPost("/{id:guid}/duplicate", async Task<Created<NodeDto>> (Guid id, DuplicateNodeRequest? request, HttpContext http, NodeDuplicateService service, CancellationToken ct) =>
            {
                var result = await service.DuplicateAsync(id, request ?? new DuplicateNodeRequest(null, null), ct);
                // RFC 9110 Warning header: 199 = miscellaneous warning (page content could not be copied because collab was unavailable).
                foreach (var w in result.Warnings) http.Response.Headers.Append("Warning", $"199 - \"{w.Replace("\"", "'")}\"");
                return TypedResults.Created($"/api/nodes/{result.Node.Id}", result.Node);
            })
            .WithName("DuplicateNode")
            .WithDescription("Deep-copies the subtree (title of the root gets \" (copy)\"), including page content via the collab service. A `Warning: 199` header is set when content could not be copied.");

        g.MapPost("/{id:guid}/archive", async Task<Ok<NodeDto>> (Guid id, NodeService service, CancellationToken ct) =>
                TypedResults.Ok(await service.SetArchivedAsync(id, true, ct)))
            .WithName("ArchiveNode");

        g.MapPost("/{id:guid}/unarchive", async Task<Ok<NodeDto>> (Guid id, NodeService service, CancellationToken ct) =>
                TypedResults.Ok(await service.SetArchivedAsync(id, false, ct)))
            .WithName("UnarchiveNode");

        g.MapGet("/{id:guid}", async Task<Ok<NodeDto>> (Guid id, NodeService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetAsync(id, ct)))
            .WithName("GetNode");

        g.MapPost("/", async Task<Created<NodeDto>> (CreateNodeRequest request, NodeService service, CancellationToken ct) =>
            {
                var node = await service.CreateAsync(request, ct);
                return TypedResults.Created($"/api/nodes/{node.Id}", node);
            })
            .WithName("CreateNode");

        g.MapPatch("/{id:guid}", async Task<Ok<NodeDto>> (Guid id, PatchNodeRequest request, NodeService service, CancellationToken ct) =>
                TypedResults.Ok(await service.PatchAsync(id, request, ct)))
            .WithName("PatchNode");

        g.MapDelete("/{id:guid}", async Task<NoContent> (Guid id, NodeService service, CancellationToken ct) =>
            {
                await service.DeleteAsync(id, ct);
                return TypedResults.NoContent();
            })
            .WithName("DeleteNode");

        // Node shares (subtree access for other users of the instance).
        g.MapGet("/{id:guid}/shares", async Task<Ok<IReadOnlyList<NodeShareDto>>> (Guid id, NodeService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ListSharesAsync(id, ct)))
            .WithName("ListNodeShares");

        g.MapPost("/{id:guid}/shares", async Task<Created<NodeShareDto>> (Guid id, CreateNodeShareRequest request, NodeService service, CancellationToken ct) =>
            {
                var share = await service.ShareAsync(id, request, ct);
                return TypedResults.Created($"/api/nodes/{id}/shares/{share.UserId}", share);
            })
            .WithName("ShareNode");

        g.MapDelete("/{id:guid}/shares/{userId:guid}", async Task<NoContent> (Guid id, Guid userId, NodeService service, CancellationToken ct) =>
            {
                await service.UnshareAsync(id, userId, ct);
                return TypedResults.NoContent();
            })
            .WithName("UnshareNode");

        return api;
    }
}

using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Application.Collab;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Workspaces;

namespace Nook.Api.Endpoints;

public static class CollabEndpoints
{
    public static RouteGroupBuilder MapCollabEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/collab/token", async Task<Ok<CollabTokenResponse>> (
                Guid nodeId, HttpContext http, CollabTokenService service, IWorkspaceContextAccessor accessor,
                WorkspaceContextResolver resolver, ICurrentUser user, CancellationToken ct) =>
            {
                // Prefer X-Workspace-Id; fall back to the node's own workspace when the header is absent.
                var raw = http.Request.Headers[WorkspaceContextFilter.HeaderName].ToString();
                accessor.Current = Guid.TryParse(raw, out var wsId)
                    ? await resolver.ResolveAsync(user.UserId, wsId, ct)
                    : await resolver.ResolveForNodeAsync(user.UserId, nodeId, ct);
                return TypedResults.Ok(await service.IssueAsync(nodeId, ct));
            })
            .WithTags("Collab")
            .WithName("GetCollabToken");
        return api;
    }
}

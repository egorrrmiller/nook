using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Workspaces;

namespace Nook.Api.Endpoints;

public static class WorkspaceEndpoints
{
    public static RouteGroupBuilder MapWorkspaceEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/workspaces").WithTags("Workspaces");

        g.MapGet("/", async Task<Ok<IReadOnlyList<WorkspaceSummary>>> (WorkspaceService service, ICurrentUser user, CancellationToken ct) =>
                TypedResults.Ok(await service.ListForUserAsync(user.UserId, ct)))
            .WithName("ListWorkspaces");

        g.MapPost("/", async Task<Created<WorkspaceSummary>> (CreateWorkspaceRequest request, WorkspaceService service, CancellationToken ct) =>
            {
                var ws = await service.CreateAsync(request, ct);
                return TypedResults.Created($"/api/workspaces/{ws.Id}", ws);
            })
            .WithName("CreateWorkspace");

        // --- wave1: tree (contracts §7.5) ---
        g.MapPatch("/{id:guid}", async Task<Ok<WorkspaceSummary>> (Guid id, PatchWorkspaceRequest request, WorkspaceService service, CancellationToken ct) =>
                TypedResults.Ok(await service.PatchAsync(id, request, ct)))
            .WithName("PatchWorkspace");

        g.MapDelete("/{id:guid}", async Task<NoContent> (Guid id, WorkspaceService service, CancellationToken ct) =>
            {
                await service.DeleteAsync(id, ct);
                return TypedResults.NoContent();
            })
            .WithName("DeleteWorkspace")
            .WithDescription("Owner only; refuses to delete the caller's personal workspace (400).");

        g.MapGet("/{id:guid}/members", async Task<Ok<IReadOnlyList<WorkspaceMemberDto>>> (Guid id, WorkspaceService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ListMembersAsync(id, ct)))
            .WithName("ListWorkspaceMembers");

        g.MapPost("/{id:guid}/members", async Task<Created<WorkspaceMemberDto>> (Guid id, AddWorkspaceMemberRequest request, WorkspaceService service, CancellationToken ct) =>
            {
                var member = await service.AddMemberAsync(id, request, ct);
                return TypedResults.Created($"/api/workspaces/{id}/members/{member.UserId}", member);
            })
            .WithName("AddWorkspaceMember");

        g.MapDelete("/{id:guid}/members/{userId:guid}", async Task<NoContent> (Guid id, Guid userId, WorkspaceService service, CancellationToken ct) =>
            {
                await service.RemoveMemberAsync(id, userId, ct);
                return TypedResults.NoContent();
            })
            .WithName("RemoveWorkspaceMember");

        return api;
    }
}

using System.Net;
using System.Net.Http.Json;
using Nook.Application.Contracts;

namespace Nook.IntegrationTests;

public class NodeTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    [Fact]
    public async Task Node_crud_within_workspace()
    {
        var client = factory.CreateClient();
        await client.LoginAsOwnerAsync();
        var created = await client.PostAsJsonAsync("/api/workspaces", new { name = "CRUD" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var ws = (await created.Content.ReadFromJsonAsync<WorkspaceSummary>(TestClient.Json))!.Id;
        client.WithWorkspace(ws);

        var root = await client.CreateNodeAsync("Root page");
        Assert.Equal(ws, root.WorkspaceId);
        Assert.Null(root.ParentId);
        Assert.Equal("page", root.Kind);
        Assert.Equal("owner", root.EffectiveRole);
        Assert.Equal("a0", root.Position);
        Assert.NotNull(root.PageSettings);

        var second = await client.CreateNodeAsync("Second");
        Assert.True(string.CompareOrdinal(root.Position, second.Position) < 0);

        var child = await client.CreateNodeAsync("Child", root.Id);
        Assert.Equal(root.Id, child.ParentId);
        var folder = await client.CreateNodeAsync("Folder", root.Id, "folder");
        Assert.Equal("folder", folder.Kind);
        Assert.Equal(root.Id, folder.ParentId);

        var roots = await client.GetJsonAsync<List<NodeDto>>("/api/nodes");
        Assert.Equal([root.Id, second.Id], roots.Select(n => n.Id));
        var children = await client.GetJsonAsync<List<NodeDto>>($"/api/nodes?parentId={root.Id}");
        Assert.Equal([child.Id, folder.Id], children.Select(n => n.Id));
        Assert.Equal([folder.Id], (await client.GetJsonAsync<List<NodeDto>>("/api/nodes?kind=folder")).Select(n => n.Id));

        var fetched = await client.GetJsonAsync<NodeDto>($"/api/nodes/{child.Id}");
        Assert.Equal("Child", fetched.Title);

        var patch = await client.PatchAsJsonAsync($"/api/nodes/{child.Id}", new { title = "Renamed", icon = new { type = "emoji", value = "🦊" } });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        var patched = (await patch.Content.ReadFromJsonAsync<NodeDto>(TestClient.Json))!;
        Assert.Equal("Renamed", patched.Title);
        Assert.Equal("🦊", patched.Icon?.Value);

        // move to the root with explicit null parentId
        var move = await client.PatchAsync($"/api/nodes/{child.Id}", JsonContent.Create(new Dictionary<string, object?> { ["parentId"] = null }));
        Assert.Equal(HttpStatusCode.OK, move.StatusCode);
        var moved = (await move.Content.ReadFromJsonAsync<NodeDto>(TestClient.Json))!;
        Assert.Null(moved.ParentId);
        Assert.True(string.CompareOrdinal(second.Position, moved.Position) < 0);
        Assert.Equal(3, (await client.GetJsonAsync<List<NodeDto>>("/api/nodes")).Count);

        // move back under root with an explicit position
        var back = await client.PatchAsJsonAsync($"/api/nodes/{child.Id}", new { parentId = root.Id, position = "a5" });
        Assert.Equal(HttpStatusCode.OK, back.StatusCode);
        Assert.Equal("a5", (await back.Content.ReadFromJsonAsync<NodeDto>(TestClient.Json))!.Position);

        // cycles and bad input are rejected
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync($"/api/nodes/{root.Id}", new { parentId = child.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync($"/api/nodes/{root.Id}", new { position = "a00" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/nodes", new { kind = "widget" })).StatusCode);

        // soft delete cascades to the subtree
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/nodes/{root.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/nodes/{root.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/nodes/{child.Id}")).StatusCode);
        Assert.Equal([second.Id], (await client.GetJsonAsync<List<NodeDto>>("/api/nodes")).Select(n => n.Id));

        using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Nook.Infrastructure.Persistence.AppDbContext>();
        var deleted = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ToListAsync(db.Nodes.Where(n => n.Id == root.Id || n.Id == child.Id));
        Assert.Equal(2, deleted.Count);
        Assert.All(deleted, n => Assert.NotNull(n.DeletedAt));
    }

    [Fact]
    public async Task Nodes_are_isolated_per_workspace_and_header_is_required()
    {
        var a = factory.CreateClient();
        var authA = await a.LoginAsOwnerAsync();
        var wsA = authA.Workspaces[0].Id;
        a.WithWorkspace(wsA);
        var secret = await a.CreateNodeAsync("A's secret");

        var (b, authB) = await factory.RegisterUserAsync(a, "b@test.local", "B");
        var wsB = authB.Workspaces[0].Id;

        // B is not a member of A's workspace -> 403 on any node call carrying A's workspace
        b.WithWorkspace(wsA);
        Assert.Equal(HttpStatusCode.Forbidden, (await b.GetAsync("/api/nodes")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await b.GetAsync($"/api/nodes/{secret.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await b.PostAsJsonAsync("/api/nodes", new { title = "x" })).StatusCode);

        // A's node does not exist inside B's workspace -> 404 (no leak)
        b.WithWorkspace(wsB);
        Assert.Equal(HttpStatusCode.NotFound, (await b.GetAsync($"/api/nodes/{secret.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.PatchAsJsonAsync($"/api/nodes/{secret.Id}", new { title = "pwned" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.DeleteAsync($"/api/nodes/{secret.Id}")).StatusCode);
        Assert.Empty(await b.GetJsonAsync<List<NodeDto>>("/api/nodes"));

        // missing / malformed header -> 403
        var noHeader = factory.CreateClient();
        await noHeader.LoginAsOwnerAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await noHeader.GetAsync("/api/nodes")).StatusCode);
        noHeader.DefaultRequestHeaders.Add("X-Workspace-Id", "not-a-guid");
        Assert.Equal(HttpStatusCode.Forbidden, (await noHeader.GetAsync("/api/nodes")).StatusCode);

        // A still sees the node
        Assert.Equal("A's secret", (await a.GetJsonAsync<NodeDto>($"/api/nodes/{secret.Id}")).Title);
    }

    [Fact]
    public async Task Workspace_membership_grants_role_based_access()
    {
        var owner = factory.CreateClient();
        var auth = await owner.LoginAsOwnerAsync();
        var (viewer, viewerAuth) = await factory.RegisterUserAsync(owner, "viewer@test.local", "Viewer");

        var created = await owner.PostAsJsonAsync("/api/workspaces", new { name = "Team", icon = new { type = "emoji", value = "🏠" } });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var team = (await created.Content.ReadFromJsonAsync<WorkspaceSummary>(TestClient.Json))!;
        Assert.False(team.IsPersonal);
        Assert.Equal("🏠", team.Icon?.Value);

        var add = await owner.PostAsJsonAsync($"/api/workspaces/{team.Id}/members", new { email = "viewer@test.local", role = "viewer" });
        Assert.Equal(HttpStatusCode.Created, add.StatusCode);
        var members = await owner.GetJsonAsync<List<WorkspaceMemberDto>>($"/api/workspaces/{team.Id}/members");
        Assert.Equal(2, members.Count);

        owner.WithWorkspace(team.Id);
        var page = await owner.CreateNodeAsync("Team page");

        var viewerWorkspaces = await viewer.GetJsonAsync<List<WorkspaceSummary>>("/api/workspaces");
        Assert.Contains(viewerWorkspaces, w => w.Id == team.Id && w.Role == "viewer");

        viewer.WithWorkspace(team.Id);
        var seen = await viewer.GetJsonAsync<NodeDto>($"/api/nodes/{page.Id}");
        Assert.Equal("viewer", seen.EffectiveRole);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.PatchAsJsonAsync($"/api/nodes/{page.Id}", new { title = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.PostAsJsonAsync("/api/nodes", new { title = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.DeleteAsync($"/api/nodes/{page.Id}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/workspaces/{team.Id}/members/{viewerAuth.User.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.GetAsync($"/api/nodes/{page.Id}")).StatusCode);
        _ = auth;
    }
}

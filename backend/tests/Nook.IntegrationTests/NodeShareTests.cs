using System.Net;
using System.Net.Http.Json;
using Nook.Application.Contracts;

namespace Nook.IntegrationTests;

public class NodeShareTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    [Fact]
    public async Task Node_share_grants_subtree_access_with_effective_role()
    {
        var a = factory.CreateClient();
        var authA = await a.LoginAsOwnerAsync();
        var wsA = authA.Workspaces[0].Id;
        a.WithWorkspace(wsA);

        var shared = await a.CreateNodeAsync("Shared root");
        var child = await a.CreateNodeAsync("Shared child", shared.Id);
        var grandchild = await a.CreateNodeAsync("Grandchild", child.Id);
        var unrelated = await a.CreateNodeAsync("Private");

        var (b, _) = await factory.RegisterUserAsync(a, "b@test.local", "B");
        b.WithWorkspace(wsA);
        Assert.Equal(HttpStatusCode.Forbidden, (await b.GetAsync($"/api/nodes/{shared.Id}")).StatusCode);

        var share = await a.PostAsJsonAsync($"/api/nodes/{shared.Id}/shares", new { email = "b@test.local", role = "viewer" });
        Assert.Equal(HttpStatusCode.Created, share.StatusCode);

        // B now reaches A's workspace through the share: roots == shared subtrees
        var roots = await b.GetJsonAsync<List<NodeDto>>("/api/nodes");
        Assert.Equal([shared.Id], roots.Select(n => n.Id));
        Assert.Equal("viewer", roots[0].EffectiveRole);

        var gc = await b.GetJsonAsync<NodeDto>($"/api/nodes/{grandchild.Id}");
        Assert.Equal("viewer", gc.EffectiveRole);
        var kids = await b.GetJsonAsync<List<NodeDto>>($"/api/nodes?parentId={child.Id}");
        Assert.Equal([grandchild.Id], kids.Select(n => n.Id));

        Assert.Equal(HttpStatusCode.Forbidden, (await b.GetAsync($"/api/nodes/{unrelated.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await b.PatchAsJsonAsync($"/api/nodes/{grandchild.Id}", new { title = "nope" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await b.PostAsJsonAsync("/api/nodes", new { title = "root?" })).StatusCode);

        // viewer collab token
        var token = await b.GetJsonAsync<CollabTokenResponse>($"/api/collab/token?nodeId={grandchild.Id}");
        var payload = Nook.Application.Collab.Jwt.VerifyHs256(token.Token, NookApiFactory.CollabJwtSecret);
        Assert.Equal("viewer", payload!.Value.GetProperty("role").GetString());

        // upgrade to editor
        Assert.Equal(HttpStatusCode.Created, (await a.PostAsJsonAsync($"/api/nodes/{shared.Id}/shares", new { email = "b@test.local", role = "editor" })).StatusCode);
        var edited = await b.PatchAsJsonAsync($"/api/nodes/{grandchild.Id}", new { title = "edited by B" });
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        Assert.Equal("editor", (await edited.Content.ReadFromJsonAsync<NodeDto>(TestClient.Json))!.EffectiveRole);
        var created = await b.CreateNodeAsync("B's page", child.Id);
        Assert.Equal("editor", created.EffectiveRole);

        var shares = await a.GetJsonAsync<List<NodeShareDto>>($"/api/nodes/{shared.Id}/shares");
        var s = Assert.Single(shares);
        Assert.Equal("editor", s.Role);

        Assert.Equal(HttpStatusCode.NoContent, (await a.DeleteAsync($"/api/nodes/{shared.Id}/shares/{s.UserId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await b.GetAsync($"/api/nodes/{grandchild.Id}")).StatusCode);
    }
}

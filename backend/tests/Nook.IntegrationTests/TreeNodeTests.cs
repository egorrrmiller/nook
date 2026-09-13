using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Nook.Application.Contracts;
using Nook.Application.Nodes;

namespace Nook.IntegrationTests;

/// <summary>Contracts §7.1: ancestors, duplicate, archive, hasChildren, pageSettings merge.</summary>
public class TreeNodeTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    private async Task<(HttpClient Client, Guid Ws)> OwnerInNewWorkspaceAsync(string name)
    {
        var client = factory.CreateClient();
        await client.LoginAsOwnerAsync();
        var res = await client.PostAsJsonAsync("/api/workspaces", new { name });
        var ws = (await res.Content.ReadFromJsonAsync<WorkspaceSummary>(TestClient.Json))!.Id;
        client.WithWorkspace(ws);
        return (client, ws);
    }

    [Fact]
    public async Task Ancestors_chain_and_hasChildren()
    {
        var (client, _) = await OwnerInNewWorkspaceAsync("Ancestors");
        var root = await client.CreateNodeAsync("Root");
        Assert.False(root.HasChildren);
        var mid = await client.CreateNodeAsync("Mid", root.Id);
        var leaf = await client.CreateNodeAsync("Leaf", mid.Id);

        var crumbs = await client.GetJsonAsync<List<NodeSummary>>($"/api/nodes/{leaf.Id}/ancestors");
        Assert.Equal([root.Id, mid.Id], crumbs.Select(c => c.Id));
        Assert.Equal("Root", crumbs[0].Title);
        Assert.Null(crumbs[0].ParentId);
        Assert.Equal(root.Id, crumbs[1].ParentId);
        Assert.Empty(await client.GetJsonAsync<List<NodeSummary>>($"/api/nodes/{root.Id}/ancestors"));

        // hasChildren on get + list; a trashed child does not count
        Assert.True((await client.GetJsonAsync<NodeDto>($"/api/nodes/{root.Id}")).HasChildren);
        Assert.False((await client.GetJsonAsync<NodeDto>($"/api/nodes/{leaf.Id}")).HasChildren);
        var roots = await client.GetJsonAsync<List<NodeDto>>("/api/nodes");
        Assert.True(Assert.Single(roots, n => n.Id == root.Id).HasChildren);
        var kids = await client.GetJsonAsync<List<NodeDto>>($"/api/nodes?parentId={root.Id}");
        Assert.True(Assert.Single(kids).HasChildren);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/nodes/{leaf.Id}")).StatusCode);
        Assert.False((await client.GetJsonAsync<NodeDto>($"/api/nodes/{mid.Id}")).HasChildren);
    }

    [Fact]
    public async Task PageSettings_patch_merges()
    {
        var (client, _) = await OwnerInNewWorkspaceAsync("PageSettings");
        var page = await client.CreateNodeAsync("Page");
        Assert.Equal("default", page.PageSettings!.Font);

        var res = await client.PatchAsJsonAsync($"/api/nodes/{page.Id}", new { pageSettings = new { fullWidth = true } });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var patched = (await res.Content.ReadFromJsonAsync<NodeDto>(TestClient.Json))!;
        Assert.True(patched.PageSettings!.FullWidth);
        Assert.Equal("default", patched.PageSettings.Font);

        res = await client.PatchAsJsonAsync($"/api/nodes/{page.Id}", new { pageSettings = new { font = "serif" } });
        patched = (await res.Content.ReadFromJsonAsync<NodeDto>(TestClient.Json))!;
        Assert.Equal("serif", patched.PageSettings!.Font);
        Assert.True(patched.PageSettings.FullWidth, "merge must keep fields not present in the patch");

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync($"/api/nodes/{page.Id}", new { pageSettings = new { font = "comic" } })).StatusCode);
    }

    [Fact]
    public async Task Archive_hides_from_list_unless_includeArchived()
    {
        var (client, _) = await OwnerInNewWorkspaceAsync("Archive");
        var a = await client.CreateNodeAsync("A");
        var b = await client.CreateNodeAsync("B");
        var child = await client.CreateNodeAsync("A child", a.Id);

        var res = await client.PostAsync($"/api/nodes/{a.Id}/archive", null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var archived = (await res.Content.ReadFromJsonAsync<NodeDto>(TestClient.Json))!;
        Assert.NotNull(archived.ArchivedAt);
        Assert.True(archived.HasChildren);

        Assert.Equal([b.Id], (await client.GetJsonAsync<List<NodeDto>>("/api/nodes")).Select(n => n.Id));
        var all = await client.GetJsonAsync<List<NodeDto>>("/api/nodes?includeArchived=true");
        Assert.Equal([a.Id, b.Id], all.Select(n => n.Id));
        // archived node is still fetchable and its children are still listed (descendants inherit visibility client-side)
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/nodes/{a.Id}")).StatusCode);
        Assert.Equal([child.Id], (await client.GetJsonAsync<List<NodeDto>>($"/api/nodes?parentId={a.Id}")).Select(n => n.Id));

        res = await client.PostAsync($"/api/nodes/{a.Id}/unarchive", null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Null((await res.Content.ReadFromJsonAsync<NodeDto>(TestClient.Json))!.ArchivedAt);
        Assert.Equal([a.Id, b.Id], (await client.GetJsonAsync<List<NodeDto>>("/api/nodes")).Select(n => n.Id));
    }

    [Fact]
    public async Task Duplicate_copies_subtree_with_new_ids_and_stripped_block_ids()
    {
        var (client, ws) = await OwnerInNewWorkspaceAsync("Duplicate");
        var root = await client.CreateNodeAsync("Doc");
        var child = await client.CreateNodeAsync("Child", root.Id);
        var grandchild = await client.CreateNodeAsync("Grandchild", child.Id);
        var trashedChild = await client.CreateNodeAsync("Trashed", root.Id);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/nodes/{trashedChild.Id}")).StatusCode);
        await client.PatchAsJsonAsync($"/api/nodes/{root.Id}", new { icon = new { type = "emoji", value = "📘" }, pageSettings = new { fullWidth = true } });

        // Source content with block ids (+ nested children); the copy must be imported without any ids.
        var srcBlocks = FakeCollabClient.Parse("""
            [{"id":"b1","type":"paragraph","props":{},"content":[{"type":"text","text":"hello","styles":{}}],
              "children":[{"id":"b2","type":"paragraph","props":{},"content":[],"children":[]}]}]
            """);
        factory.CollabClient.Documents[root.Id] = ("Doc", srcBlocks);
        factory.CollabClient.Documents[child.Id] = ("Child", FakeCollabClient.Paragraphs(["child text"]));

        var res = await client.PostAsJsonAsync($"/api/nodes/{root.Id}/duplicate", new { });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        Assert.False(res.Headers.Contains("Warning"));
        var copy = (await res.Content.ReadFromJsonAsync<NodeDto>(TestClient.Json))!;
        Assert.NotEqual(root.Id, copy.Id);
        Assert.Equal("Doc (copy)", copy.Title);
        Assert.Null(copy.ParentId);
        Assert.Equal("📘", copy.Icon?.Value);
        Assert.True(copy.PageSettings!.FullWidth);
        Assert.True(copy.HasChildren);
        Assert.True(string.CompareOrdinal(root.Position, copy.Position) < 0);

        var copiedChildren = await client.GetJsonAsync<List<NodeDto>>($"/api/nodes?parentId={copy.Id}");
        var copiedChild = Assert.Single(copiedChildren); // the trashed child is not copied
        Assert.Equal("Child", copiedChild.Title);
        Assert.NotEqual(child.Id, copiedChild.Id);
        var copiedGrandchildren = await client.GetJsonAsync<List<NodeDto>>($"/api/nodes?parentId={copiedChild.Id}");
        Assert.Equal("Grandchild", Assert.Single(copiedGrandchildren).Title);
        Assert.NotEqual(grandchild.Id, copiedGrandchildren[0].Id);

        // Originals untouched
        Assert.Equal("Doc", (await client.GetJsonAsync<NodeDto>($"/api/nodes/{root.Id}")).Title);
        Assert.Equal(2, (await client.GetJsonAsync<List<NodeDto>>("/api/nodes")).Count);

        // Fake collab received the imports with stripped ids
        Assert.True(factory.CollabClient.Documents.TryGetValue(copy.Id, out var imported));
        Assert.Equal("Doc (copy)", imported.Title);
        Assert.Equal(1, imported.Blocks.GetArrayLength());
        var block = imported.Blocks[0];
        Assert.False(block.TryGetProperty("id", out _));
        Assert.Equal("hello", block.GetProperty("content")[0].GetProperty("text").GetString());
        Assert.False(block.GetProperty("children")[0].TryGetProperty("id", out _));
        Assert.True(factory.CollabClient.Documents.TryGetValue(copiedChild.Id, out var importedChild));
        Assert.Equal("child text", FakeCollabClient.Texts(importedChild.Blocks).Single());
        Assert.False(factory.CollabClient.Documents.ContainsKey(copiedGrandchildren[0].Id)); // empty source → no import

        // duplicate into another parent with a position; duplicating into its own subtree is rejected
        var other = await client.CreateNodeAsync("Other");
        res = await client.PostAsJsonAsync($"/api/nodes/{child.Id}/duplicate", new { parentId = other.Id, position = "a3" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var moved = (await res.Content.ReadFromJsonAsync<NodeDto>(TestClient.Json))!;
        Assert.Equal(other.Id, moved.ParentId);
        Assert.Equal("a3", moved.Position);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/nodes/{root.Id}/duplicate", new { parentId = child.Id })).StatusCode);

        // collab down: nodes are still copied, the response carries a Warning header
        factory.CollabClient.Unavailable = true;
        try
        {
            res = await client.PostAsJsonAsync($"/api/nodes/{root.Id}/duplicate", new { });
            Assert.Equal(HttpStatusCode.Created, res.StatusCode);
            Assert.True(res.Headers.Contains("Warning"));
            var degraded = (await res.Content.ReadFromJsonAsync<NodeDto>(TestClient.Json))!;
            Assert.Equal(ws, degraded.WorkspaceId);
            Assert.False(factory.CollabClient.Documents.ContainsKey(degraded.Id));
        }
        finally
        {
            factory.CollabClient.Unavailable = false;
        }
    }

    [Fact]
    public void PrepareBlocks_strips_ids_recursively_and_remaps_attachments()
    {
        var oldAtt = Guid.NewGuid();
        var newAtt = Guid.NewGuid();
        var blocks = FakeCollabClient.Parse($$"""
            [{"id":"x","type":"image","props":{"url":"/api/files/{{oldAtt}}"},"children":[{"id":"y","type":"paragraph","props":{},"children":[]}]}]
            """);
        var result = NodeDuplicateService.PrepareBlocks(blocks, new Dictionary<Guid, Guid> { [oldAtt] = newAtt });
        Assert.False(result[0].TryGetProperty("id", out _));
        Assert.False(result[0].GetProperty("children")[0].TryGetProperty("id", out _));
        Assert.Equal($"/api/files/{newAtt}", result[0].GetProperty("props").GetProperty("url").GetString());
        Assert.Equal(JsonValueKind.Array, result.ValueKind);
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Contracts;
using Nook.Application.Graph;
using Nook.Application.History;
using Nook.Infrastructure.Persistence;

namespace Nook.IntegrationTests;

/// <summary>Contracts §9.3 properties, §9.4 aliases, §9.6 graph, §9.7 history and block reads.</summary>
public class PropertiesGraphHistoryTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    [Fact]
    public async Task Page_properties_are_validated_merged_and_returned_on_the_node()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        client.WithWorkspace(auth.Workspaces[0].Id);
        var node = await client.CreateNodeAsync("Props");

        // Property names are free-form keys, so the request body is a dictionary (no camel-casing of the names).
        var put = await client.PutJsonAsync<JsonElement>($"/api/nodes/{node.Id}/properties", new Dictionary<string, object?>
        {
            ["Status"] = new { type = "select", value = "Active" },
            ["Due"] = new { type = "date", value = new { start = "2026-03-01" } },
            ["Done"] = new { type = "checkbox", value = false },
        });
        Assert.Equal("Active", put.GetProperty("Status").GetProperty("value").GetString());
        Assert.Equal("2026-03-01", put.GetProperty("Due").GetProperty("value").GetProperty("start").GetString());

        // A bad date is a 400 with the offending property named.
        var bad = await client.PutAsJsonAsync($"/api/nodes/{node.Id}/properties",
            new Dictionary<string, object?> { ["Due"] = new { type = "date", value = "31/02/2026" } }, TestClient.Json);
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        var problem = await bad.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(problem.GetProperty("errors").TryGetProperty("Due", out _));

        // PATCH merges; null removes.
        var patched = await client.PatchAsync($"/api/nodes/{node.Id}/properties",
            JsonContent.Create(new Dictionary<string, object?> { ["Done"] = new { type = "checkbox", value = true }, ["Status"] = null }, options: TestClient.Json));
        Assert.Equal(HttpStatusCode.OK, patched.StatusCode);
        var merged = await patched.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(merged.TryGetProperty("Status", out _));
        Assert.True(merged.GetProperty("Done").GetProperty("value").GetBoolean());
        Assert.True(merged.TryGetProperty("Due", out _));

        // The node carries its properties (contracts §9.3: Node gains `properties`).
        var reloaded = await client.GetJsonAsync<NodeDto>($"/api/nodes/{node.Id}");
        Assert.NotNull(reloaded.Properties);
        Assert.True(reloaded.Properties!.Value.GetProperty("Done").GetProperty("value").GetBoolean());
    }

    [Fact]
    public async Task Aliases_are_unique_per_workspace_and_conflicts_name_the_other_node()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        client.WithWorkspace(auth.Workspaces[0].Id);
        var first = await client.CreateNodeAsync("First");
        var second = await client.CreateNodeAsync("Second");

        var set = await client.PutJsonAsync<List<string>>($"/api/nodes/{first.Id}/aliases", new { aliases = new[] { "Alpha", "Beta", "Alpha" } });
        Assert.Equal(["Alpha", "Beta"], set);
        Assert.Equal(["Alpha", "Beta"], await client.GetJsonAsync<List<string>>($"/api/nodes/{first.Id}/aliases"));

        // Case-insensitive conflict across nodes -> 409 listing every taken alias with the node holding it (§9.4).
        var conflict = await client.PutAsJsonAsync($"/api/nodes/{second.Id}/aliases", new { aliases = new[] { "alpha", "BETA", "free" } });
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        var problem = await conflict.Content.ReadFromJsonAsync<JsonElement>();
        var conflicts = problem.GetProperty("conflicts").EnumerateArray().ToList();
        Assert.Equal(2, conflicts.Count);
        Assert.Equal(["Alpha", "Beta"], conflicts.Select(c => c.GetProperty("alias").GetString()!).ToArray());
        Assert.All(conflicts, c =>
        {
            Assert.Equal(first.Id, c.GetProperty("node").GetProperty("id").GetGuid());
            Assert.Equal("First", c.GetProperty("node").GetProperty("title").GetString());
            Assert.Equal("page", c.GetProperty("node").GetProperty("kind").GetString());
        });

        // Re-assigning the same alias to the owning node is fine; clearing frees it for the other node.
        Assert.Equal(["Alpha"], await client.PutJsonAsync<List<string>>($"/api/nodes/{first.Id}/aliases", new { aliases = new[] { "Alpha" } }));
        await client.PutJsonAsync<List<string>>($"/api/nodes/{first.Id}/aliases", new { aliases = Array.Empty<string>() });
        Assert.Equal(["alpha"], await client.PutJsonAsync<List<string>>($"/api/nodes/{second.Id}/aliases", new { aliases = new[] { "alpha" } }));
    }

    [Fact]
    public async Task Graph_returns_parent_link_and_tag_edges()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        var ws = auth.Workspaces[0].Id;
        client.WithWorkspace(ws);

        var root = await client.CreateNodeAsync("Graph root");
        var child = await client.CreateNodeAsync("Graph child", root.Id);
        var far = await client.CreateNodeAsync("Graph far");

        await client.StoreDocumentAsync(child.Id, "Graph child", new object[]
        {
            KnowledgeTestClient.Paragraph(KnowledgeTestClient.NewBlockId(),
                KnowledgeTestClient.Text("#graphtag linking "),
                KnowledgeTestClient.Mention(far.Id, "Graph far")),
        }, version: 0);

        var graph = await client.GetJsonAsync<GraphResponse>("/api/graph?includeTags=true");
        Assert.False(graph.Truncated);
        Assert.Contains(graph.Edges, e => e.Kind == "parent" && e.Source == root.Id && e.Target == child.Id);
        Assert.Contains(graph.Edges, e => e.Kind == "mention" && e.Source == child.Id && e.Target == far.Id);
        Assert.Contains(graph.Edges, e => e.Kind == "tag" && e.Source == child.Id);
        Assert.Contains(graph.Nodes, n => n.Id == child.Id && n.Degree >= 2 && n.TagIds!.Count == 1);

        // Rooted graph with depth 1: root + its direct neighbours (the child), not the child's own link target.
        var rooted = await client.GetJsonAsync<GraphResponse>($"/api/graph?rootId={root.Id}&depth=1");
        Assert.Equal(new[] { root.Id, child.Id }.OrderBy(id => id), rooted.Nodes.Select(n => n.Id).OrderBy(id => id));
        var deeper = await client.GetJsonAsync<GraphResponse>($"/api/graph?rootId={root.Id}&depth=2");
        Assert.Contains(deeper.Nodes, n => n.Id == far.Id);
        Assert.Null(deeper.Nodes[0].TagIds);
    }

    [Fact]
    public async Task History_lists_snapshots_saves_manual_versions_and_restores_through_collab()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        var ws = auth.Workspaces[0].Id;
        client.WithWorkspace(ws);
        var node = await client.CreateNodeAsync("Versioned");

        var firstBlock = KnowledgeTestClient.NewBlockId();
        await client.StoreDocumentAsync(node.Id, "Versioned", new object[]
        {
            KnowledgeTestClient.Paragraph(firstBlock, KnowledgeTestClient.Text("original text")),
        }, version: 0, userId: auth.User.Id);

        // The first store of a page always snapshots (no previous snapshot within 10 minutes).
        var afterFirst = await client.GetJsonAsync<VersionListResponse>($"/api/nodes/{node.Id}/history");
        var auto = Assert.Single(afterFirst.Items);
        Assert.Equal("auto", auto.Kind);
        Assert.Equal(1, auto.BlockCount);
        Assert.Equal(auth.User.Id, auto.User!.Id);

        // Edit, then save a manual version of the new state.
        await client.StoreDocumentAsync(node.Id, "Versioned", new object[]
        {
            KnowledgeTestClient.Paragraph(firstBlock, KnowledgeTestClient.Text("edited text")),
            KnowledgeTestClient.Paragraph(KnowledgeTestClient.NewBlockId(), KnowledgeTestClient.Text("second block")),
        }, version: 1, userId: auth.User.Id);

        var manual = await client.PostJsonAsync<VersionDto>($"/api/nodes/{node.Id}/history", new { });
        Assert.Equal("manual", manual.Kind);
        Assert.Equal(2, manual.BlockCount);

        // GET a version returns its stored block tree.
        var stored = await client.GetJsonAsync<VersionContentResponse>($"/api/nodes/{node.Id}/history/{auto.Id}");
        Assert.Equal("original text", stored.Blocks[0].GetProperty("content")[0].GetProperty("text").GetString());

        // Restore the first version: a pre-restore snapshot is taken and collab import gets the old blocks.
        factory.CollabClient.Documents.Clear();
        var restore = await client.PostJsonAsync<RestoreResponse>($"/api/nodes/{node.Id}/history/{auto.Id}/restore", new { });
        Assert.Equal(2, restore.Version);

        Assert.True(factory.CollabClient.Documents.TryGetValue(node.Id, out var imported));
        Assert.Equal("Versioned", imported.Title);
        Assert.Equal("original text", imported.Blocks[0].GetProperty("content")[0].GetProperty("text").GetString());

        var history = await client.GetJsonAsync<VersionListResponse>($"/api/nodes/{node.Id}/history");
        Assert.Contains(history.Items, v => v.Kind == "pre-restore" && v.BlockCount == 2);
        Assert.Equal(3, history.Items.Count);

        // The projection follows the restore straight away.
        var blocks = await client.GetJsonAsync<NodeBlocksResponse>($"/api/nodes/{node.Id}/blocks");
        Assert.Equal("original text", Assert.Single(blocks.Blocks.EnumerateArray().ToList()).GetProperty("content")[0].GetProperty("text").GetString());
    }

    [Fact]
    public async Task Node_blocks_are_rebuilt_as_a_tree_and_single_blocks_carry_a_breadcrumb()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        client.WithWorkspace(auth.Workspaces[0].Id);
        var parent = await client.CreateNodeAsync("Outer");
        var node = await client.CreateNodeAsync("Inner", parent.Id);

        var headingId = Guid.NewGuid();
        var childId = Guid.NewGuid();
        await client.StoreDocumentAsync(node.Id, "Inner", new object[]
        {
            new
            {
                id = headingId.ToString(), type = "heading", props = new { level = 2 },
                content = new object[] { KnowledgeTestClient.Text("Section") },
                children = new object[] { KnowledgeTestClient.Paragraph(childId.ToString(), KnowledgeTestClient.Text("nested")) },
            },
        }, version: 0);

        var tree = await client.GetJsonAsync<NodeBlocksResponse>($"/api/nodes/{node.Id}/blocks");
        Assert.Equal("Inner", tree.Title);
        Assert.Equal(1, tree.Version);
        var heading = Assert.Single(tree.Blocks.EnumerateArray().ToList());
        Assert.Equal("heading", heading.GetProperty("type").GetString());
        Assert.Equal(2, heading.GetProperty("props").GetProperty("level").GetInt32());
        var child = Assert.Single(heading.GetProperty("children").EnumerateArray().ToList());
        Assert.Equal(childId, Guid.Parse(child.GetProperty("id").GetString()!));

        var anchor = await client.GetJsonAsync<BlockAnchorResponse>($"/api/blocks/{headingId}");
        Assert.Equal(node.Id, anchor.NodeId);
        Assert.Equal("Section", anchor.Block.GetProperty("content")[0].GetProperty("text").GetString());
        Assert.Equal([parent.Id, node.Id], anchor.Breadcrumb.Select(b => b.Id).ToArray());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/blocks/{Guid.NewGuid()}")).StatusCode);
    }

    [Fact]
    public async Task Automatic_snapshots_are_throttled_to_one_per_ten_minutes()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        client.WithWorkspace(auth.Workspaces[0].Id);
        var node = await client.CreateNodeAsync("Throttled");

        for (var i = 0; i < 4; i++)
        {
            await client.StoreDocumentAsync(node.Id, "Throttled", new object[]
            {
                KnowledgeTestClient.Paragraph(KnowledgeTestClient.NewBlockId(), KnowledgeTestClient.Text($"revision {i}")),
            }, version: i);
        }

        // Four stores within the same minute produce exactly one automatic snapshot.
        var history = await client.GetJsonAsync<VersionListResponse>($"/api/nodes/{node.Id}/history");
        Assert.Single(history.Items);

        // Backdating the snapshot past the 10-minute window lets the next store take another one.
        using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.PageSnapshots.Where(s => s.NodeId == node.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.TakenAt, DateTimeOffset.UtcNow.AddMinutes(-30)));
        }
        await client.StoreDocumentAsync(node.Id, "Throttled", new object[]
        {
            KnowledgeTestClient.Paragraph(KnowledgeTestClient.NewBlockId(), KnowledgeTestClient.Text("much later")),
        }, version: 4);
        Assert.Equal(2, (await client.GetJsonAsync<VersionListResponse>($"/api/nodes/{node.Id}/history")).Items.Count);
    }
}

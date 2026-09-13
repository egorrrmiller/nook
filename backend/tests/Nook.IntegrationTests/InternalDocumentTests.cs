using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Contracts;
using Nook.Infrastructure.Jobs;
using Nook.Infrastructure.Persistence;

namespace Nook.IntegrationTests;

public class InternalDocumentTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    private static object Blocks(string firstText, bool includeThird = true)
    {
        var list = new List<object>
        {
            new
            {
                id = "11111111-1111-4111-8111-111111111111", type = "heading", props = new { level = 1 },
                content = new object[] { new { type = "text", text = firstText, styles = new { } } },
                children = new object[]
                {
                    new { id = "22222222-2222-4222-8222-222222222222", type = "paragraph", props = new { },
                          content = new object[] { new { type = "text", text = "дочерний абзац", styles = new { } } }, children = Array.Empty<object>() },
                },
            },
            new
            {
                id = "33333333-3333-4333-8333-333333333333", type = "callout", props = new { text = "plugin extracted" },
                content = Array.Empty<object>(), children = Array.Empty<object>(),
            },
        };
        if (includeThird)
        {
            list.Add(new { id = "44444444-4444-4444-8444-444444444444", type = "divider", props = new { }, children = Array.Empty<object>() });
        }
        return list;
    }

    [Fact]
    public async Task Put_document_rebuilds_projection_updates_title_and_detects_stale_versions()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        client.WithWorkspace(auth.Workspaces[0].Id);
        var node = await client.CreateNodeAsync("Untitled");

        // no token -> 401
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/internal/documents/{node.Id}")).StatusCode);

        var empty = await client.SendAsync(TestClient.Internal(HttpMethod.Get, $"/internal/documents/{node.Id}"));
        Assert.Equal(HttpStatusCode.OK, empty.StatusCode);
        var emptyDoc = (await empty.Content.ReadFromJsonAsync<InternalDocumentResponse>(TestClient.Json))!;
        Assert.Null(emptyDoc.Ydoc);
        Assert.Equal(0, emptyDoc.Version);
        Assert.Equal(HttpStatusCode.NotFound, (await client.SendAsync(TestClient.Internal(HttpMethod.Get, $"/internal/documents/{Guid.NewGuid()}"))).StatusCode);

        var ydoc = Convert.ToBase64String(Encoding.UTF8.GetBytes("fake-ydoc-v1"));
        var update = Convert.ToBase64String(Encoding.UTF8.GetBytes("update-1"));
        var put1 = await client.SendAsync(TestClient.Internal(HttpMethod.Put, $"/internal/documents/{node.Id}", new
        {
            ydoc, version = 0, title = "Meeting notes", blocks = Blocks("Hello heading"), updates = new[] { update }, userIds = new[] { auth.User.Id.ToString() },
        }));
        Assert.Equal(HttpStatusCode.OK, put1.StatusCode);
        Assert.Equal(1, (await put1.Content.ReadFromJsonAsync<InternalDocumentPutResponse>(TestClient.Json))!.Version);

        // title propagated to the node
        Assert.Equal("Meeting notes", (await client.GetJsonAsync<NodeDto>($"/api/nodes/{node.Id}")).Title);

        using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var doc = await db.Documents.SingleAsync(d => d.NodeId == node.Id);
            Assert.Equal(1, doc.Version);
            Assert.Equal("fake-ydoc-v1", Encoding.UTF8.GetString(doc.Ydoc));

            var updates = await db.DocumentUpdates.Where(u => u.NodeId == node.Id).ToListAsync();
            var u = Assert.Single(updates);
            Assert.Equal(1, u.Seq);
            Assert.Equal(auth.User.Id, u.UserId);

            var blocks = await db.Blocks.Where(b => b.NodeId == node.Id).OrderBy(b => b.ParentBlockId).ThenBy(b => b.Position).ToListAsync();
            Assert.Equal(4, blocks.Count);
            var heading = blocks.Single(b => b.Type == "heading");
            var child = blocks.Single(b => b.Type == "paragraph");
            var callout = blocks.Single(b => b.Type == "callout");
            Assert.Null(heading.ParentBlockId);
            Assert.Equal(heading.Id, child.ParentBlockId);
            Assert.Equal("Hello heading", heading.PlainText);
            Assert.Equal("дочерний абзац", child.PlainText);
            Assert.Equal("plugin extracted", callout.PlainText); // via the sample plugin's IBlockTypeDefinition
            Assert.All(blocks, b => Assert.Equal(1, b.Version));
            Assert.Equal(1, heading.Props.GetProperty("level").GetInt32());

            var en = await db.Database.SqlQueryRaw<string>("SELECT text_en::text AS \"Value\" FROM blocks WHERE id = {0}", heading.Id).SingleAsync();
            Assert.Contains("'hello'", en);
            var ru = await db.Database.SqlQueryRaw<string>("SELECT text_ru::text AS \"Value\" FROM blocks WHERE id = {0}", child.Id).SingleAsync();
            Assert.Contains("'дочерн'", ru);

            var outbox = await db.EventsOutbox.Where(e => e.Type == "DocumentChanged").ToListAsync();
            Assert.Contains(outbox, e => e.Payload.GetProperty("nodeId").GetGuid() == node.Id && e.Payload.GetProperty("version").GetInt32() == 1);
        }

        // stale version -> 409 with the stored version
        var stale = await client.SendAsync(TestClient.Internal(HttpMethod.Put, $"/internal/documents/{node.Id}", new { ydoc, version = 0, title = "x", blocks = Blocks("x") }));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        var problem = await stale.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, problem.GetProperty("version").GetInt32());

        // diff: heading text changes, divider removed, others untouched
        var put2 = await client.SendAsync(TestClient.Internal(HttpMethod.Put, $"/internal/documents/{node.Id}", new
        {
            ydoc = Convert.ToBase64String(Encoding.UTF8.GetBytes("fake-ydoc-v2")), version = 1, title = "Meeting notes", blocks = Blocks("Changed heading", includeThird: false),
        }));
        Assert.Equal(HttpStatusCode.OK, put2.StatusCode);
        Assert.Equal(2, (await put2.Content.ReadFromJsonAsync<InternalDocumentPutResponse>(TestClient.Json))!.Version);

        using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var blocks = await db.Blocks.Where(b => b.NodeId == node.Id).ToListAsync();
            Assert.Equal(3, blocks.Count);
            Assert.Equal(2, blocks.Single(b => b.Type == "heading").Version);
            Assert.Equal("Changed heading", blocks.Single(b => b.Type == "heading").PlainText);
            Assert.Equal(1, blocks.Single(b => b.Type == "paragraph").Version);
            Assert.Equal(1, blocks.Single(b => b.Type == "callout").Version);
            Assert.DoesNotContain(blocks, b => b.Type == "divider");

            var get = await client.SendAsync(TestClient.Internal(HttpMethod.Get, $"/internal/documents/{node.Id}"));
            var stored = (await get.Content.ReadFromJsonAsync<InternalDocumentResponse>(TestClient.Json))!;
            Assert.Equal(2, stored.Version);
            Assert.Equal("fake-ydoc-v2", Encoding.UTF8.GetString(Convert.FromBase64String(stored.Ydoc!)));

            // outbox dispatch marks the rows as dispatched (sample plugin handler runs)
            var dispatcher = factory.Services.GetRequiredService<OutboxDispatcher>();
            await dispatcher.DispatchOnceAsync(CancellationToken.None);
            Assert.False(await db.EventsOutbox.AnyAsync(e => e.DispatchedAt == null));
        }
    }

    [Fact]
    public async Task Sample_plugin_endpoint_is_mounted_under_api_plugins()
    {
        var anon = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/plugins/sample/ping")).StatusCode);

        var client = factory.CreateClient();
        await client.LoginAsOwnerAsync();
        var res = await client.GetAsync("/api/plugins/sample/ping");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("pong").GetBoolean());
        Assert.Equal("sample", body.GetProperty("plugin").GetString());
    }
}

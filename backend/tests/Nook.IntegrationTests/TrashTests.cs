using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Trash;
using Nook.Domain.Entities;
using Nook.Infrastructure.Persistence;

namespace Nook.IntegrationTests;

/// <summary>Contracts §7.2: trash list / restore / permanent delete / empty / retention job.</summary>
public class TrashTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    private sealed class FakeClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; set; } = now;
    }

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
    public async Task List_restore_to_original_parent_and_to_root_when_parent_deleted()
    {
        var (client, _) = await OwnerInNewWorkspaceAsync("Trash");
        var parent = await client.CreateNodeAsync("Parent");
        var child = await client.CreateNodeAsync("Child", parent.Id);
        var grandchild = await client.CreateNodeAsync("Grandchild", child.Id);
        var loner = await client.CreateNodeAsync("Loner");

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/nodes/{child.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/nodes/{loner.Id}")).StatusCode);

        // only subtree roots are listed (grandchild is inside child's subtree), newest first
        var trash = await client.GetJsonAsync<List<TrashItem>>("/api/trash");
        Assert.Equal([loner.Id, child.Id], trash.Select(t => t.Node.Id));
        var childItem = trash.Single(t => t.Node.Id == child.Id);
        Assert.Equal(parent.Id, childItem.OriginalParent?.Id);
        Assert.Equal([parent.Id], childItem.Breadcrumb.Select(b => b.Id));
        Assert.NotNull(childItem.Node.DeletedAt);
        Assert.False(childItem.Node.HasChildren);
        Assert.Null(trash.Single(t => t.Node.Id == loner.Id).OriginalParent);

        // q filter (ci substring) and limit
        Assert.Equal([child.Id], (await client.GetJsonAsync<List<TrashItem>>("/api/trash?q=chi")).Select(t => t.Node.Id));
        Assert.Single(await client.GetJsonAsync<List<TrashItem>>("/api/trash?limit=1"));

        // restore to the original parent (alive): whole subtree comes back
        var restore = await client.PostAsJsonAsync($"/api/trash/{child.Id}/restore", new { });
        Assert.Equal(HttpStatusCode.OK, restore.StatusCode);
        var restored = (await restore.Content.ReadFromJsonAsync<NodeDto>(TestClient.Json))!;
        Assert.Equal(parent.Id, restored.ParentId);
        Assert.Null(restored.DeletedAt);
        Assert.True(restored.HasChildren);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/nodes/{grandchild.Id}")).StatusCode);
        Assert.Equal([loner.Id], (await client.GetJsonAsync<List<TrashItem>>("/api/trash")).Select(t => t.Node.Id));

        // parent deleted after the child was trashed separately → restoring the child lands at the root
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/nodes/{grandchild.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/nodes/{parent.Id}")).StatusCode);
        var trashNow = await client.GetJsonAsync<List<TrashItem>>("/api/trash");
        Assert.Equal([parent.Id, loner.Id], trashNow.Select(t => t.Node.Id)); // grandchild's parent (child) is deleted → not a root

        restore = await client.PostAsJsonAsync($"/api/trash/{grandchild.Id}/restore", new { });
        Assert.Equal(HttpStatusCode.OK, restore.StatusCode);
        var gc = (await restore.Content.ReadFromJsonAsync<NodeDto>(TestClient.Json))!;
        Assert.Null(gc.ParentId);
        Assert.Null(gc.DeletedAt);

        // restoring the parent brings back only what was trashed with it (child), not the independently trashed loner
        restore = await client.PostAsJsonAsync($"/api/trash/{parent.Id}/restore", new { });
        Assert.Equal(HttpStatusCode.OK, restore.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/nodes/{child.Id}")).StatusCode);
        Assert.Equal([loner.Id], (await client.GetJsonAsync<List<TrashItem>>("/api/trash")).Select(t => t.Node.Id));

        // explicit target + rejection of cycles
        restore = await client.PostAsJsonAsync($"/api/trash/{loner.Id}/restore", new { parentId = child.Id });
        Assert.Equal(HttpStatusCode.OK, restore.StatusCode);
        Assert.Equal(child.Id, (await restore.Content.ReadFromJsonAsync<NodeDto>(TestClient.Json))!.ParentId);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/nodes/{parent.Id}")).StatusCode);
        // a trashed target (child went down with parent) or a live node are not valid restore targets / trash ids
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/trash/{parent.Id}/restore", new { parentId = child.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/trash/{gc.Id}/restore", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/trash/{Guid.NewGuid()}/restore", new { })).StatusCode);
    }

    [Fact]
    public async Task Permanent_delete_cascades_and_empty_trash()
    {
        var (client, ws) = await OwnerInNewWorkspaceAsync("Purge");
        var root = await client.CreateNodeAsync("Root");
        var child = await client.CreateNodeAsync("Child", root.Id);
        var keep = await client.CreateNodeAsync("Keep");

        // content for the child: document + blocks + snapshot via the internal API; plus favorite/recent/alias/tag rows
        var put = await client.SendAsync(TestClient.Internal(HttpMethod.Put, $"/internal/documents/{child.Id}", new
        {
            ydoc = Convert.ToBase64String([1, 2, 3]),
            version = 0,
            title = "Child",
            blocks = FakeCollabClient.Paragraphs(["some text"]),
            updates = new[] { Convert.ToBase64String([4, 5]) },
            userIds = Array.Empty<string>(),
        }));
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/favorites/{child.Id}", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync($"/api/recents/{child.Id}", null)).StatusCode);
        Guid tagId;
        using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var tag = new Tag { WorkspaceId = ws, Name = "t" };
            db.Tags.Add(tag);
            db.NodeTags.Add(new NodeTag { NodeId = child.Id, TagId = tag.Id });
            db.Aliases.Add(new Alias { NodeId = child.Id, Value = "alias-child" });
            db.PageSnapshots.Add(new PageSnapshot { NodeId = child.Id, Version = 1, Title = "Child", Blocks = FakeCollabClient.Parse("[]") });
            db.Blobs.Add(new Blob { Sha256 = new string('a', 64), Mime = "text/plain", Size = 1 });
            db.Attachments.Add(new Attachment { WorkspaceId = ws, NodeId = child.Id, BlobSha = new string('a', 64), Filename = "f.txt", Mime = "text/plain", Size = 1 });
            db.Links.Add(new Link { SourceNodeId = child.Id, TargetNodeId = keep.Id, Kind = Domain.Enums.LinkKind.Mention });
            await db.SaveChangesAsync();
            tagId = tag.Id;
        }

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/nodes/{root.Id}")).StatusCode);
        // permanent delete refuses live nodes and unknown ids
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/trash/{keep.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/trash/{root.Id}")).StatusCode);

        using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Guid[] ids = [root.Id, child.Id];
            Assert.Empty(await db.Nodes.Where(n => ids.Contains(n.Id)).ToListAsync());
            Assert.Empty(await db.Documents.Where(d => d.NodeId == child.Id).ToListAsync());
            Assert.Empty(await db.DocumentUpdates.Where(d => d.NodeId == child.Id).ToListAsync());
            Assert.Empty(await db.Blocks.Where(b => b.NodeId == child.Id).ToListAsync());
            Assert.Empty(await db.PageSnapshots.Where(s => s.NodeId == child.Id).ToListAsync());
            Assert.Empty(await db.Links.Where(l => l.SourceNodeId == child.Id).ToListAsync());
            Assert.Empty(await db.Attachments.Where(a => a.NodeId == child.Id).ToListAsync());
            Assert.Empty(await db.Favorites.Where(f => f.NodeId == child.Id).ToListAsync());
            Assert.Empty(await db.Recents.Where(r => r.NodeId == child.Id).ToListAsync());
            Assert.Empty(await db.NodeTags.Where(t => t.NodeId == child.Id).ToListAsync());
            Assert.Empty(await db.Aliases.Where(a => a.NodeId == child.Id).ToListAsync());
            Assert.NotNull(await db.Tags.FindAsync(tagId)); // the tag itself survives
            Assert.NotNull(await db.Blobs.FindAsync(new string('a', 64))); // blobs are GC'd by §8, not here
            Assert.NotNull(await db.Nodes.FindAsync(keep.Id));
            Assert.Contains(await db.EventsOutbox.ToListAsync(), e => e.Type == "NodePurged");
        }

        // empty trash
        var a = await client.CreateNodeAsync("A");
        var b = await client.CreateNodeAsync("B");
        await client.DeleteAsync($"/api/nodes/{a.Id}");
        await client.DeleteAsync($"/api/nodes/{b.Id}");
        Assert.Equal(2, (await client.GetJsonAsync<List<TrashItem>>("/api/trash")).Count);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("/api/trash")).StatusCode);
        Assert.Empty(await client.GetJsonAsync<List<TrashItem>>("/api/trash"));
        Assert.Equal([keep.Id], (await client.GetJsonAsync<List<NodeDto>>("/api/nodes")).Select(n => n.Id));
    }

    [Fact]
    public async Task Retention_job_purges_expired_roots_using_workspace_setting()
    {
        var (client, ws) = await OwnerInNewWorkspaceAsync("Retention");
        var old = await client.CreateNodeAsync("Old");
        var oldChild = await client.CreateNodeAsync("Old child", old.Id);
        var fresh = await client.CreateNodeAsync("Fresh");
        await client.DeleteAsync($"/api/nodes/{old.Id}");
        await client.DeleteAsync($"/api/nodes/{fresh.Id}");

        using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var oldRow = await db.Nodes.FirstAsync(n => n.Id == old.Id);
            oldRow.DeletedAt = DateTimeOffset.UtcNow.AddDays(-10);
            var oldChildRow = await db.Nodes.FirstAsync(n => n.Id == oldChild.Id);
            oldChildRow.DeletedAt = oldRow.DeletedAt;
            await db.SaveChangesAsync();
        }

        // default retention (30 days): nothing is old enough (the job is instance-wide; sibling tests only leave fresh trash behind)
        Assert.Equal(0, await RunJobAsync(DateTimeOffset.UtcNow));
        Assert.Equal(2, (await client.GetJsonAsync<List<TrashItem>>("/api/trash")).Count);
        // 7 days retention for this workspace → the 10-day-old subtree (2 nodes) goes, the fresh one stays
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync($"/api/workspaces/{ws}/settings/trash.retentionDays", new { value = 7 })).StatusCode);
        Assert.Equal(2, await RunJobAsync(DateTimeOffset.UtcNow));

        var trash = await client.GetJsonAsync<List<TrashItem>>("/api/trash");
        Assert.Equal([fresh.Id], trash.Select(t => t.Node.Id));
        using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Null(await db.Nodes.FindAsync(oldChild.Id));
        }
        // with the fake clock 40 days ahead, the 7-day retention expires the fresh one too (other workspaces' trash may go as well)
        Assert.True(await RunJobAsync(DateTimeOffset.UtcNow.AddDays(40)) >= 1);
        Assert.Empty(await client.GetJsonAsync<List<TrashItem>>("/api/trash"));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/workspaces/{ws}/settings/trash.retentionDays", new { value = "soon" })).StatusCode);
    }

    private async Task<int> RunJobAsync(DateTimeOffset now)
    {
        using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var outbox = scope.ServiceProvider.GetRequiredService<IOutbox>();
        var job = new TrashRetentionService(db, new FakeClock(now), outbox, NullLogger<TrashRetentionService>.Instance);
        return await job.PurgeExpiredAsync(CancellationToken.None);
    }
}

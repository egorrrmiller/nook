using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Contracts;
using Nook.Application.Favorites;
using Nook.Application.Recents;
using Nook.Application.Search;
using Nook.Domain.Entities;
using Nook.Infrastructure.Persistence;

namespace Nook.IntegrationTests;

/// <summary>Contracts §7.3 favorites/recents and §7.4 quick find.</summary>
public class NavigationTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
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
    public async Task Favorites_order_and_idempotent_put()
    {
        var (client, _) = await OwnerInNewWorkspaceAsync("Favorites");
        var a = await client.CreateNodeAsync("A");
        var b = await client.CreateNodeAsync("B");
        var c = await client.CreateNodeAsync("C", a.Id);

        var put = await client.PutAsJsonAsync($"/api/favorites/{a.Id}", new { });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        var fa = (await put.Content.ReadFromJsonAsync<FavoriteDto>(TestClient.Json))!;
        Assert.Equal(a.Id, fa.NodeId);
        Assert.Equal("A", fa.Node.Title);
        Assert.True(fa.Node.HasChildren);
        Assert.Equal("owner", fa.Node.EffectiveRole);

        var fb = (await (await client.PutAsJsonAsync($"/api/favorites/{b.Id}", new { })).Content.ReadFromJsonAsync<FavoriteDto>(TestClient.Json))!;
        Assert.True(string.CompareOrdinal(fa.Position, fb.Position) < 0, "append goes after the last favorite");

        // idempotent: same row, same position
        var again = (await (await client.PutAsJsonAsync($"/api/favorites/{a.Id}", new { })).Content.ReadFromJsonAsync<FavoriteDto>(TestClient.Json))!;
        Assert.Equal(fa.Position, again.Position);
        Assert.Equal(2, (await client.GetJsonAsync<List<FavoriteDto>>("/api/favorites")).Count);

        // explicit position moves; list is ordered by position
        var fc = (await (await client.PutAsJsonAsync($"/api/favorites/{c.Id}", new { position = "Zz" })).Content.ReadFromJsonAsync<FavoriteDto>(TestClient.Json))!;
        Assert.Equal("Zz", fc.Position);
        var list = await client.GetJsonAsync<List<FavoriteDto>>("/api/favorites");
        Assert.Equal([c.Id, a.Id, b.Id], list.Select(f => f.NodeId));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/favorites/{c.Id}", new { position = "a00" })).StatusCode);

        // trashed favorites disappear from the list; delete is 204 then 404
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/nodes/{b.Id}")).StatusCode);
        Assert.Equal([c.Id, a.Id], (await client.GetJsonAsync<List<FavoriteDto>>("/api/favorites")).Select(f => f.NodeId));
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/favorites/{a.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/favorites/{a.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync($"/api/favorites/{Guid.NewGuid()}", new { })).StatusCode);
    }

    [Fact]
    public async Task Recents_cap_and_ordering()
    {
        var (client, ws) = await OwnerInNewWorkspaceAsync("Recents");
        var owner = (await client.GetJsonAsync<AuthResponse>("/api/me")).User.Id;
        var pages = new List<NodeDto>();
        for (var i = 0; i < 105; i++) pages.Add(await client.CreateNodeAsync($"P{i:000}"));

        foreach (var p in pages)
            Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync($"/api/recents/{p.Id}", null)).StatusCode);

        var recents = await client.GetJsonAsync<List<RecentDto>>("/api/recents");
        Assert.Equal(20, recents.Count);
        Assert.Equal(pages[^1].Id, recents[0].Node.Id);
        Assert.True(recents.Zip(recents.Skip(1)).All(pair => pair.First.VisitedAt >= pair.Second.VisitedAt));

        var all = await client.GetJsonAsync<List<RecentDto>>("/api/recents?limit=1000");
        Assert.Equal(100, all.Count);
        Assert.DoesNotContain(all, r => r.Node.Id == pages[0].Id); // the 5 oldest visits were trimmed
        using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(100, await db.Recents.CountAsync(r => r.UserId == owner && r.WorkspaceId == ws));
        }

        // re-visiting bumps to the top; trashed excluded
        await client.PostAsync($"/api/recents/{pages[10].Id}", null);
        Assert.Equal(pages[10].Id, (await client.GetJsonAsync<List<RecentDto>>("/api/recents?limit=1"))[0].Node.Id);
        await client.DeleteAsync($"/api/nodes/{pages[10].Id}");
        Assert.Equal(pages[^1].Id, (await client.GetJsonAsync<List<RecentDto>>("/api/recents?limit=1"))[0].Node.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"/api/recents/{Guid.NewGuid()}", null)).StatusCode);
    }

    [Fact]
    public async Task Quick_find_ranking_aliases_trashed_archived_and_share_scope()
    {
        var (client, ws) = await OwnerInNewWorkspaceAsync("QuickFind");
        var exact = await client.CreateNodeAsync("Roadmap");
        var prefix = await client.CreateNodeAsync("Roadmap 2026", exact.Id);
        var fuzzy = await client.CreateNodeAsync("Raodmap notes");
        var aliased = await client.CreateNodeAsync("Plan");
        var trashed = await client.CreateNodeAsync("Roadmap trashed");
        var archived = await client.CreateNodeAsync("Roadmap archived");
        var unrelated = await client.CreateNodeAsync("Groceries");
        await client.DeleteAsync($"/api/nodes/{trashed.Id}");
        await client.PostAsync($"/api/nodes/{archived.Id}/archive", null);
        using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Aliases.Add(new Alias { NodeId = aliased.Id, Value = "roadmap-alias" });
            await db.SaveChangesAsync();
        }

        var hits = await client.GetJsonAsync<List<QuickHit>>("/api/search/quick?q=roadmap");
        var ids = hits.Select(h => h.Node.Id).ToList();
        Assert.Equal(exact.Id, ids[0]);                       // exact (ci) first
        Assert.Contains(prefix.Id, ids.Take(3));              // prefix beats fuzzy
        Assert.Contains(aliased.Id, ids.Take(3));             // alias prefix hit ranks with the title prefix hits
        Assert.Contains(fuzzy.Id, ids);                       // trigram similarity catches the typo
        Assert.DoesNotContain(trashed.Id, ids);
        Assert.DoesNotContain(unrelated.Id, ids);
        Assert.Equal(archived.Id, ids[^1]);                   // archived last
        Assert.True(ids.IndexOf(prefix.Id) < ids.IndexOf(fuzzy.Id));
        Assert.True(hits[0].Score > hits[^1].Score);

        var aliasHit = hits.Single(h => h.Node.Id == aliased.Id);
        Assert.Equal("roadmap-alias", aliasHit.MatchedAlias);
        Assert.Null(hits[0].MatchedAlias);
        var prefixHit = hits.Single(h => h.Node.Id == prefix.Id);
        Assert.Equal([exact.Id], prefixHit.Breadcrumb.Select(b => b.Id));
        Assert.True(hits[0].Node.HasChildren);

        // typo-only query, kinds filter, limit, empty query = recently updated pages
        Assert.Contains((await client.GetJsonAsync<List<QuickHit>>("/api/search/quick?q=raodmap")).Select(h => h.Node.Id), id => id == exact.Id);
        Assert.Empty(await client.GetJsonAsync<List<QuickHit>>("/api/search/quick?q=roadmap&kinds=database"));
        Assert.Single(await client.GetJsonAsync<List<QuickHit>>("/api/search/quick?q=roadmap&limit=1"));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/search/quick?q=x&kinds=widget")).StatusCode);
        var recent = await client.GetJsonAsync<List<QuickHit>>("/api/search/quick");
        Assert.Equal(6, recent.Count);
        Assert.DoesNotContain(trashed.Id, recent.Select(h => h.Node.Id));
        Assert.Equal(archived.Id, recent[^1].Node.Id);
        Assert.Equal(0, recent[0].Score);

        // share-only caller: only the shared subtree is searchable
        var (other, _) = await factory.RegisterUserAsync(client, "finder@test.local", "Finder");
        other.WithWorkspace(ws);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.GetAsync("/api/search/quick?q=roadmap")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync($"/api/nodes/{exact.Id}/shares", new { email = "finder@test.local", role = "viewer" })).StatusCode);
        var shared = await other.GetJsonAsync<List<QuickHit>>("/api/search/quick?q=roadmap");
        Assert.Equal([exact.Id, prefix.Id], shared.Select(h => h.Node.Id));
        Assert.All(shared, h => Assert.Equal("viewer", h.Node.EffectiveRole));
        Assert.Empty(shared[0].Breadcrumb);
        Assert.Equal([exact.Id], shared[1].Breadcrumb.Select(b => b.Id)); // chain trimmed to the shared root
    }
}

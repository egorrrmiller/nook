using System.Net;
using System.Net.Http.Json;
using Nook.Application.Search;
using Nook.Application.Tags;

namespace Nook.IntegrationTests;

/// <summary>Contracts §9.5 full-text search: word forms in both configurations, phrases, exclusions, filters, scoping, paging.</summary>
public class SearchTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    private static Task<SearchResponse> SearchAsync(HttpClient client, object body) =>
        client.PostJsonAsync<SearchResponse>("/api/search", body);

    [Fact]
    public async Task Search_matches_word_forms_phrases_exclusions_titles_and_respects_filters()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        var ws = auth.Workspaces[0].Id;
        client.WithWorkspace(ws);

        var parent = await client.CreateNodeAsync("Проекты");
        var russian = await client.CreateNodeAsync("Заметки о проектах", parent.Id);
        var english = await client.CreateNodeAsync("Release planning");
        var other = await client.CreateNodeAsync("Unrelated");

        await client.StoreDocumentAsync(russian.Id, "Заметки о проектах", new object[]
        {
            KnowledgeTestClient.Paragraph(KnowledgeTestClient.NewBlockId(),
                KnowledgeTestClient.Text("Мы обсуждали новые проекты и сроки выполнения задач #идея")),
        }, version: 0);

        await client.StoreDocumentAsync(english.Id, "Release planning", new object[]
        {
            KnowledgeTestClient.Paragraph(KnowledgeTestClient.NewBlockId(),
                KnowledgeTestClient.Text("We are running the release with a staged rollout plan")),
        }, version: 0);

        await client.StoreDocumentAsync(other.Id, "Unrelated", new object[]
        {
            KnowledgeTestClient.Paragraph(KnowledgeTestClient.NewBlockId(), KnowledgeTestClient.Text("nothing to see")),
        }, version: 0);

        // Russian stemming: the query "проект" matches the stored form "проекты".
        var ru = await SearchAsync(client, new { query = "проект" });
        Assert.Contains(ru.Hits, h => h.Node.Id == russian.Id);
        Assert.Contains(ru.Hits, h => h.Snippet.Contains("<mark>"));

        // English stemming: "running" matches "running"/"run" forms in the english configuration.
        var en = await SearchAsync(client, new { query = "staged rollout" });
        Assert.Equal(english.Id, Assert.Single(en.Hits).Node.Id);

        // Phrase search: the exact sequence matches, a reordered one does not.
        Assert.Single((await SearchAsync(client, new { query = "\"staged rollout\"" })).Hits);
        Assert.Empty((await SearchAsync(client, new { query = "\"rollout staged\"" })).Hits);

        // Exclusion.
        var excluded = await SearchAsync(client, new { query = "release -rollout" });
        Assert.DoesNotContain(excluded.Hits, h => h.Node.Id == english.Id);

        // title: restricts to titles.
        var titled = await SearchAsync(client, new { query = "title:Release" });
        Assert.Equal(english.Id, Assert.Single(titled.Hits).Node.Id);
        Assert.Equal("title", titled.Hits[0].MatchedIn);

        // Inline #tags land in plain_text, so FTS finds them, and the tag filter narrows results.
        Assert.Contains((await SearchAsync(client, new { query = "идея" })).Hits, h => h.Node.Id == russian.Id);
        var tags = await client.GetJsonAsync<List<TagDto>>($"/api/nodes/{russian.Id}/tags");
        var ideaTag = tags.Single(t => t.Name == "идея");
        var byTag = await SearchAsync(client, new { query = "проект", filters = new { tagIds = new[] { ideaTag.Id } } });
        Assert.Equal(russian.Id, Assert.Single(byTag.Hits).Node.Id);
        Assert.Empty((await SearchAsync(client, new { query = "release", filters = new { tagIds = new[] { ideaTag.Id } } })).Hits);

        // Ancestor scope.
        var scoped = await SearchAsync(client, new { query = "проект", scope = new { ancestorId = parent.Id } });
        Assert.Equal(russian.Id, Assert.Single(scoped.Hits).Node.Id);
        Assert.NotEmpty((await SearchAsync(client, new { query = "проект", scope = new { ancestorId = parent.Id } })).Hits[0].Breadcrumb);
        Assert.Empty((await SearchAsync(client, new { query = "release", scope = new { ancestorId = parent.Id } })).Hits);

        // Aliases are searchable and reported as matchedIn "alias".
        await client.PutJsonAsync<List<string>>($"/api/nodes/{english.Id}/aliases", new { aliases = new[] { "Launchplan" } });
        var byAlias = await SearchAsync(client, new { query = "Launchplan" });
        Assert.Equal(english.Id, Assert.Single(byAlias.Hits).Node.Id);
        Assert.Equal("alias", byAlias.Hits[0].MatchedIn);

        // Kind filter and sort are accepted; an unknown sort is a 400.
        Assert.Empty((await SearchAsync(client, new { query = "проект", filters = new { kinds = new[] { "folder" } } })).Hits);
        Assert.NotEmpty((await SearchAsync(client, new { query = "проект", sort = "updated" })).Hits);
        var badSort = await client.PostAsJsonAsync("/api/search", new { query = "x", sort = "nonsense" });
        Assert.Equal(HttpStatusCode.BadRequest, badSort.StatusCode);

        // An empty query returns nothing rather than the whole workspace.
        Assert.Empty((await SearchAsync(client, new { query = "   " })).Hits);
    }

    [Fact]
    public async Task Search_collapses_to_one_hit_per_node_and_paginates()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        client.WithWorkspace(auth.Workspaces[0].Id);

        for (var i = 0; i < 3; i++)
        {
            var node = await client.CreateNodeAsync($"Paginated {i}");
            await client.StoreDocumentAsync(node.Id, $"Paginated {i}", new object[]
            {
                KnowledgeTestClient.Paragraph(KnowledgeTestClient.NewBlockId(), KnowledgeTestClient.Text("shared needle in block one")),
                KnowledgeTestClient.Paragraph(KnowledgeTestClient.NewBlockId(), KnowledgeTestClient.Text("shared needle in block two")),
            }, version: 0);
        }

        var all = await SearchAsync(client, new { query = "needle" });
        Assert.Equal(3, all.Hits.Count);
        Assert.Equal(3, all.Total);
        Assert.Equal(3, all.Hits.Select(h => h.Node.Id).Distinct().Count());

        var first = await SearchAsync(client, new { query = "needle", limit = 2 });
        Assert.Equal(2, first.Hits.Count);
        Assert.NotNull(first.NextCursor);
        var second = await SearchAsync(client, new { query = "needle", limit = 2, cursor = first.NextCursor });
        Assert.Single(second.Hits);
        Assert.Null(second.NextCursor);
        Assert.Empty(first.Hits.Select(h => h.Node.Id).Intersect(second.Hits.Select(h => h.Node.Id)));

        // perBlock is the optional extension: both blocks of a page come back separately.
        var perBlock = await SearchAsync(client, new { query = "needle", filters = new { perBlock = true }, limit = 100 });
        Assert.Equal(6, perBlock.Hits.Count);
    }

    [Fact]
    public async Task Share_only_users_only_search_inside_the_subtrees_shared_with_them()
    {
        var owner = factory.CreateClient();
        var auth = await owner.LoginAsOwnerAsync();
        var ws = auth.Workspaces[0].Id;
        owner.WithWorkspace(ws);

        var shared = await owner.CreateNodeAsync("Shared root");
        var sharedChild = await owner.CreateNodeAsync("Shared child", shared.Id);
        var secret = await owner.CreateNodeAsync("Secret page");

        foreach (var node in new[] { shared, sharedChild, secret })
        {
            await owner.StoreDocumentAsync(node.Id, node.Title, new object[]
            {
                KnowledgeTestClient.Paragraph(KnowledgeTestClient.NewBlockId(), KnowledgeTestClient.Text("classified treasure map")),
            }, version: 0);
        }

        var (guest, _) = await factory.RegisterUserAsync(owner, "search-guest@test.local", "Guest");
        guest.WithWorkspace(ws);
        Assert.Equal(HttpStatusCode.Created, (await owner.PostAsJsonAsync($"/api/nodes/{shared.Id}/shares", new { email = "search-guest@test.local", role = "viewer" })).StatusCode);

        var ownerHits = await SearchAsync(owner, new { query = "treasure" });
        Assert.Equal(3, ownerHits.Hits.Count);

        var guestHits = await SearchAsync(guest, new { query = "treasure" });
        Assert.Equal(new[] { shared.Id, sharedChild.Id }.OrderBy(id => id), guestHits.Hits.Select(h => h.Node.Id).OrderBy(id => id));
        Assert.DoesNotContain(guestHits.Hits, h => h.Node.Id == secret.Id);
    }
}

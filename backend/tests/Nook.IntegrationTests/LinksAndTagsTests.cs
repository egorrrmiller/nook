using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Nook.Application.Contracts;
using Nook.Application.Links;
using Nook.Application.Tags;

namespace Nook.IntegrationTests;

/// <summary>Contracts §9.1 links/backlinks/broken and §9.2 tags (manual + inline).</summary>
public class LinksAndTagsTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    [Fact]
    public async Task Backlinks_broken_links_and_inline_tags_follow_the_document_store()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        var ws = auth.Workspaces[0].Id;
        client.WithWorkspace(ws);

        var source = await client.CreateNodeAsync("Source");
        var target = await client.CreateNodeAsync("Target");
        var blockId = KnowledgeTestClient.NewBlockId();

        // A page that mentions Target, links it by path, points at a missing page and carries two inline tags.
        await client.StoreDocumentAsync(source.Id, "Source", new object[]
        {
            KnowledgeTestClient.Paragraph(blockId,
                KnowledgeTestClient.Text("intro about #idea and #проект "),
                KnowledgeTestClient.Mention(target.Id, "Target"),
                KnowledgeTestClient.Text(" plus a wikilink [[Nowhere]] and "),
                KnowledgeTestClient.Link($"/w/{ws}/p/{target.Id}", "Target by path"),
                KnowledgeTestClient.Text(" and "),
                KnowledgeTestClient.Link("https://example.com", "an external site")),
        }, version: 0, userId: auth.User.Id);

        // §9.1 backlinks on the target
        var backlinks = await client.GetJsonAsync<List<BacklinkDto>>($"/api/nodes/{target.Id}/backlinks");
        Assert.Equal(2, backlinks.Count);
        Assert.All(backlinks, b => Assert.Equal(source.Id, b.SourceNode.Id));
        Assert.All(backlinks, b => Assert.Equal("mention", b.Kind));
        Assert.Contains("#idea", backlinks[0].Snippet);

        // §9.1 outgoing links: mention (x2), the unresolved wikilink and the external url
        var links = await client.GetJsonAsync<List<OutgoingLinkDto>>($"/api/nodes/{source.Id}/links");
        Assert.Equal(2, links.Count(l => l.Kind == "mention" && l.TargetNode?.Id == target.Id && !l.Broken));
        Assert.Contains(links, l => l.Kind == "wikilink" && l.Href == "[[Nowhere]]" && l.Broken);
        Assert.Contains(links, l => l.Kind == "url" && l.Href == "https://example.com" && !l.Broken);

        // §9.1 broken report: only the unresolved wikilink
        var broken = await client.GetJsonAsync<List<BrokenLinkDto>>("/api/links/broken");
        var brokenOne = Assert.Single(broken);
        Assert.Equal("[[Nowhere]]", brokenOne.Href);
        Assert.Equal(source.Id, brokenOne.SourceNode.Id);

        // A page titled "Nowhere" resolves the wikilink; it then backlinks and leaves the broken report.
        var nowhere = await client.CreateNodeAsync("Nowhere");
        Assert.Empty(await client.GetJsonAsync<List<BrokenLinkDto>>("/api/links/broken"));
        var nowhereBacklinks = await client.GetJsonAsync<List<BacklinkDto>>($"/api/nodes/{nowhere.Id}/backlinks");
        Assert.Equal("wikilink", Assert.Single(nowhereBacklinks).Kind);

        // §9.2 inline tags appear with source "inline" and plain_text keeps the #token so FTS finds it
        var tags = await client.GetJsonAsync<List<TagDto>>($"/api/nodes/{source.Id}/tags");
        Assert.Equal(["idea", "проект"], tags.Select(t => t.Name).Order(StringComparer.Ordinal).ToArray());
        Assert.All(tags, t => Assert.Equal("inline", t.Source));

        // Manual tags union with inline ones; the shared tag reports both sources.
        var union = await client.PutJsonAsync<List<TagDto>>($"/api/nodes/{source.Id}/tags", new { names = new[] { "idea", "manual-only" } });
        Assert.Equal(["idea", "manual-only", "проект"], union.Select(t => t.Name).Order(StringComparer.Ordinal).ToArray());
        Assert.Equal("manual,inline", union.Single(t => t.Name == "idea").Source);
        Assert.Equal("manual", union.Single(t => t.Name == "manual-only").Source);

        // Removing the inline token drops only the inline row: "idea" survives as manual, "проект" disappears.
        await client.StoreDocumentAsync(source.Id, "Source", new object[]
        {
            KnowledgeTestClient.Paragraph(blockId, KnowledgeTestClient.Text("no more hashtags here")),
        }, version: 1, userId: auth.User.Id);

        var afterEdit = await client.GetJsonAsync<List<TagDto>>($"/api/nodes/{source.Id}/tags");
        Assert.Equal(["idea", "manual-only"], afterEdit.Select(t => t.Name).Order(StringComparer.Ordinal).ToArray());
        Assert.All(afterEdit, t => Assert.Equal("manual", t.Source));
        Assert.Empty(await client.GetJsonAsync<List<BacklinkDto>>($"/api/nodes/{target.Id}/backlinks"));

        // §9.2 tag CRUD and /tags/{id}/nodes
        var ideaTag = afterEdit.Single(t => t.Name == "idea");
        var all = await client.GetJsonAsync<List<TagDto>>("/api/tags");
        Assert.Contains(all, t => t.Name == "idea" && t.Count == 1);

        var duplicate = await client.PostAsJsonAsync("/api/tags", new { name = "IDEA" });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);

        var recoloured = await client.PatchAsJsonAsync($"/api/tags/{ideaTag.Id}", new { color = "#ff0000" });
        Assert.Equal(HttpStatusCode.OK, recoloured.StatusCode);
        Assert.Equal("#ff0000", (await recoloured.Content.ReadFromJsonAsync<TagDto>(TestClient.Json))!.Color);

        var tagged = await client.GetJsonAsync<TagNodesPage>($"/api/tags/{ideaTag.Id}/nodes");
        Assert.Equal(source.Id, Assert.Single(tagged.Items).Id);
        Assert.Null(tagged.NextCursor);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/tags/{ideaTag.Id}")).StatusCode);
        Assert.DoesNotContain(await client.GetJsonAsync<List<TagDto>>($"/api/nodes/{source.Id}/tags"), t => t.Name == "idea");
    }

    [Fact]
    public async Task Tag_node_listing_paginates_by_cursor()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        client.WithWorkspace(auth.Workspaces[0].Id);

        var tag = await client.PostJsonAsync("/api/tags", new { name = "paged" });
        var tagId = tag.GetProperty("id").GetGuid();
        for (var i = 0; i < 3; i++)
        {
            var node = await client.CreateNodeAsync($"Paged {i}");
            await client.PutJsonAsync<List<TagDto>>($"/api/nodes/{node.Id}/tags", new { tagIds = new[] { tagId } });
        }

        var first = await client.GetJsonAsync<TagNodesPage>($"/api/tags/{tagId}/nodes?limit=2");
        Assert.Equal(2, first.Items.Count);
        Assert.NotNull(first.NextCursor);

        var second = await client.GetJsonAsync<TagNodesPage>($"/api/tags/{tagId}/nodes?limit=2&cursor={Uri.EscapeDataString(first.NextCursor!)}");
        Assert.Single(second.Items);
        Assert.Null(second.NextCursor);
        Assert.Empty(first.Items.Select(i => i.Id).Intersect(second.Items.Select(i => i.Id)));
    }
}

using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Contracts;
using Nook.Application.Import;
using Nook.Application.Links;
using Nook.Application.Tags;
using Nook.Infrastructure.Persistence;

namespace Nook.IntegrationTests;

/// <summary>Contracts §9.8 export (zip layout, frontmatter, relative links) and import (md/html/csv/zip).</summary>
public class ExportImportTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    private static MultipartFormDataContent Upload(string fileName, byte[] bytes, Guid? parentId = null)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        form.Add(file, "file", fileName);
        if (parentId is { } p) form.Add(new StringContent(p.ToString()), "parentId");
        return form;
    }

    private static byte[] Zip(params (string Path, string Content)[] entries)
    {
        using var buffer = new MemoryStream();
        using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (path, content) in entries)
            {
                using var stream = zip.CreateEntry(path).Open();
                stream.Write(Encoding.UTF8.GetBytes(content));
            }
        }
        return buffer.ToArray();
    }

    private static Dictionary<string, string> ReadZip(byte[] bytes)
    {
        using var buffer = new MemoryStream(bytes);
        using var zip = new ZipArchive(buffer, ZipArchiveMode.Read);
        return zip.Entries.ToDictionary(e => e.FullName, e =>
        {
            using var reader = new StreamReader(e.Open(), Encoding.UTF8);
            return reader.ReadToEnd();
        });
    }

    [Fact]
    public async Task Export_writes_a_notion_like_zip_with_frontmatter_and_relative_links()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        var ws = auth.Workspaces[0].Id;
        client.WithWorkspace(ws);

        var parent = await client.CreateNodeAsync("Parent page");
        var child = await client.CreateNodeAsync("Child page", parent.Id);

        await client.PutJsonAsync<List<TagDto>>($"/api/nodes/{parent.Id}/tags", new { names = new[] { "exported" } });
        await client.PutJsonAsync<List<string>>($"/api/nodes/{parent.Id}/aliases", new { aliases = new[] { "P" } });
        await client.PutJsonAsync<System.Text.Json.JsonElement>($"/api/nodes/{parent.Id}/properties",
            new Dictionary<string, object?> { ["Status"] = new { type = "select", value = "Active" } });

        await client.StoreDocumentAsync(parent.Id, "Parent page", new object[]
        {
            KnowledgeTestClient.Paragraph(KnowledgeTestClient.NewBlockId(),
                KnowledgeTestClient.Text("go to "),
                KnowledgeTestClient.Link($"/w/{ws}/p/{child.Id}", "the child")),
        }, version: 0);
        await client.StoreDocumentAsync(child.Id, "Child page", new object[]
        {
            KnowledgeTestClient.Paragraph(KnowledgeTestClient.NewBlockId(),
                KnowledgeTestClient.Text("back to "),
                KnowledgeTestClient.Link($"/w/{ws}/p/{parent.Id}", "the parent")),
        }, version: 0);

        var res = await client.PostAsJsonAsync("/api/export", new { nodeIds = new[] { parent.Id }, includeChildren = true, format = "markdown" }, TestClient.Json);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("application/zip", res.Content.Headers.ContentType?.MediaType);
        Assert.Contains("Parent%20page-export.zip", res.Content.Headers.ContentDisposition!.ToString());

        var files = ReadZip(await res.Content.ReadAsByteArrayAsync());
        Assert.Equal(["Parent page.md", "Parent page/Child page.md"], files.Keys.Order(StringComparer.Ordinal).ToArray());

        var parentMd = files["Parent page.md"];
        Assert.StartsWith("---\n", parentMd);
        Assert.Contains("title: \"Parent page\"", parentMd);
        Assert.Contains("tags: [\"exported\"]", parentMd);
        Assert.Contains("aliases: [\"P\"]", parentMd);
        Assert.Contains("properties:", parentMd);
        Assert.Contains("Parent%20page/Child%20page.md", parentMd);   // link rewritten downwards
        Assert.Contains("../Parent%20page.md", files["Parent page/Child page.md"]); // and back up

        // HTML export inlines the stylesheet and keeps the same layout.
        var html = await client.PostAsJsonAsync("/api/export", new { nodeIds = new[] { parent.Id }, includeChildren = true, format = "html" }, TestClient.Json);
        var htmlFiles = ReadZip(await html.Content.ReadAsByteArrayAsync());
        Assert.Equal(["Parent page.html", "Parent page/Child page.html"], htmlFiles.Keys.Order(StringComparer.Ordinal).ToArray());
        Assert.Contains("<style>", htmlFiles["Parent page.html"]);
        Assert.Contains("nook-frontmatter", htmlFiles["Parent page.html"]);

        // includeChildren=false exports only the selected page.
        var single = await client.PostAsJsonAsync("/api/export", new { nodeIds = new[] { parent.Id }, includeChildren = false, format = "markdown" }, TestClient.Json);
        Assert.Equal(["Parent page.md"], ReadZip(await single.Content.ReadAsByteArrayAsync()).Keys.ToArray());

        var unknown = await client.PostAsJsonAsync("/api/export", new { nodeIds = new[] { parent.Id }, format = "pdf" }, TestClient.Json);
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
    }

    [Fact]
    public async Task Importing_a_zip_of_two_linked_markdown_files_creates_two_pages_and_one_mention()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        client.WithWorkspace(auth.Workspaces[0].Id);
        var parent = await client.CreateNodeAsync("Import target");

        var zip = Zip(
            ("First.md", "# First\n\nA link to [Second](Second.md) here.\n"),
            ("Second.md", "# Second\n\nAnd back to [First](First.md).\n"));

        var res = await client.PostAsync("/api/import", Upload("vault.zip", zip, parent.Id));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var result = (await res.Content.ReadFromJsonAsync<ImportResponse>(TestClient.Json))!;
        Assert.Equal(2, result.PagesCreated);
        Assert.Equal(2, result.NodeIds.Count);
        Assert.Empty(result.Warnings);

        var children = await client.GetJsonAsync<List<NodeDto>>($"/api/nodes?parentId={parent.Id}");
        Assert.Equal(["First", "Second"], children.Select(c => c.Title).Order(StringComparer.Ordinal).ToArray());

        var first = children.Single(c => c.Title == "First");
        var second = children.Single(c => c.Title == "Second");

        // The cross-file link became a mention in each direction.
        var firstLinks = await client.GetJsonAsync<List<OutgoingLinkDto>>($"/api/nodes/{first.Id}/links");
        var mention = Assert.Single(firstLinks, l => l.Kind == "mention");
        Assert.Equal(second.Id, mention.TargetNode!.Id);
        Assert.False(mention.Broken);

        var backlinks = await client.GetJsonAsync<List<BacklinkDto>>($"/api/nodes/{first.Id}/backlinks");
        Assert.Equal(second.Id, Assert.Single(backlinks).SourceNode.Id);
    }

    [Fact]
    public async Task Importing_a_csv_creates_a_page_with_a_table_block()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        client.WithWorkspace(auth.Workspaces[0].Id);

        var csv = Encoding.UTF8.GetBytes("Name,Role\nAda,Engineer\n\"Grace, M\",Admiral\n");
        var res = await client.PostAsync("/api/import", Upload("people.csv", csv));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var result = (await res.Content.ReadFromJsonAsync<ImportResponse>(TestClient.Json))!;
        Assert.Equal(1, result.PagesCreated);

        var nodeId = Assert.Single(result.NodeIds);
        Assert.Equal("people", (await client.GetJsonAsync<NodeDto>($"/api/nodes/{nodeId}")).Title);

        using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var block = await db.Blocks.SingleAsync(b => b.NodeId == nodeId);
        Assert.Equal("table", block.Type);
        Assert.Equal(3, block.Content!.Value.GetProperty("rows").GetArrayLength());
        Assert.Contains("Grace, M", block.PlainText);
    }

    [Fact]
    public async Task Importing_a_single_markdown_file_creates_one_page_titled_by_its_heading()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        client.WithWorkspace(auth.Workspaces[0].Id);

        var md = Encoding.UTF8.GetBytes("# Imported note\n\nSome body text.\n");
        var res = await client.PostAsync("/api/import", Upload("note.md", md));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var result = (await res.Content.ReadFromJsonAsync<ImportResponse>(TestClient.Json))!;
        var nodeId = Assert.Single(result.NodeIds);
        Assert.Equal("Imported note", (await client.GetJsonAsync<NodeDto>($"/api/nodes/{nodeId}")).Title);

        // The document reached collab and the block projection.
        Assert.True(factory.CollabClient.Documents.ContainsKey(nodeId));
        using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Contains(await db.Blocks.Where(b => b.NodeId == nodeId).Select(b => b.PlainText).ToListAsync(), t => t.Contains("Some body text"));

        var unsupported = await client.PostAsync("/api/import", Upload("archive.rar", [1, 2, 3]));
        Assert.Equal(HttpStatusCode.BadRequest, unsupported.StatusCode);
    }

    [Fact]
    public async Task Zip_folders_become_parent_pages_and_merge_into_a_sibling_markdown_file()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        client.WithWorkspace(auth.Workspaces[0].Id);
        var parent = await client.CreateNodeAsync("Nested import");

        var zip = Zip(
            ("Area.md", "# Area\n\nOverview.\n"),
            ("Area/Topic.md", "# Topic\n\nDetail.\n"),
            ("Loose/Deep.md", "# Deep\n\nInside a folder without its own file.\n"));

        var res = await client.PostAsync("/api/import", Upload("vault.zip", zip, parent.Id));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var roots = await client.GetJsonAsync<List<NodeDto>>($"/api/nodes?parentId={parent.Id}");
        Assert.Equal(["Area", "Loose"], roots.Select(r => r.Title).Order(StringComparer.Ordinal).ToArray());

        // "Area.md" and the folder "Area/" merged into a single page that owns Topic.
        var area = roots.Single(r => r.Title == "Area");
        Assert.Equal(["Topic"], (await client.GetJsonAsync<List<NodeDto>>($"/api/nodes?parentId={area.Id}")).Select(c => c.Title).ToArray());

        // "Loose/" has no sibling file, so a folder page was created for it.
        var loose = roots.Single(r => r.Title == "Loose");
        Assert.Equal(["Deep"], (await client.GetJsonAsync<List<NodeDto>>($"/api/nodes?parentId={loose.Id}")).Select(c => c.Title).ToArray());
    }
}

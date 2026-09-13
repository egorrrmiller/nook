using System.Text.Json;
using Nook.Application.Documents;
using Nook.Application.Export;
using Nook.Application.Import;
using Nook.Application.Properties;
using Nook.Application.Search;
using Nook.Application.Tags;
using Nook.Domain.Enums;

namespace Nook.UnitTests.Documents;

/// <summary>Contracts §9.1–§9.5, §9.8: link extraction, hashtag collection, the query grammar and the export/import helpers.</summary>
public class KnowledgeProjectionTests
{
    /// <summary>JSON written with single quotes so it nests readably inside C# strings.</summary>
    private static JsonElement Json(string singleQuoted) => JsonSerializer.Deserialize<JsonElement>(singleQuoted.Replace('\'', '"'));

    private static IReadOnlyList<FlatBlock> Flatten(string singleQuoted) => BlockFlattener.Flatten(Json(singleQuoted));

    private static IReadOnlyList<FlatBlock> Paragraph(string inlineContent) =>
        Flatten("[{'id':'11111111-1111-4111-8111-111111111111','type':'paragraph','props':{},'content':[" + inlineContent + "],'children':[]}]");

    // --- §9.1 links ---------------------------------------------------------------------------------------------------

    [Fact]
    public void Page_path_hrefs_become_mentions_with_the_block_anchor()
    {
        var node = Guid.NewGuid();
        var block = Guid.NewGuid();
        var rows = Paragraph($"{{'type':'link','href':'/w/{Guid.NewGuid()}/p/{node}#b-{block}','content':[{{'type':'text','text':'anchor','styles':{{}}}}]}}");
        var link = Assert.Single(LinkExtractor.Extract(Guid.NewGuid(), rows));
        Assert.Equal(LinkKind.Mention, link.Kind);
        Assert.Equal(node, link.TargetNodeId);
        Assert.Equal(block, link.TargetBlockId);
    }

    [Fact]
    public void Nook_scheme_hrefs_resolve_to_nodes_and_blocks()
    {
        var node = Guid.NewGuid();
        var block = Guid.NewGuid();
        var rows = Paragraph($"{{'type':'link','href':'nook://node/{node}','content':[]}},{{'type':'link','href':'nook://block/{block}','content':[]}}");
        var links = LinkExtractor.Extract(Guid.NewGuid(), rows);
        Assert.Equal(2, links.Count);
        Assert.All(links, l => Assert.Equal(LinkKind.Mention, l.Kind));
        Assert.Contains(links, l => l.TargetNodeId == node && l.TargetBlockId is null);
        Assert.Contains(links, l => l.TargetNodeId is null && l.TargetBlockId == block);
    }

    [Fact]
    public void Unresolved_wikilinks_are_collected_from_plain_text_but_not_from_code()
    {
        var rows = Paragraph(
            "{'type':'text','text':'see [[Other Page]] and [[Second|alias]] too','styles':{}}," +
            "{'type':'text','text':'[[InCode]]','styles':{'code':true}}");
        var links = LinkExtractor.Extract(Guid.NewGuid(), rows);
        Assert.Equal(2, links.Count);
        Assert.All(links, l => Assert.Equal(LinkKind.Wikilink, l.Kind));
        Assert.All(links, l => Assert.Null(l.TargetNodeId));
        Assert.Contains(links, l => l.Href == "[[Other Page]]");
        Assert.Contains(links, l => l.Href == "[[Second]]");
        Assert.DoesNotContain(links, l => l.Href == "[[InCode]]");
    }

    [Fact]
    public void External_urls_become_kind_url_with_no_target()
    {
        var rows = Paragraph("{'type':'link','href':'https://example.com/a?b=1','content':[{'type':'text','text':'x','styles':{}}]}");
        var link = Assert.Single(LinkExtractor.Extract(Guid.NewGuid(), rows));
        Assert.Equal(LinkKind.Url, link.Kind);
        Assert.Null(link.TargetNodeId);
        Assert.Equal("https://example.com/a?b=1", link.Href);
    }

    [Fact]
    public void Page_link_embed_and_synced_blocks_map_to_their_kinds()
    {
        var node = Guid.NewGuid();
        var block = Guid.NewGuid();
        var rows = Flatten(
            "[{'id':'11111111-1111-4111-8111-111111111111','type':'pageLink','props':{'nodeId':'" + node + "'},'children':[]}," +
            " {'id':'22222222-2222-4222-8222-222222222222','type':'pageEmbed','props':{'nodeId':'" + node + "'},'children':[]}," +
            " {'id':'33333333-3333-4333-8333-333333333333','type':'syncedBlock','props':{'nodeId':'" + node + "','blockId':'" + block + "'},'children':[]}]");
        var links = LinkExtractor.Extract(Guid.NewGuid(), rows);
        Assert.Equal(3, links.Count);
        Assert.Contains(links, l => l.Kind == LinkKind.Mention && l.TargetNodeId == node);
        Assert.Contains(links, l => l.Kind == LinkKind.Embed && l.TargetNodeId == node);
        Assert.Contains(links, l => l.Kind == LinkKind.Synced && l.TargetNodeId == node && l.TargetBlockId == block);
    }

    // --- §9.2 inline tags ---------------------------------------------------------------------------------------------

    [Fact]
    public void Hashtags_are_collected_from_text_ignoring_code_urls_and_numbers()
    {
        var rows = Flatten(
            "[{'id':'11111111-1111-4111-8111-111111111111','type':'paragraph','props':{},'content':[" +
            "  {'type':'text','text':'an #idea and #проект-2 plus #42 and #a','styles':{}}," +
            "  {'type':'text','text':'#skipped','styles':{'code':true}}],'children':[]}," +
            " {'id':'22222222-2222-4222-8222-222222222222','type':'codeBlock','props':{},'content':[{'type':'text','text':'#nope','styles':{}}],'children':[]}," +
            " {'id':'33333333-3333-4333-8333-333333333333','type':'paragraph','props':{},'content':[" +
            "  {'type':'text','text':'https://x/y#anchor and colour #fff000 written twice #idea','styles':{}}],'children':[]}]");
        Assert.Equal(["idea", "проект-2", "fff000"], HashtagExtractor.Extract(rows));
    }

    // --- §9.5 query grammar -------------------------------------------------------------------------------------------

    [Fact]
    public void Query_grammar_handles_prefix_terms_phrases_exclusions_and_title()
    {
        var parsed = SearchQueryParser.Parse("""alpha "beta gamma" -delta title:notes""");
        Assert.Equal(["alpha"], parsed.Terms);
        Assert.Equal(["beta gamma"], parsed.Phrases);
        Assert.Equal(["delta"], parsed.Excluded);
        Assert.Equal(["notes"], parsed.TitleTerms);
        Assert.Equal("'alpha':* & ('beta' <-> 'gamma') & !'delta'", parsed.TsQuery);
    }

    [Fact]
    public void Query_grammar_strips_tsquery_syntax_and_ignores_pure_exclusions()
    {
        Assert.Equal("'ok':*", SearchQueryParser.Parse("ok & | ! ( )").TsQuery);
        Assert.Equal("", SearchQueryParser.Parse("-only").TsQuery);
        Assert.True(SearchQueryParser.Parse("   ").IsEmpty);
    }

    [Fact]
    public void Snippets_escape_html_but_keep_the_mark_tags()
    {
        Assert.Equal("a &lt;b&gt; <mark>hit</mark>", SearchService.CleanSnippet("a <b> <mark>hit</mark>"));
    }

    // --- §9.3 property validation -------------------------------------------------------------------------------------

    [Fact]
    public void Properties_are_validated_and_normalised_by_type()
    {
        var ok = PropertyService.Validate(Json(
            "{'Status':{'type':'select','value':'Active'}," +
            " 'Due':{'type':'date','value':{'start':'2026-01-02'}}," +
            " 'Tags':{'type':'multi_select','value':['a','b','a']}," +
            " 'Done':{'type':'checkbox','value':true}," +
            " 'Score':{'type':'number','value':3.5}}"), allowNullEntries: false);
        Assert.Equal("2026-01-02", ok.GetProperty("Due").GetProperty("value").GetProperty("start").GetString());
        Assert.Equal(2, ok.GetProperty("Tags").GetProperty("value").GetArrayLength());

        var bad = Assert.Throws<Nook.Application.Common.ValidationException>(() =>
            PropertyService.Validate(Json("{'Due':{'type':'date','value':'not-a-date'}}"), allowNullEntries: false));
        Assert.Contains("Due", bad.Errors!.Keys);

        Assert.Throws<Nook.Application.Common.ValidationException>(() =>
            PropertyService.Validate(Json("{'Link':{'type':'url','value':'not a url'}}"), allowNullEntries: false));
        Assert.Throws<Nook.Application.Common.ValidationException>(() =>
            PropertyService.Validate(Json("{'N':{'type':'number','value':'3'}}"), allowNullEntries: false));
        Assert.Throws<Nook.Application.Common.ValidationException>(() =>
            PropertyService.Validate(Json("{'X':{'type':'nonsense','value':1}}"), allowNullEntries: false));
    }

    // --- §9.8 export / import helpers ---------------------------------------------------------------------------------

    [Fact]
    public void Relative_export_paths_walk_up_and_down_the_tree()
    {
        Assert.Equal("Other.md", ExportPaths.Relative("Root.md", "Other.md"));
        Assert.Equal("Root/Child.md", ExportPaths.Relative("Root.md", "Root/Child.md"));
        Assert.Equal("../Root.md", ExportPaths.Relative("Root/Child.md", "Root.md"));
        Assert.Equal("../../A/B.md", ExportPaths.Relative("X/Y/Z.md", "A/B.md"));
        Assert.Equal("A%20B.md", ExportPaths.Relative("Root.md", "A B.md"));
    }

    [Fact]
    public void Export_rewrites_internal_markdown_links_to_relative_paths()
    {
        var target = Guid.NewGuid();
        var paths = new Dictionary<Guid, string> { [target] = "Root/Child.md" };
        var body = $"see [Child](nook://node/{target}) and [ext](https://example.com)";
        var rewritten = ZipExportWriter.RewriteLinks(body, markdown: true, "Root.md", paths, new Dictionary<Guid, string>());
        Assert.Equal("see [Child](Root/Child.md) and [ext](https://example.com)", rewritten);
    }

    [Fact]
    public void Frontmatter_carries_title_tags_aliases_and_properties()
    {
        var node = new Nook.Domain.Entities.Node
        {
            Title = "My \"page\"",
            CreatedAt = new DateTimeOffset(2026, 1, 2, 3, 4, 5, TimeSpan.Zero),
            UpdatedAt = new DateTimeOffset(2026, 1, 3, 0, 0, 0, TimeSpan.Zero),
            Properties = Json("{'Status':{'type':'select','value':'Active'}}"),
        };
        var fm = ZipExportWriter.Frontmatter(node, ["idea"], ["alias one"]);
        Assert.StartsWith("---\n", fm);
        Assert.Contains("title: \"My \\\"page\\\"\"", fm);
        Assert.Contains("tags: [\"idea\"]", fm);
        Assert.Contains("aliases: [\"alias one\"]", fm);
        Assert.Contains("created: 2026-01-02T03:04:05Z", fm);
        Assert.Contains("properties:", fm);
        Assert.Contains($"id: {node.Id}", fm);
    }

    [Fact]
    public void Csv_parsing_handles_quotes_separators_and_embedded_newlines()
    {
        var rows = CsvImporter.Parse("a,b\n\"x,1\",\"he said \"\"hi\"\"\"\n\"multi\nline\",z", ',');
        Assert.Equal(3, rows.Count);
        Assert.Equal(["a", "b"], rows[0]);
        Assert.Equal(["x,1", "he said \"hi\""], rows[1]);
        Assert.Equal(["multi\nline", "z"], rows[2]);
    }

    [Fact]
    public void Csv_becomes_a_single_table_block()
    {
        var table = BlockJson.Table([["h1", "h2"], ["a", "b"]]);
        var block = Assert.Single(table.EnumerateArray().ToList());
        Assert.Equal("table", block.GetProperty("type").GetString());
        var content = block.GetProperty("content");
        Assert.Equal("tableContent", content.GetProperty("type").GetString());
        Assert.Equal(2, content.GetProperty("rows").GetArrayLength());
        Assert.Equal("h1", content.GetProperty("rows")[0].GetProperty("cells")[0][0].GetProperty("text").GetString());
    }

    [Fact]
    public void Zip_paths_are_normalised_and_traversal_is_rejected()
    {
        Assert.Equal("a/b.md", ZipImporter.Normalize("./a/b.md"));
        Assert.Equal("b.md", ZipImporter.Normalize("a/../b.md"));
        Assert.Null(ZipImporter.Normalize("../escape.md"));
        Assert.Null(ZipImporter.Normalize("__MACOSX/x"));
        Assert.Equal("notes/img.png", ZipImporter.ResolveReference("img.png", "notes"));
        Assert.Equal("Other.md", ZipImporter.ResolveReference("../Other.md#b-1", "notes"));
        Assert.Equal("a b.png", ZipImporter.ResolveReference("a%20b.png", ""));
        Assert.Null(ZipImporter.ResolveReference("https://example.com", "notes"));
        Assert.Null(ZipImporter.ResolveReference("#anchor", "notes"));
    }

    [Fact]
    public void Markdown_frontmatter_supplies_the_page_title()
    {
        var (title, body) = ZipImporter.SplitFrontmatter("---\ntitle: \"From matter\"\ntags: [a]\n---\n# Heading\n\ntext");
        Assert.Equal("From matter", title);
        Assert.StartsWith("# Heading", body);
        Assert.Null(ZipImporter.SplitFrontmatter("no frontmatter").Title);
    }

    [Fact]
    public void Block_urls_are_rewritten_in_links_and_image_props()
    {
        var blocks = Json(
            "[{'id':'1','type':'image','props':{'url':'pic.png','caption':'c'},'children':[]}," +
            " {'id':'2','type':'paragraph','props':{},'content':[{'type':'link','href':'other.md','content':[]}],'children':[]}]");
        var rewritten = BlockJson.RewriteUrls(blocks, href => href == "pic.png" ? "/api/files/x" : href == "other.md" ? "/w/ws/p/n" : null);
        Assert.Equal("/api/files/x", rewritten[0].GetProperty("props").GetProperty("url").GetString());
        Assert.Equal("/w/ws/p/n", rewritten[1].GetProperty("content")[0].GetProperty("href").GetString());
    }
}

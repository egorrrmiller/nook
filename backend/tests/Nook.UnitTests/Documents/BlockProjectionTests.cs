using System.Text.Json;
using Nook.Application.Documents;
using Nook.Plugins.Sdk;

namespace Nook.UnitTests.Documents;

public class BlockProjectionTests
{
    private static JsonElement Json(string json) => JsonSerializer.Deserialize<JsonElement>(json);

    private const string Doc = """
        [
          {"id":"11111111-1111-4111-8111-111111111111","type":"heading","props":{"level":1},
           "content":[{"type":"text","text":"Hello","styles":{"bold":true}},{"type":"text","text":" world","styles":{}}],
           "children":[
             {"id":"22222222-2222-4222-8222-222222222222","type":"paragraph","props":{},
              "content":[{"type":"text","text":"child one","styles":{}}],"children":[]},
             {"id":"33333333-3333-4333-8333-333333333333","type":"bulletListItem","props":{},
              "content":[{"type":"link","href":"https://example.com","content":[{"type":"text","text":"a link","styles":{}}]}],
              "children":[
                {"id":"44444444-4444-4444-8444-444444444444","type":"paragraph","props":{},"content":[{"type":"text","text":"grandchild","styles":{}}],"children":[]}
              ]}
           ]},
          {"id":"55555555-5555-4555-8555-555555555555","type":"image","props":{"url":"https://x/y.png","caption":"A caption","name":"photo.png"},"children":[]},
          {"id":"66666666-6666-4666-8666-666666666666","type":"table","props":{},
           "content":{"type":"tableContent","rows":[{"cells":[[{"type":"text","text":"c1","styles":{}}],{"type":"tableCell","content":[{"type":"text","text":"c2","styles":{}}],"props":{}}]}]},
           "children":[]},
          {"id":"77777777-7777-4777-8777-777777777777","type":"divider","props":{},"children":[]}
        ]
        """;

    [Fact]
    public void Flatten_is_depth_first_with_parent_and_sibling_positions()
    {
        var rows = BlockFlattener.Flatten(Json(Doc));

        Assert.Equal(7, rows.Count);
        Assert.Equal(["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333",
            "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666",
            "77777777-7777-4777-8777-777777777777"], rows.Select(r => r.RawId));

        var heading = rows[0];
        Assert.Null(heading.ParentBlockId);
        Assert.Equal(0, heading.Position);
        Assert.Equal("heading", heading.Type);

        Assert.Equal(heading.Id, rows[1].ParentBlockId);
        Assert.Equal(0, rows[1].Position);
        Assert.Equal(heading.Id, rows[2].ParentBlockId);
        Assert.Equal(1, rows[2].Position);
        Assert.Equal(rows[2].Id, rows[3].ParentBlockId);
        Assert.Equal(0, rows[3].Position);

        Assert.Null(rows[4].ParentBlockId);
        Assert.Equal(1, rows[4].Position);
        Assert.Equal(2, rows[5].Position);
        Assert.Equal(3, rows[6].Position);
    }

    [Fact]
    public void Flatten_extracts_plain_text_generically()
    {
        var rows = BlockFlattener.Flatten(Json(Doc));

        Assert.Equal("Hello world", rows[0].PlainText);               // own inline text only, children excluded
        Assert.Equal("child one", rows[1].PlainText);
        Assert.Equal("a link", rows[2].PlainText);                    // link inline content
        Assert.Equal("A caption photo.png https://x/y.png", rows[4].PlainText); // props.caption / name / url
        Assert.Equal("c1 c2", rows[5].PlainText);                     // table content, both cell shapes
        Assert.Equal("", rows[6].PlainText);
        Assert.Null(rows[6].Content);
        Assert.Equal(1, rows[0].Props.GetProperty("level").GetInt32());
    }

    [Fact]
    public void Unknown_block_and_inline_types_are_handled_generically()
    {
        var rows = BlockFlattener.Flatten(Json("""
            [{"id":"a1b2c3d4-0000-4000-8000-000000000001","type":"fancyWidget","props":{"caption":"cap"},
              "content":[{"type":"mention","props":{"nodeId":"x","label":"Some page"}},{"type":"text","text":"tail","styles":{}}],"children":[]}]
            """));
        Assert.Single(rows);
        Assert.Equal("fancyWidget", rows[0].Type);
        Assert.Equal("Some page tail cap", rows[0].PlainText);
    }

    [Fact]
    public void Plugin_block_type_definition_overrides_text_extraction()
    {
        var custom = new Dictionary<string, IBlockTypeDefinition> { ["callout"] = new CalloutDef() };
        var rows = BlockFlattener.Flatten(Json("""
            [{"id":"a1b2c3d4-0000-4000-8000-000000000002","type":"callout","props":{"text":"from props"},"content":[{"type":"text","text":"ignored","styles":{}}],"children":[]}]
            """), custom);
        Assert.Equal("from props", rows[0].PlainText);
    }

    [Fact]
    public void Non_uuid_ids_map_deterministically_and_duplicates_are_dropped()
    {
        var a = BlockFlattener.ToGuid("custom-id");
        var b = BlockFlattener.ToGuid("custom-id");
        var c = BlockFlattener.ToGuid("custom-id-2");
        Assert.Equal(a, b);
        Assert.NotEqual(a, c);
        Assert.Equal(Guid.Parse("11111111-1111-4111-8111-111111111111"), BlockFlattener.ToGuid("11111111-1111-4111-8111-111111111111"));

        var rows = BlockFlattener.Flatten(Json("""
            [{"id":"dup","type":"paragraph","props":{},"content":[],"children":[]},
             {"id":"dup","type":"paragraph","props":{},"content":[],"children":[]},
             {"type":"paragraph","props":{},"content":[],"children":[]}]
            """));
        Assert.Single(rows);
    }

    [Fact]
    public void Text_is_whitespace_normalised()
    {
        Assert.Equal("a b c", BlockTextExtractor.Normalize("  a \n\t b   c  "));
        Assert.Equal("", BlockTextExtractor.Extract(Json("{\"type\":\"paragraph\",\"content\":[]}")));
        Assert.Equal("", BlockTextExtractor.Extract(Json("42")));
    }

    [Fact]
    public void Links_are_derived_from_mentions_embeds_and_internal_hrefs()
    {
        var target = Guid.NewGuid();
        var rows = BlockFlattener.Flatten(Json($$$"""
            [{"id":"a1b2c3d4-0000-4000-8000-000000000003","type":"paragraph","props":{},
              "content":[{"type":"mention","props":{"nodeId":"{{{target}}}"}},
                         {"type":"link","href":"/w/ws1/p/{{{target}}}","content":[]},
                         {"type":"link","href":"https://ext","content":[]}],"children":[]},
             {"id":"a1b2c3d4-0000-4000-8000-000000000004","type":"embed","props":{"nodeId":"{{{target}}}"},"children":[]}]
            """));
        var links = LinkExtractor.Extract(Guid.NewGuid(), rows);
        Assert.Equal(4, links.Count);
        Assert.Equal(3, links.Count(l => l.TargetNodeId == target));
        Assert.Contains(links, l => l.Kind == Nook.Domain.Enums.LinkKind.Embed);
        Assert.Contains(links, l => l.Kind == Nook.Domain.Enums.LinkKind.Url && l.Href == "https://ext");
    }

    private sealed class CalloutDef : IBlockTypeDefinition
    {
        public string TypeName => "callout";
        public string ExtractText(JsonElement block) => block.GetProperty("props").GetProperty("text").GetString() ?? "";
    }
}

using System.Text;
using Nook.Plugin.ObsidianImport;

namespace Nook.Plugin.ObsidianImport.Tests;

public sealed class ObsidianVaultParserTests
{
    [Fact]
    public void Parses_frontmatter_into_properties_and_preserves_unknown_keys()
    {
        var result = Parse(("notes/readme.md", "---\ntitle: My note\ntags: [one, #two]\ncustom: 42\n---\n# Heading\n\nBody #inline"));
        var page = Assert.Single(result.Pages);

        Assert.Equal("My note", page.Title);
        Assert.Equal("42", page.Properties["custom"].ToString());
        Assert.Equal(["inline", "one", "two"], page.Tags);
        Assert.Contains(result.Diagnostics, d => d.Code == "frontmatter.unknown" && d.Path == "notes/readme.md");
    }

    [Fact]
    public void Resolves_wikilinks_and_embeds_but_reports_broken_targets()
    {
        var result = Parse(
            ("A.md", "See [[Folder/B]] and ![[image.png]] and [[Missing|label]]."),
            ("Folder/B.md", "Target"),
            ("image.png", "png"));
        var page = result.Pages.Single(p => p.Path == "A.md");

        Assert.Contains(page.References, r => r.Kind == "wikilink" && r.ResolvedPath == "Folder/B.md");
        Assert.Contains(page.References, r => r.Kind == "embed" && r.ResolvedPath == "image.png");
        Assert.Contains(page.References, r => r.IsBroken && r.Raw.Contains("Missing", StringComparison.Ordinal));
        Assert.Contains(result.Diagnostics, d => d.Code == "link.broken");
    }

    [Fact]
    public void Recognizes_callouts_and_tags_while_ignoring_fenced_code()
    {
        var result = Parse(("Callout.md", "> [!warning]- Be careful\n> This is important.\n\n#real-tag\n\n```md\n#not-a-tag [[Nope]]\n```"));
        var page = Assert.Single(result.Pages);
        var callout = Assert.Single(page.Blocks, b => b.Kind == "callout");

        Assert.Equal("warning", callout.CalloutType);
        Assert.True(callout.CalloutFolded);
        Assert.Contains("This is important", callout.Text, StringComparison.Ordinal);
        Assert.Equal(["real-tag"], page.Tags);
        Assert.DoesNotContain(page.References, r => r.Raw.Contains("Nope", StringComparison.Ordinal));
    }

    [Fact]
    public void Builds_folder_and_attachment_plans_and_skips_canvas()
    {
        var result = Parse(
            ("Projects/Alpha/Note.md", "![[asset.pdf]]"),
            ("Projects/Alpha/asset.pdf", "pdf"),
            ("Projects/board.canvas", "{}"));

        Assert.Contains(result.Folders, f => f.Path == "Projects" && (f.ParentPath is null or ""));
        var attachment = Assert.Single(result.Attachments);
        Assert.Equal("Projects/Alpha/asset.pdf", attachment.Path);
        Assert.Equal("application/pdf", attachment.MimeType);
        Assert.Equal(["Projects/Alpha/Note.md"], attachment.ReferencedBy);
        Assert.Contains(result.Diagnostics, d => d.Code == "canvas.unsupported");
    }

    [Theory]
    [InlineData("../escape.md")]
    [InlineData("/absolute.md")]
    [InlineData("C:/absolute.md")]
    [InlineData("folder/../../escape.md")]
    [InlineData("folder/bad:name.md")]
    public void Rejects_unsafe_paths(string path)
    {
        Assert.Null(ObsidianVaultParser.NormalizePath(path));
        var result = Parse((path, "unsafe"));
        Assert.Empty(result.Pages);
        Assert.Contains(result.Diagnostics, d => d.Code == "path.unsafe");
    }

    [Fact]
    public void Reports_normalized_duplicates_without_silently_overwriting()
    {
        var result = Parse(("Note.md", "first"), ("./note.md", "second"));

        Assert.Single(result.Pages);
        Assert.Equal("first", result.Pages[0].Markdown);
        Assert.Contains(result.Diagnostics, d => d.Code == "path.duplicate");
    }

    private static ObsidianImportPlan Parse(params (string Path, string Content)[] files) =>
        new ObsidianVaultParser().Parse(files.Select(file => new ObsidianVaultFile(file.Path, Encoding.UTF8.GetBytes(file.Content))).ToArray());
}

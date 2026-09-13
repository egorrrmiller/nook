using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Nook.Application.Collab;

namespace Nook.IntegrationTests;

/// <summary>
/// In-memory <see cref="ICollabClient"/> registered by <see cref="NookApiFactory"/> so integration tests never need a
/// live collab service. Ops are counted (and kept), imports store title + blocks per node. The markdown/html
/// conversions implement the small subset the §9.8 importers and exporters rely on — ATX headings, paragraphs and
/// inline links — so a document round-trips with its structure intact.
/// </summary>
public sealed partial class FakeCollabClient : ICollabClient
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public ConcurrentDictionary<Guid, (string Title, JsonElement Blocks)> Documents { get; } = new();
    public ConcurrentQueue<(Guid NodeId, JsonElement Ops, Guid? UserId)> AppliedOps { get; } = new();
    public int OpsApplied => AppliedOps.Sum(o => o.Ops.ValueKind == JsonValueKind.Array ? o.Ops.GetArrayLength() : 1);

    /// <summary>Set to make every call throw <see cref="CollabUnavailableException"/> (tests the 503 path).</summary>
    public bool Unavailable { get; set; }

    public Task<int> ApplyOpsAsync(Guid nodeId, JsonElement ops, Guid? userId, CancellationToken ct)
    {
        Guard();
        var clone = ops.Clone();
        AppliedOps.Enqueue((nodeId, clone, userId));
        return Task.FromResult(clone.ValueKind == JsonValueKind.Array ? clone.GetArrayLength() : 1);
    }

    public Task ImportAsync(Guid nodeId, string title, JsonElement blocks, Guid? userId, CancellationToken ct)
    {
        Guard();
        Documents[nodeId] = (title, blocks.Clone());
        return Task.CompletedTask;
    }

    public Task<(string Title, JsonElement Blocks)> GetBlocksAsync(Guid nodeId, CancellationToken ct)
    {
        Guard();
        return Task.FromResult(Documents.TryGetValue(nodeId, out var doc) ? doc : ("", Parse("[]")));
    }

    public Task<string> ConvertToMarkdownAsync(JsonElement blocks, CancellationToken ct)
    {
        Guard();
        return Task.FromResult(BlocksToMarkdown(blocks));
    }

    public Task<string> ConvertToHtmlAsync(JsonElement blocks, string mode, CancellationToken ct)
    {
        Guard();
        return Task.FromResult(BlocksToHtml(blocks));
    }

    public Task<JsonElement> ConvertFromMarkdownAsync(string markdown, CancellationToken ct)
    {
        Guard();
        return Task.FromResult(MarkdownToBlocks(markdown));
    }

    public Task<JsonElement> ConvertFromHtmlAsync(string html, CancellationToken ct)
    {
        Guard();
        var title = Regex.Match(html, "<title[^>]*>.*?</title>", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        var body = title.Success ? html.Remove(title.Index, title.Length) : html;
        body = Regex.Replace(body, "<(script|style)[^>]*>.*?</\\1>", "", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        body = Regex.Replace(body, "<h([1-6])[^>]*>(.*?)</h\\1>",
            m => $"\n\n{new string('#', int.Parse(m.Groups[1].Value))} {StripTags(m.Groups[2].Value)}\n\n",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
        body = Regex.Replace(body, "<a[^>]*href=\"([^\"]*)\"[^>]*>(.*?)</a>",
            m => $"[{StripTags(m.Groups[2].Value)}]({m.Groups[1].Value})",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
        body = Regex.Replace(body, "</p>|<br\\s*/?>", "\n\n", RegexOptions.IgnoreCase);
        return Task.FromResult(MarkdownToBlocks(System.Net.WebUtility.HtmlDecode(StripTags(body))));
    }

    // --- conversions --------------------------------------------------------------------------------------------------

    [GeneratedRegex(@"\[(?<text>[^\]]*)\]\((?<href>[^)\s]*)\)")]
    private static partial Regex MarkdownLink();

    [GeneratedRegex(@"^(?<hashes>#{1,6})\s+(?<text>.*)$")]
    private static partial Regex Heading();

    /// <summary>Blank-line separated chunks; ATX headings become <c>heading</c> blocks, <c>[text](href)</c> becomes a link inline.</summary>
    public static JsonElement MarkdownToBlocks(string markdown)
    {
        var blocks = new List<object>();
        foreach (var chunk in markdown.Replace("\r\n", "\n").Split("\n\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var heading = Heading().Match(chunk);
            if (heading.Success)
            {
                blocks.Add(new
                {
                    id = Guid.NewGuid().ToString(),
                    type = "heading",
                    props = new { level = heading.Groups["hashes"].Value.Length },
                    content = Inline(heading.Groups["text"].Value.Trim()),
                    children = Array.Empty<object>(),
                });
                continue;
            }
            blocks.Add(new
            {
                id = Guid.NewGuid().ToString(),
                type = "paragraph",
                props = new { },
                content = Inline(chunk),
                children = Array.Empty<object>(),
            });
        }
        return JsonSerializer.SerializeToElement(blocks, Json);
    }

    private static object[] Inline(string text)
    {
        var items = new List<object>();
        var index = 0;
        foreach (Match m in MarkdownLink().Matches(text))
        {
            if (m.Index > index) items.Add(new { type = "text", text = text[index..m.Index], styles = new { } });
            items.Add(new
            {
                type = "link",
                href = m.Groups["href"].Value,
                content = new object[] { new { type = "text", text = m.Groups["text"].Value, styles = new { } } },
            });
            index = m.Index + m.Length;
        }
        if (index < text.Length) items.Add(new { type = "text", text = text[index..], styles = new { } });
        return items.ToArray();
    }

    public static string BlocksToMarkdown(JsonElement blocks)
    {
        var sb = new StringBuilder();
        Walk(blocks);
        return sb.ToString().Trim();

        void Walk(JsonElement array)
        {
            if (array.ValueKind != JsonValueKind.Array) return;
            foreach (var block in array.EnumerateArray())
            {
                var type = block.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : "paragraph";
                var text = InlineToMarkdown(block);
                if (type == "heading")
                {
                    var level = Level(block);
                    sb.Append(new string('#', level)).Append(' ').Append(text).Append("\n\n");
                }
                else if (type == "divider")
                {
                    sb.Append("---\n\n");
                }
                else
                {
                    sb.Append(text).Append("\n\n");
                }
                if (block.TryGetProperty("children", out var children)) Walk(children);
            }
        }
    }

    public static string BlocksToHtml(JsonElement blocks)
    {
        var sb = new StringBuilder();
        Walk(blocks);
        return sb.ToString();

        void Walk(JsonElement array)
        {
            if (array.ValueKind != JsonValueKind.Array) return;
            foreach (var block in array.EnumerateArray())
            {
                var type = block.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : "paragraph";
                var inner = InlineToHtml(block);
                if (type == "heading")
                {
                    var level = Level(block);
                    sb.Append($"<h{level}>{inner}</h{level}>\n");
                }
                else
                {
                    sb.Append($"<p>{inner}</p>\n");
                }
                if (block.TryGetProperty("children", out var children)) Walk(children);
            }
        }
    }

    private static int Level(JsonElement block) =>
        block.TryGetProperty("props", out var p) && p.ValueKind == JsonValueKind.Object
        && p.TryGetProperty("level", out var l) && l.ValueKind == JsonValueKind.Number
            ? Math.Clamp(l.GetInt32(), 1, 6)
            : 1;

    private static string InlineToMarkdown(JsonElement block)
    {
        var sb = new StringBuilder();
        Append(block.TryGetProperty("content", out var content) ? content : default);
        return sb.ToString();

        void Append(JsonElement element)
        {
            if (element.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in element.EnumerateArray())
                {
                    var type = item.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
                    if (type == "link")
                    {
                        var href = item.TryGetProperty("href", out var h) && h.ValueKind == JsonValueKind.String ? h.GetString() : "";
                        sb.Append('[').Append(TextOf(item)).Append("](").Append(href).Append(')');
                    }
                    else if (item.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
                    {
                        sb.Append(text.GetString());
                    }
                }
            }
            else if (element.ValueKind == JsonValueKind.Object && element.TryGetProperty("rows", out var rows) && rows.ValueKind == JsonValueKind.Array)
            {
                foreach (var row in rows.EnumerateArray())
                {
                    if (!row.TryGetProperty("cells", out var cells) || cells.ValueKind != JsonValueKind.Array) continue;
                    var texts = new List<string>();
                    foreach (var cell in cells.EnumerateArray())
                    {
                        var items = cell.ValueKind == JsonValueKind.Array ? cell : cell.TryGetProperty("content", out var cc) ? cc : default;
                        var cellText = new StringBuilder();
                        if (items.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var inner in items.EnumerateArray())
                                if (inner.TryGetProperty("text", out var it) && it.ValueKind == JsonValueKind.String) cellText.Append(it.GetString());
                        }
                        texts.Add(cellText.ToString());
                    }
                    sb.Append("| ").Append(string.Join(" | ", texts)).Append(" |\n");
                }
            }
        }
    }

    private static string TextOf(JsonElement item)
    {
        var sb = new StringBuilder();
        if (item.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
        {
            foreach (var inner in content.EnumerateArray())
                if (inner.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String) sb.Append(text.GetString());
        }
        return sb.ToString();
    }

    private static string InlineToHtml(JsonElement block) =>
        MarkdownLink().Replace(
            System.Net.WebUtility.HtmlEncode(InlineToMarkdown(block)),
            m => $"<a href=\"{m.Groups["href"].Value}\">{m.Groups["text"].Value}</a>");

    private static string StripTags(string html) => Regex.Replace(html, "<[^>]+>", "");

    // --- helpers ------------------------------------------------------------------------------------------------------

    private void Guard()
    {
        if (Unavailable) throw new CollabUnavailableException("FakeCollabClient.Unavailable = true");
    }

    public static JsonElement Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    /// <summary>Builds §4 paragraph blocks (one per string) with fresh ids.</summary>
    public static JsonElement Paragraphs(IEnumerable<string> texts)
    {
        var blocks = texts.Select(t => new
        {
            id = Guid.NewGuid().ToString(),
            type = "paragraph",
            props = new { textColor = "default", backgroundColor = "default", textAlignment = "left" },
            content = new[] { new { type = "text", text = t, styles = new { } } },
            children = Array.Empty<object>(),
        });
        return JsonSerializer.SerializeToElement(blocks, Json);
    }

    /// <summary>Plain text per top-level block (inline text nodes concatenated), depth-first.</summary>
    public static IEnumerable<string> Texts(JsonElement blocks)
    {
        if (blocks.ValueKind != JsonValueKind.Array) yield break;
        foreach (var block in blocks.EnumerateArray())
        {
            var sb = new StringBuilder();
            if (block.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
            {
                foreach (var inline in content.EnumerateArray())
                    if (inline.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String) sb.Append(text.GetString());
            }
            yield return sb.ToString();
            if (block.TryGetProperty("children", out var children))
                foreach (var t in Texts(children)) yield return t;
        }
    }
}

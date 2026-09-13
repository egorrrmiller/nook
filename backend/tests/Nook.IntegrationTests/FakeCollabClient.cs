using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using Nook.Application.Collab;

namespace Nook.IntegrationTests;

/// <summary>
/// In-memory <see cref="ICollabClient"/> registered by <see cref="NookApiFactory"/> so integration tests never need a
/// live collab service. Ops are counted (and kept), imports store title + blocks per node, conversions are trivial
/// (markdown = paragraphs joined by blank lines; html = <c>&lt;p&gt;</c> per block).
/// </summary>
public sealed class FakeCollabClient : ICollabClient
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
        return Task.FromResult(string.Join("\n\n", Texts(blocks)));
    }

    public Task<string> ConvertToHtmlAsync(JsonElement blocks, string mode, CancellationToken ct)
    {
        Guard();
        return Task.FromResult(string.Concat(Texts(blocks).Select(t => $"<p>{System.Net.WebUtility.HtmlEncode(t)}</p>")));
    }

    public Task<JsonElement> ConvertFromMarkdownAsync(string markdown, CancellationToken ct)
    {
        Guard();
        var paragraphs = markdown.Replace("\r\n", "\n").Split("\n\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return Task.FromResult(Paragraphs(paragraphs));
    }

    public Task<JsonElement> ConvertFromHtmlAsync(string html, CancellationToken ct)
    {
        Guard();
        var text = System.Text.RegularExpressions.Regex.Replace(html, "<[^>]+>", "\n");
        var paragraphs = text.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return Task.FromResult(Paragraphs(paragraphs));
    }

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

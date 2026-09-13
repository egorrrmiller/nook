using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Nook.Application.Contracts;

namespace Nook.IntegrationTests;

/// <summary>Helpers for the §9 tests: storing documents through the internal API and small block builders.</summary>
public static class KnowledgeTestClient
{
    /// <summary>Stores a document for <paramref name="nodeId"/> exactly as the collab service would (contracts §3).</summary>
    public static async Task<int> StoreDocumentAsync(this HttpClient client, Guid nodeId, string title, object blocks, int version, Guid? userId = null)
    {
        var res = await client.SendAsync(TestClient.Internal(HttpMethod.Put, $"/internal/documents/{nodeId}", new
        {
            ydoc = Convert.ToBase64String(Encoding.UTF8.GetBytes($"ydoc-{nodeId}-{version + 1}")),
            version,
            title,
            blocks,
            userIds = userId is { } u ? new[] { u.ToString() } : null,
        }));
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<InternalDocumentPutResponse>(TestClient.Json))!.Version;
    }

    /// <summary>One paragraph block with the given inline items (see <see cref="Text"/>, <see cref="Link"/>, <see cref="Mention"/>).</summary>
    public static object Paragraph(string id, params object[] content) =>
        new { id, type = "paragraph", props = new { }, content, children = Array.Empty<object>() };

    public static object Heading(string id, string text, int level = 1) =>
        new { id, type = "heading", props = new { level }, content = new object[] { Text(text) }, children = Array.Empty<object>() };

    public static object Text(string text) => new { type = "text", text, styles = new { } };

    public static object Link(string href, string text) =>
        new { type = "link", href, content = new object[] { Text(text) } };

    public static object Mention(Guid nodeId, string label) =>
        new { type = "mention", props = new { nodeId = nodeId.ToString(), label } };

    public static object PageBlocks(string id, string text) => Paragraph(id, Text(text));

    public static string NewBlockId() => Guid.NewGuid().ToString();

    public static async Task<JsonElement> PostJsonAsync(this HttpClient client, string url, object body)
    {
        var res = await client.PostAsJsonAsync(url, body, TestClient.Json);
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>();
    }

    public static async Task<T> PostJsonAsync<T>(this HttpClient client, string url, object body)
    {
        var res = await client.PostAsJsonAsync(url, body, TestClient.Json);
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<T>(TestClient.Json))!;
    }

    public static async Task<T> PutJsonAsync<T>(this HttpClient client, string url, object body)
    {
        var res = await client.PutAsJsonAsync(url, body, TestClient.Json);
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<T>(TestClient.Json))!;
    }
}

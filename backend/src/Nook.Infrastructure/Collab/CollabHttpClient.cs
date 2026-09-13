using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json;
using Nook.Application.Collab;

namespace Nook.Infrastructure.Collab;

/// <summary>
/// <see cref="ICollabClient"/> over the named <see cref="IHttpClientFactory"/> client <see cref="ClientName"/>
/// (base URL = <c>NOOK_COLLAB_INTERNAL_URL</c>, <c>X-Internal-Token</c> preset, 30 s timeout — see <see cref="DependencyInjection.AddCollabClient"/>).
/// Routes and payloads mirror <c>services/collab/src/internal-api.ts</c>.
/// </summary>
public sealed class CollabHttpClient(IHttpClientFactory factory) : ICollabClient
{
    public const string ClientName = "collab";
    public const string UserHeader = "X-Nook-User-Id";
    public const string TokenHeader = "X-Internal-Token";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<int> ApplyOpsAsync(Guid nodeId, JsonElement ops, Guid? userId, CancellationToken ct)
    {
        using var doc = await SendAsync(HttpMethod.Post, $"internal/docs/{nodeId}/ops", ops, userId, ct);
        return doc.RootElement.TryGetProperty("applied", out var applied) && applied.ValueKind == JsonValueKind.Number ? applied.GetInt32() : 0;
    }

    public async Task ImportAsync(Guid nodeId, string title, JsonElement blocks, Guid? userId, CancellationToken ct)
    {
        using var _ = await SendAsync(HttpMethod.Post, $"internal/docs/{nodeId}/import", new { title, blocks }, userId, ct);
    }

    public async Task<(string Title, JsonElement Blocks)> GetBlocksAsync(Guid nodeId, CancellationToken ct)
    {
        using var doc = await SendAsync(HttpMethod.Get, $"internal/docs/{nodeId}/blocks", body: null, userId: null, ct);
        var title = doc.RootElement.TryGetProperty("title", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() ?? "" : "";
        var blocks = doc.RootElement.TryGetProperty("blocks", out var b) ? b.Clone() : EmptyArray();
        return (title, blocks);
    }

    public Task<string> ConvertToMarkdownAsync(JsonElement blocks, CancellationToken ct)
        => ConvertToStringAsync(new { from = "blocks", to = "markdown", blocks }, ct);

    public Task<string> ConvertToHtmlAsync(JsonElement blocks, string mode, CancellationToken ct)
        => ConvertToStringAsync(new { from = "blocks", to = "html", blocks, htmlMode = mode == "lossy" ? "lossy" : "full" }, ct);

    public Task<JsonElement> ConvertFromMarkdownAsync(string markdown, CancellationToken ct)
        => ConvertToBlocksAsync(new { from = "markdown", to = "blocks", content = markdown }, ct);

    public Task<JsonElement> ConvertFromHtmlAsync(string html, CancellationToken ct)
        => ConvertToBlocksAsync(new { from = "html", to = "blocks", content = html }, ct);

    // --- plumbing ---------------------------------------------------------------------------------------------------

    private async Task<string> ConvertToStringAsync(object body, CancellationToken ct)
    {
        using var doc = await SendAsync(HttpMethod.Post, "internal/convert", body, userId: null, ct);
        return doc.RootElement.TryGetProperty("result", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() ?? "" : "";
    }

    private async Task<JsonElement> ConvertToBlocksAsync(object body, CancellationToken ct)
    {
        using var doc = await SendAsync(HttpMethod.Post, "internal/convert", body, userId: null, ct);
        return doc.RootElement.TryGetProperty("result", out var r) ? r.Clone() : EmptyArray();
    }

    private async Task<JsonDocument> SendAsync(HttpMethod method, string path, object? body, Guid? userId, CancellationToken ct)
    {
        var client = factory.CreateClient(ClientName);
        using var req = new HttpRequestMessage(method, path);
        if (userId is { } uid) req.Headers.Add(UserHeader, uid.ToString());
        if (body is not null) req.Content = JsonContent.Create(body, options: Json);

        HttpResponseMessage res;
        try
        {
            res = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex) when (ex is HttpRequestException or SocketException or OperationCanceledException or TaskCanceledException)
        {
            throw new CollabUnavailableException($"Collab service at {client.BaseAddress} is unavailable: {ex.Message}", ex);
        }

        using (res)
        {
            var text = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                var status = (int)res.StatusCode;
                var message = ExtractError(text) ?? $"HTTP {status}";
                if (status is 502 or 503 or 504) throw new CollabUnavailableException($"Collab service returned {status}: {message}");
                throw new CollabRequestException(status, $"Collab service rejected {method} /{path}: {message}");
            }
            if (string.IsNullOrWhiteSpace(text)) return JsonDocument.Parse("{}");
            try
            {
                return JsonDocument.Parse(text);
            }
            catch (JsonException ex)
            {
                throw new CollabRequestException((int)res.StatusCode, $"Collab service returned invalid JSON for {method} /{path}: {ex.Message}");
            }
        }
    }

    private static string? ExtractError(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        try
        {
            using var doc = JsonDocument.Parse(text);
            if (doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("error", out var e) && e.ValueKind == JsonValueKind.String)
                return e.GetString();
        }
        catch (JsonException)
        {
            // plain-text error body
        }
        return text.Length > 300 ? text[..300] : text;
    }

    private static JsonElement EmptyArray()
    {
        using var doc = JsonDocument.Parse("[]");
        return doc.RootElement.Clone();
    }
}

using System.Text.Json;
using Nook.Application.Common;

namespace Nook.Application.Collab;

/// <summary>
/// Backend → collab internal HTTP API (contracts §3, "Server-side edits"). Implemented by
/// <c>Nook.Infrastructure.Collab.CollabHttpClient</c>; integration tests swap in an in-memory fake.
/// Block payloads are opaque <see cref="JsonElement"/>s in the §4 shape.
/// </summary>
public interface ICollabClient
{
    /// <summary><c>POST /internal/docs/{nodeId}/ops</c> — applies an array of ops; returns the number applied.</summary>
    Task<int> ApplyOpsAsync(Guid nodeId, JsonElement ops, Guid? userId, CancellationToken ct);

    /// <summary><c>POST /internal/docs/{nodeId}/import</c> — creates/replaces the whole document from blocks.</summary>
    Task ImportAsync(Guid nodeId, string title, JsonElement blocks, Guid? userId, CancellationToken ct);

    /// <summary><c>GET /internal/docs/{nodeId}/blocks</c> — current title + blocks (from the live doc or the stored ydoc).</summary>
    Task<(string Title, JsonElement Blocks)> GetBlocksAsync(Guid nodeId, CancellationToken ct);

    /// <summary><c>POST /internal/convert</c> {from:"blocks", to:"markdown"}.</summary>
    Task<string> ConvertToMarkdownAsync(JsonElement blocks, CancellationToken ct);

    /// <summary><c>POST /internal/convert</c> {from:"blocks", to:"html"}; <paramref name="mode"/> is <c>full</c> or <c>lossy</c>.</summary>
    Task<string> ConvertToHtmlAsync(JsonElement blocks, string mode, CancellationToken ct);

    /// <summary><c>POST /internal/convert</c> {from:"markdown", to:"blocks"}.</summary>
    Task<JsonElement> ConvertFromMarkdownAsync(string markdown, CancellationToken ct);

    /// <summary><c>POST /internal/convert</c> {from:"html", to:"blocks"}.</summary>
    Task<JsonElement> ConvertFromHtmlAsync(string html, CancellationToken ct);
}

/// <summary>Where the collab internal API lives and how to authenticate to it (<c>NOOK_COLLAB_INTERNAL_URL</c> / <c>NOOK_INTERNAL_TOKEN</c>).</summary>
public sealed record CollabClientOptions(string BaseUrl, string InternalToken, TimeSpan? Timeout = null)
{
    public const string DefaultBaseUrl = "http://127.0.0.1:1235";
    public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(30);
}

/// <summary>The collab service could not be reached (connection refused, DNS, timeout) → 503.</summary>
public sealed class CollabUnavailableException(string message = "Collab service is unavailable", Exception? inner = null)
    : NookException(503, message)
{
    public Exception? Inner { get; } = inner;
}

/// <summary>The collab service answered with a non-success status (bad ops, backend error, …) → 502.</summary>
public sealed class CollabRequestException(int upstreamStatus, string message)
    : NookException(502, message)
{
    public int UpstreamStatus { get; } = upstreamStatus;
}

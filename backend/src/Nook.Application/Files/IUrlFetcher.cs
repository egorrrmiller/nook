namespace Nook.Application.Files;

/// <summary>
/// Server-side HTTP fetch with the SSRF guard (contracts §8): http(s) only, DNS is resolved and private/loopback/link-local/multicast
/// addresses are rejected for every hop, redirects are followed manually (max <see cref="UrlFetchOptions.MaxRedirects"/>).
/// </summary>
public interface IUrlFetcher
{
    /// <summary>Throws <see cref="Common.ValidationException"/> for invalid or blocked URLs and <see cref="HttpRequestException"/>/<see cref="TaskCanceledException"/> for network failures.</summary>
    Task<UrlFetchResult> FetchAsync(Uri url, UrlFetchOptions options, CancellationToken ct);
}

public sealed record UrlFetchOptions(long MaxBytes, TimeSpan Timeout, string? Accept = null, int MaxRedirects = 5);

public sealed class UrlFetchResult : IAsyncDisposable
{
    public required Uri FinalUrl { get; init; }
    public required int StatusCode { get; init; }
    public string? ContentType { get; init; }
    public string? Charset { get; init; }
    public string? FileName { get; init; }
    public long? ContentLength { get; init; }
    /// <summary>Body stream, capped at <see cref="UrlFetchOptions.MaxBytes"/> (throws <see cref="PayloadTooLargeException"/> beyond it).</summary>
    public required Stream Content { get; init; }
    public IDisposable? Owner { get; init; }

    public async ValueTask DisposeAsync()
    {
        await Content.DisposeAsync();
        Owner?.Dispose();
    }
}

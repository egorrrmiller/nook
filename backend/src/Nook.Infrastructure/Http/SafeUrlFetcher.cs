using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Nook.Application.Common;
using Nook.Application.Files;

namespace Nook.Infrastructure.Http;

/// <summary>
/// Runtime policy of the SSRF guard. Loopback targets are always blocked except for ports explicitly allowed here
/// (integration tests point link previews at a local test server).
/// </summary>
public sealed class UrlFetchGuard
{
    private readonly HashSet<int> _allowedLoopbackPorts = [];
    private readonly Lock _lock = new();

    public void AllowLoopbackPort(int port)
    {
        lock (_lock) _allowedLoopbackPorts.Add(port);
    }

    public bool IsAllowed(IPAddress address, int port)
    {
        if (IpGuard.IsPublic(address)) return true;
        var v4 = address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address;
        if (!IPAddress.IsLoopback(v4)) return false;
        lock (_lock) return _allowedLoopbackPorts.Contains(port);
    }

    /// <summary>Resolves <paramref name="host"/> and returns the allowed addresses; throws <see cref="BlockedAddressException"/> when none are.</summary>
    public async Task<IPAddress[]> ResolveAsync(string host, int port, CancellationToken ct)
    {
        IPAddress[] addresses;
        if (IPAddress.TryParse(host.Trim('[', ']'), out var literal))
        {
            addresses = [literal];
        }
        else
        {
            try
            {
                addresses = await Dns.GetHostAddressesAsync(host, ct);
            }
            catch (SocketException e)
            {
                throw new HttpRequestException($"Could not resolve host '{host}'.", e);
            }
        }
        if (addresses.Length == 0) throw new HttpRequestException($"Could not resolve host '{host}'.");
        var allowed = addresses.Where(a => IsAllowed(a, port)).ToArray();
        if (allowed.Length == 0) throw new BlockedAddressException($"'{host}' resolves to a private, loopback or otherwise non-public address.");
        return allowed;
    }
}

public static class SafeHttp
{
    public const string ClientName = "nook-fetch";

    /// <summary>Registers the named client whose every connection goes through <see cref="UrlFetchGuard"/> (redirects included).</summary>
    public static IServiceCollection AddSafeHttpClient(this IServiceCollection services)
    {
        services.AddSingleton<UrlFetchGuard>();
        services.AddScoped<IUrlFetcher, SafeUrlFetcher>();
        services.AddHttpClient(ClientName, c =>
            {
                c.Timeout = System.Threading.Timeout.InfiniteTimeSpan; // per-request timeouts are applied by SafeUrlFetcher
                c.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; Nook/1.0; +https://github.com/nook)");
                c.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en,ru;q=0.8");
            })
            .ConfigurePrimaryHttpMessageHandler(sp =>
            {
                var guard = sp.GetRequiredService<UrlFetchGuard>();
                return new SocketsHttpHandler
                {
                    AllowAutoRedirect = false,
                    UseCookies = false,
                    UseProxy = false,
                    AutomaticDecompression = DecompressionMethods.All,
                    ConnectTimeout = TimeSpan.FromSeconds(10),
                    PooledConnectionLifetime = TimeSpan.FromMinutes(2),
                    MaxResponseHeadersLength = 64,
                    ConnectCallback = async (ctx, ct) =>
                    {
                        var addresses = await guard.ResolveAsync(ctx.DnsEndPoint.Host, ctx.DnsEndPoint.Port, ct);
                        Exception? last = null;
                        foreach (var address in addresses)
                        {
                            var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
                            try
                            {
                                await socket.ConnectAsync(new IPEndPoint(address, ctx.DnsEndPoint.Port), ct);
                                return new NetworkStream(socket, ownsSocket: true);
                            }
                            catch (Exception e) when (e is not OperationCanceledException)
                            {
                                last = e;
                                socket.Dispose();
                            }
                        }
                        throw new HttpRequestException($"Could not connect to '{ctx.DnsEndPoint.Host}'.", last);
                    },
                };
            });
        return services;
    }
}

/// <summary>Manual redirect following (each hop re-validated: scheme + resolved address), header timeout and a hard byte cap on the body.</summary>
public sealed class SafeUrlFetcher(IHttpClientFactory factory, UrlFetchGuard guard, ILogger<SafeUrlFetcher> logger) : IUrlFetcher
{
    public async Task<UrlFetchResult> FetchAsync(Uri url, UrlFetchOptions options, CancellationToken ct)
    {
        var client = factory.CreateClient(SafeHttp.ClientName);
        var current = url;
        for (var hop = 0; ; hop++)
        {
            ValidateScheme(current);
            // Pre-check the literal/resolved address so blocked targets fail fast with a clear error (the connect callback re-checks).
            try { await guard.ResolveAsync(current.DnsSafeHost, current.Port, ct); }
            catch (BlockedAddressException e) { throw new ValidationException(e.Message); }

            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(options.Timeout);
            var request = new HttpRequestMessage(HttpMethod.Get, current);
            if (options.Accept is not null) request.Headers.Accept.ParseAdd(options.Accept);

            HttpResponseMessage response;
            try
            {
                response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            }
            catch (HttpRequestException e) when (Unwrap(e) is BlockedAddressException blocked)
            {
                throw new ValidationException(blocked.Message);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                throw new TaskCanceledException($"Fetching '{current}' timed out after {options.Timeout.TotalSeconds:0} s.");
            }

            if ((int)response.StatusCode is 301 or 302 or 303 or 307 or 308 && response.Headers.Location is { } location)
            {
                response.Dispose();
                if (hop >= options.MaxRedirects) throw new HttpRequestException("Too many redirects.");
                var next = location.IsAbsoluteUri ? location : new Uri(current, location);
                logger.LogDebug("Redirect {From} -> {To}", current, next);
                current = next;
                continue;
            }

            var content = await response.Content.ReadAsStreamAsync(ct);
            var mediaType = response.Content.Headers.ContentType;
            return new UrlFetchResult
            {
                FinalUrl = current,
                StatusCode = (int)response.StatusCode,
                ContentType = mediaType?.MediaType,
                Charset = mediaType?.CharSet,
                FileName = FileNameOf(response.Content.Headers.ContentDisposition),
                ContentLength = response.Content.Headers.ContentLength,
                Content = new CappedReadStream(content, options.MaxBytes),
                Owner = response,
            };
        }
    }

    private static void ValidateScheme(Uri url)
    {
        if (url.Scheme != Uri.UriSchemeHttp && url.Scheme != Uri.UriSchemeHttps)
            throw new ValidationException("Only http and https URLs are allowed.");
        if (!string.IsNullOrEmpty(url.UserInfo)) throw new ValidationException("URLs with credentials are not allowed.");
    }

    private static Exception? Unwrap(Exception e)
    {
        for (Exception? x = e; x is not null; x = x.InnerException)
        {
            if (x is BlockedAddressException) return x;
        }
        return null;
    }

    private static string? FileNameOf(ContentDispositionHeaderValue? cd)
    {
        var name = cd?.FileNameStar ?? cd?.FileName;
        if (string.IsNullOrWhiteSpace(name)) return null;
        return name.Trim().Trim('"');
    }
}

/// <summary>Read-only wrapper that throws <see cref="PayloadTooLargeException"/> once more than <c>max</c> bytes were read.</summary>
public sealed class CappedReadStream(Stream inner, long max) : Stream
{
    private long _read;

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => _read; set => throw new NotSupportedException(); }

    public override int Read(byte[] buffer, int offset, int count) => Account(inner.Read(buffer, offset, count));

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) =>
        Account(await inner.ReadAsync(buffer, cancellationToken));

    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
        ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

    private int Account(int n)
    {
        _read += n;
        if (max != FilesOptions.Unlimited && _read > max)
            throw new PayloadTooLargeException($"The response exceeds the limit of {max / (1024 * 1024)} MB.");
        return n;
    }

    public override void Flush() { }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    protected override void Dispose(bool disposing)
    {
        if (disposing) inner.Dispose();
        base.Dispose(disposing);
    }
}

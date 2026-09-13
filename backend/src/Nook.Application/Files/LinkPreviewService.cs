using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AngleSharp.Dom;
using AngleSharp.Html.Dom;
using AngleSharp.Html.Parser;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Nook.Application.Common;
using Nook.Domain.Entities;

namespace Nook.Application.Files;

/// <summary>
/// Resolves OpenGraph/Twitter metadata plus an oEmbed embed for a URL (contracts §8). Cached in <c>link_previews</c> for 7 days;
/// failures are answered with 200 <c>{url, finalUrl}</c> and cached for a short time only.
/// </summary>
public sealed class LinkPreviewService(IAppDbContext db, IUrlFetcher fetcher, IClock clock, ILogger<LinkPreviewService> logger)
{
    public static readonly TimeSpan CacheTtl = TimeSpan.FromDays(7);
    public static readonly TimeSpan FailureTtl = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);
    public const long MaxHtmlBytes = 1024 * 1024;
    public const long MaxOEmbedBytes = 256 * 1024;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<LinkPreviewDto> PreviewAsync(string rawUrl, CancellationToken ct)
    {
        var url = FileService.ParseHttpUrl(rawUrl);
        var normalized = url.ToString();
        var hash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(normalized)));
        var now = clock.UtcNow;

        var cached = await db.LinkPreviews.FirstOrDefaultAsync(p => p.UrlHash == hash, ct);
        if (cached is not null)
        {
            var dto = Deserialize(cached.Data);
            if (dto is not null)
            {
                var ttl = IsEmpty(dto) ? FailureTtl : CacheTtl;
                if (cached.FetchedAt > now - ttl) return dto;
            }
        }

        var result = await ResolveAsync(url, now, ct);
        var data = JsonSerializer.SerializeToElement(result, Json);
        if (cached is null)
        {
            db.LinkPreviews.Add(new LinkPreview { UrlHash = hash, Url = normalized, Data = data, FetchedAt = now });
        }
        else
        {
            cached.Data = data;
            cached.FetchedAt = now;
        }
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException e) { logger.LogDebug(e, "Link preview cache write raced for {Url}", normalized); }
        return result;
    }

    private static bool IsEmpty(LinkPreviewDto d) => d.Title is null && d.Description is null && d.ImageUrl is null && d.Embed is null && d.SiteName is null;

    private static LinkPreviewDto? Deserialize(JsonElement data)
    {
        try { return data.Deserialize<LinkPreviewDto>(Json); }
        catch (JsonException) { return null; }
    }

    private async Task<LinkPreviewDto> ResolveAsync(Uri url, DateTimeOffset now, CancellationToken ct)
    {
        var finalUrl = url;
        string? title = null, description = null, image = null, favicon = null, siteName = null;
        Uri? discoveredOEmbed = null;

        try
        {
            await using var page = await fetcher.FetchAsync(url, new UrlFetchOptions(MaxHtmlBytes, Timeout, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5"), ct);
            finalUrl = page.FinalUrl;
            if (page.StatusCode is >= 200 and < 300 && IsHtml(page.ContentType))
            {
                var html = await ReadCappedAsync(page.Content, MaxHtmlBytes, ct);
                using var htmlStream = new MemoryStream(html, writable: false);
                var doc = await new HtmlParser().ParseDocumentAsync(htmlStream, ct);
                title = Meta(doc, "og:title") ?? Meta(doc, "twitter:title") ?? Clean(doc.Title);
                description = Meta(doc, "og:description") ?? Meta(doc, "twitter:description") ?? Meta(doc, "description");
                image = Absolute(finalUrl, Meta(doc, "og:image") ?? Meta(doc, "og:image:url") ?? Meta(doc, "twitter:image") ?? Meta(doc, "twitter:image:src"));
                siteName = Meta(doc, "og:site_name");
                favicon = Absolute(finalUrl, Icon(doc)) ?? new Uri(finalUrl, "/favicon.ico").ToString();
                var link = doc.QuerySelectorAll("link[rel~='alternate']")
                    .OfType<IHtmlLinkElement>()
                    .FirstOrDefault(l => string.Equals(l.Type, "application/json+oembed", StringComparison.OrdinalIgnoreCase));
                if (link?.GetAttribute("href") is { Length: > 0 } href && Uri.TryCreate(finalUrl, href, out var o)) discoveredOEmbed = o;
            }
        }
        catch (Exception e) when (e is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            logger.LogInformation(e, "Link preview: page fetch failed for {Url}", url);
        }

        var embed = await ResolveEmbedAsync(finalUrl, discoveredOEmbed, ct);
        if (embed is not null && title is null && embed.Html is null && embed.Url is null) embed = null;

        return new LinkPreviewDto(url.ToString(), finalUrl.ToString(), title, description, image, favicon, siteName, embed, now);
    }

    private async Task<LinkEmbedDto?> ResolveEmbedAsync(Uri finalUrl, Uri? discovered, CancellationToken ct)
    {
        var match = OEmbedProviders.Match(finalUrl);
        LinkEmbedDto? direct = null;
        Uri? endpoint = discovered;
        var providerName = match?.Provider.Name;
        if (match is var (provider, m))
        {
            direct = provider.DirectEmbed?.Invoke(finalUrl, m);
            if (provider.OEmbedEndpoint is not null)
                endpoint = new Uri(provider.OEmbedEndpoint.Replace("{url}", Uri.EscapeDataString(finalUrl.ToString())));
        }
        if (endpoint is null) return direct;

        try
        {
            await using var res = await fetcher.FetchAsync(endpoint, new UrlFetchOptions(MaxOEmbedBytes, Timeout, Accept: "application/json"), ct);
            if (res.StatusCode is < 200 or >= 300) return direct;
            var json = await ReadCappedAsync(res.Content, MaxOEmbedBytes, ct);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var html = Str(root, "html");
            var width = Int(root, "width");
            var height = Int(root, "height");
            var name = providerName ?? Str(root, "provider_name") ?? endpoint.Host;
            double? aspect = width is > 0 && height is > 0 ? (double)width.Value / height.Value : direct?.AspectRatio;
            return new LinkEmbedDto(name, html ?? direct?.Html, direct?.Url ?? Str(root, "url"), width ?? direct?.Width, height ?? direct?.Height, aspect);
        }
        catch (Exception e) when (e is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            logger.LogInformation(e, "Link preview: oEmbed fetch failed for {Endpoint}", endpoint);
            return direct;
        }
    }

    // --- parsing helpers --------------------------------------------------------------------------------------------

    private static bool IsHtml(string? contentType) =>
        contentType is null || contentType.Contains("html", StringComparison.OrdinalIgnoreCase) || contentType.Contains("xml", StringComparison.OrdinalIgnoreCase);

    private static string? Meta(IDocument doc, string name)
    {
        foreach (var el in doc.QuerySelectorAll("meta"))
        {
            var key = el.GetAttribute("property") ?? el.GetAttribute("name");
            if (!string.Equals(key, name, StringComparison.OrdinalIgnoreCase)) continue;
            var content = Clean(el.GetAttribute("content"));
            if (content is not null) return content;
        }
        return null;
    }

    private static string? Icon(IDocument doc)
    {
        string? best = null;
        foreach (var el in doc.QuerySelectorAll("link[rel]"))
        {
            var rel = el.GetAttribute("rel")!.ToLowerInvariant();
            if (!rel.Split(' ', StringSplitOptions.RemoveEmptyEntries).Contains("icon") && rel != "apple-touch-icon") continue;
            var href = el.GetAttribute("href");
            if (string.IsNullOrWhiteSpace(href)) continue;
            if (rel == "apple-touch-icon") { best ??= href; continue; }
            return href;
        }
        return best;
    }

    private static string? Absolute(Uri baseUrl, string? href)
    {
        if (string.IsNullOrWhiteSpace(href)) return null;
        if (!Uri.TryCreate(baseUrl, href.Trim(), out var abs)) return null;
        if (abs.Scheme != Uri.UriSchemeHttp && abs.Scheme != Uri.UriSchemeHttps) return null;
        return abs.ToString();
    }

    private static string? Clean(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var collapsed = string.Join(' ', s.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return collapsed.Length > 1000 ? collapsed[..1000] : collapsed;
    }

    private static string? Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static int? Int(JsonElement e, string name)
    {
        if (!e.TryGetProperty(name, out var v)) return null;
        if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i)) return i;
        if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out var p)) return p;
        return null;
    }

    /// <summary>Reads at most <paramref name="max"/> bytes (truncating silently — a partial head is still worth parsing).</summary>
    private static async Task<byte[]> ReadCappedAsync(Stream s, long max, CancellationToken ct)
    {
        using var ms = new MemoryStream();
        var buffer = new byte[16 * 1024];
        long total = 0;
        int read;
        while (total < max && (read = await s.ReadAsync(buffer.AsMemory(0, (int)Math.Min(buffer.Length, max - total)), ct)) > 0)
        {
            total += read;
            ms.Write(buffer, 0, read);
        }
        return ms.ToArray();
    }
}

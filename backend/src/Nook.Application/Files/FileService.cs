using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Nook.Application.Common;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Files;

/// <summary>Uploads, metadata and deletion of attachments (contracts §8). Access = attachment → node → effective role.</summary>
public sealed class FileService(
    IAppDbContext db,
    IWorkspaceContextAccessor contextAccessor,
    NodeService nodes,
    IBlobStore blobs,
    IImageProcessor images,
    IUrlFetcher fetcher,
    IFileJobs jobs,
    FilesOptions options,
    IClock clock,
    IOutbox outbox,
    ILogger<FileService> logger)
{
    public static readonly int[] ThumbWidths = [160, 320, 640, 1280, 1920];
    public const int DefaultThumbWidth = 640;
    public static readonly TimeSpan FromUrlHeadersTimeout = TimeSpan.FromSeconds(10);

    private WorkspaceContext Ctx => contextAccessor.Required;

    private IQueryable<Attachment> Scoped => db.Attachments.Where(a => a.WorkspaceId == Ctx.WorkspaceId);

    /// <summary>Streams an upload into the blob store and creates the attachment row. The caller must hold Editor on the node.</summary>
    public async Task<AttachmentDto> UploadAsync(Stream content, string? filename, string? declaredMime, UploadTarget target, CancellationToken ct)
    {
        var purpose = AttachmentPurpose.Normalize(target.Purpose);
        var (node, _) = await nodes.RequireAsync(target.NodeId, WorkspaceRole.Editor, ct);
        ValidateTarget(target);

        var stored = await blobs.StoreAsync(content, options.MaxUploadBytes, ct);
        try
        {
            return await CreateAttachmentAsync(node, stored, filename, declaredMime, target with { Purpose = purpose }, ct);
        }
        catch
        {
            if (stored.IsNew) TryDelete(stored.Sha256);
            throw;
        }
    }

    /// <summary>Server-side fetch of a public URL (SSRF-guarded) into the blob store.</summary>
    public async Task<AttachmentDto> FromUrlAsync(FromUrlRequest request, CancellationToken ct)
    {
        var purpose = AttachmentPurpose.Normalize(request.Purpose);
        var target = new UploadTarget(request.NodeId, request.BlockId, request.PropertyId, purpose);
        var (node, _) = await nodes.RequireAsync(target.NodeId, WorkspaceRole.Editor, ct);
        ValidateTarget(target);

        var url = ParseHttpUrl(request.Url);
        UrlFetchResult fetched;
        try
        {
            fetched = await fetcher.FetchAsync(url, new UrlFetchOptions(options.MaxUploadBytes, FromUrlHeadersTimeout), ct);
        }
        catch (HttpRequestException e)
        {
            logger.LogInformation(e, "from-url fetch failed for {Url}", url);
            throw new ValidationException($"Could not fetch the URL: {e.Message}");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new ValidationException("Fetching the URL timed out.");
        }

        await using (fetched)
        {
            if (fetched.StatusCode is < 200 or >= 300) throw new ValidationException($"The URL answered HTTP {fetched.StatusCode}.");
            if (options.HasUploadLimit && fetched.ContentLength is > 0 && fetched.ContentLength > options.MaxUploadBytes)
                throw new PayloadTooLargeException($"The file exceeds the upload limit of {options.MaxUploadBytes / (1024 * 1024)} MB.");

            var stored = await blobs.StoreAsync(fetched.Content, options.MaxUploadBytes, ct);
            var filename = fetched.FileName ?? FileNameFromUrl(fetched.FinalUrl);
            try
            {
                return await CreateAttachmentAsync(node, stored, filename, fetched.ContentType, target, ct);
            }
            catch
            {
                if (stored.IsNew) TryDelete(stored.Sha256);
                throw;
            }
        }
    }

    public async Task<AttachmentDto> GetAsync(Guid id, CancellationToken ct)
    {
        var (attachment, _) = await RequireAsync(id, WorkspaceRole.Viewer, ct);
        return AttachmentDto.From(attachment);
    }

    public async Task<ExtractedFileTextDto> GetExtractedTextAsync(Guid id, CancellationToken ct)
    {
        var (attachment, _) = await RequireAsync(id, WorkspaceRole.Viewer, ct);
        var meta = AttachmentMeta.From(attachment.Meta);
        var text = attachment.ExtractedText ?? "";
        var pages = attachment.Mime == "application/pdf"
            ? text.Split('\f').Select((page, index) => new ExtractedTextPage(index + 1, page.Trim())).ToArray()
            : Array.Empty<ExtractedTextPage>();
        return new ExtractedFileTextDto(text.Replace("\f", "\n"), pages, meta.TextExtracted is not null, meta.TextExtracted == true);
    }

    /// <summary>Loads an attachment and asserts the caller holds <paramref name="minimum"/> on its node.</summary>
    public async Task<(Attachment Attachment, WorkspaceRole Role)> RequireAsync(Guid id, WorkspaceRole minimum, CancellationToken ct)
    {
        var attachment = await Scoped.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, ct)
                         ?? throw new NotFoundException("File not found.");
        var (_, role) = await nodes.RequireAsync(attachment.NodeId, minimum, ct);
        return (attachment, role);
    }

    public async Task<IReadOnlyList<AttachmentDto>> ListForNodeAsync(Guid nodeId, CancellationToken ct)
    {
        await nodes.RequireAsync(nodeId, WorkspaceRole.Viewer, ct);
        var rows = await Scoped.AsNoTracking().Where(a => a.NodeId == nodeId).OrderBy(a => a.CreatedAt).ToListAsync(ct);
        return rows.Select(AttachmentDto.From).ToList();
    }

    /// <summary>Deletes the row only; the blob stays until <c>blob-gc</c> finds it unreferenced for 24 h.</summary>
    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        var ctx = Ctx;
        var attachment = await Scoped.FirstOrDefaultAsync(a => a.Id == id, ct) ?? throw new NotFoundException("File not found.");
        await nodes.RequireAsync(attachment.NodeId, WorkspaceRole.Editor, ct);
        db.Attachments.Remove(attachment);
        outbox.Enqueue(new AttachmentDeleted(ctx.WorkspaceId, attachment.NodeId, attachment.Id));
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Returns the cached webp derivative for <paramref name="width"/>, generating it on first use. 404 for non-images, 503 without libvips.</summary>
    public async Task<Stream> ThumbnailAsync(Attachment attachment, int width, CancellationToken ct)
    {
        if (!MimeSniffer.IsThumbnailable(attachment.Mime)) throw new NotFoundException("Not an image.");
        if (!ThumbWidths.Contains(width)) throw new ValidationException($"w must be one of {string.Join(", ", ThumbWidths)}.");

        var spec = $"w{width}";
        var cached = blobs.OpenDerivative(attachment.BlobSha, spec);
        if (cached is not null) return cached;

        if (!images.IsAvailable) throw new ServiceUnavailableException("Image processing is unavailable (libvips failed to load).");
        byte[] webp;
        try
        {
            await using var source = blobs.OpenRead(attachment.BlobSha);
            webp = await images.ThumbnailWebpAsync(source, width, ct);
        }
        catch (FileNotFoundException)
        {
            throw new NotFoundException("File content is missing.");
        }
        catch (Exception e) when (e is not OperationCanceledException and not NookException)
        {
            logger.LogWarning(e, "Thumbnail generation failed for attachment {Id} ({Mime})", attachment.Id, attachment.Mime);
            throw new ServiceUnavailableException("Thumbnail generation failed.");
        }
        await blobs.WriteDerivativeAsync(attachment.BlobSha, spec, webp, ct);
        return new MemoryStream(webp, writable: false);
    }

    // --- helpers ----------------------------------------------------------------------------------------------------

    private async Task<AttachmentDto> CreateAttachmentAsync(Node node, StoredBlob stored, string? filename, string? declaredMime, UploadTarget target, CancellationToken ct)
    {
        var ctx = Ctx;
        var name = SanitizeFilename(filename);
        var mime = MimeSniffer.Sniff(stored.Head, declaredMime, name);
        var now = clock.UtcNow;

        var blob = await db.Blobs.FindAsync([stored.Sha256], ct);
        if (blob is null)
        {
            db.Blobs.Add(new Blob { Sha256 = stored.Sha256, Size = stored.Size, Mime = mime, StoredAt = now });
        }

        var meta = new AttachmentMeta();
        if (MimeSniffer.IsImage(mime) && images.IsAvailable)
        {
            try
            {
                await using var s = blobs.OpenRead(stored.Sha256);
                if (images.Dimensions(s) is var (w, h)) meta = meta with { Width = w, Height = h };
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                logger.LogDebug(e, "Could not read image dimensions for {Sha}", stored.Sha256);
            }
        }

        var attachment = new Attachment
        {
            WorkspaceId = ctx.WorkspaceId,
            BlobSha = stored.Sha256,
            NodeId = node.Id,
            BlockId = target.BlockId,
            PropertyId = string.IsNullOrWhiteSpace(target.PropertyId) ? null : target.PropertyId.Trim(),
            Purpose = target.Purpose ?? AttachmentPurpose.Content,
            Filename = name,
            Mime = mime,
            Size = stored.Size,
            Meta = meta.ToJson(),
            CreatedAt = now,
        };
        db.Attachments.Add(attachment);
        outbox.Enqueue(new AttachmentCreated(ctx.WorkspaceId, node.Id, attachment.Id));
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException) when (blob is null)
        {
            // A concurrent upload of the same content may have inserted the blob row first: retry with the existing row.
            if (!await db.Blobs.AsNoTracking().AnyAsync(b => b.Sha256 == stored.Sha256, ct)) throw;
            db.Blobs.Entry(db.Blobs.Local.First(b => b.Sha256 == stored.Sha256)).State = EntityState.Unchanged;
            await db.SaveChangesAsync(ct);
        }

        jobs.EnqueueExtraction(attachment.Id);
        return AttachmentDto.From(attachment);
    }

    private static void ValidateTarget(UploadTarget target)
    {
        if (target.PropertyId is { Length: > 100 }) throw new ValidationException("propertyId is too long (max 100 chars).");
    }

    private void TryDelete(string sha256)
    {
        try { blobs.Delete(sha256); }
        catch (Exception e) { logger.LogDebug(e, "Could not remove blob {Sha} after a failed upload", sha256); }
    }

    public static Uri ParseHttpUrl(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw) || !Uri.TryCreate(raw.Trim(), UriKind.Absolute, out var url))
            throw new ValidationException("url must be an absolute http(s) URL.");
        if (url.Scheme != Uri.UriSchemeHttp && url.Scheme != Uri.UriSchemeHttps)
            throw new ValidationException("Only http and https URLs are allowed.");
        if (!string.IsNullOrEmpty(url.UserInfo)) throw new ValidationException("URLs with credentials are not allowed.");
        return url;
    }

    public static string SanitizeFilename(string? filename)
    {
        var name = (filename ?? "").Trim();
        name = name.Replace('\\', '/');
        var slash = name.LastIndexOf('/');
        if (slash >= 0) name = name[(slash + 1)..];
        name = new string(name.Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (name.Length == 0 || name is "." or "..") name = "file";
        if (name.Length > 255) name = name[..255];
        return name;
    }

    private static string FileNameFromUrl(Uri url)
    {
        var last = url.Segments.LastOrDefault()?.Trim('/');
        var name = string.IsNullOrEmpty(last) ? url.Host : Uri.UnescapeDataString(last);
        return SanitizeFilename(name);
    }

    public static JsonElement MergeMeta(JsonElement? existing, AttachmentMeta update)
    {
        var current = AttachmentMeta.From(existing);
        var merged = current with
        {
            Width = update.Width ?? current.Width,
            Height = update.Height ?? current.Height,
            Duration = update.Duration ?? current.Duration,
            Pages = update.Pages ?? current.Pages,
            TextExtracted = update.TextExtracted ?? current.TextExtracted,
        };
        return merged.ToJson();
    }
}

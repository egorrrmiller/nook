using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;
using Nook.Api.Auth;
using Nook.Application.Common;
using Nook.Application.Files;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;

namespace Nook.Api.Endpoints;

/// <summary>Files, thumbnails, covers and link previews (contracts §8).</summary>
public static class FileEndpoints
{
    private const string CacheControlValue = "private, max-age=31536000";

    /// <summary>OpenAPI description of the multipart upload body.</summary>
    public sealed record UploadFileForm(IFormFile File, Guid NodeId, Guid? BlockId, string? PropertyId, string? Purpose);

    public static RouteGroupBuilder MapFileEndpoints(this RouteGroupBuilder api)
    {
        var files = api.MapGroup("/files").WithTags("Files");

        files.MapPost("/", UploadAsync)
            .AddEndpointFilter<WorkspaceContextFilter>()
            .WithName("UploadFile")
            .Accepts<UploadFileForm>("multipart/form-data")
            .WithDescription("multipart/form-data: file, nodeId (required), blockId?, propertyId?, purpose? (content|icon|cover). 413 when NOOK_MAX_UPLOAD_MB is exceeded.")
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge);

        files.MapPost("/from-url", async Task<Created<AttachmentDto>> (FromUrlRequest request, FileService service, CancellationToken ct) =>
            {
                var dto = await service.FromUrlAsync(request, ct);
                return TypedResults.Created(dto.Url, dto);
            })
            .AddEndpointFilter<WorkspaceContextFilter>()
            .WithName("UploadFileFromUrl")
            .WithDescription("Server-side fetch (SSRF-guarded: public http(s) hosts only, 10 s header timeout, upload size limit).");

        // The byte-serving endpoints are used from <img>/<video>/<a> tags, which cannot send X-Workspace-Id:
        // when the header is absent the workspace is taken from the attachment itself (access is still membership/share + node role).
        var byId = files.MapGroup("/{id:guid}").AddEndpointFilter<AttachmentWorkspaceFilter>();

        byId.MapGet("/", GetContentAsync)
            .WithName("GetFile")
            .WithDescription("Bytes with Range support (206), ETag = sha256, Cache-Control: private, max-age=31536000. Inline unless ?download=1. SVG/HTML are served as application/octet-stream unless downloaded.");

        byId.MapGet("/thumb", GetThumbAsync)
            .WithName("GetFileThumb")
            .WithDescription("image/webp derivative; w ∈ {160, 320, 640, 1280, 1920} (default 640). 404 for non-images, 503 when libvips is unavailable.")
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);

        byId.MapGet("/meta", async Task<Ok<AttachmentDto>> (Guid id, FileService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetAsync(id, ct)))
            .WithName("GetFileMeta");

        byId.MapDelete("/", async Task<NoContent> (Guid id, FileService service, CancellationToken ct) =>
            {
                await service.DeleteAsync(id, ct);
                return TypedResults.NoContent();
            })
            .WithName("DeleteFile")
            .WithDescription("Deletes the attachment row; the blob is removed by the daily blob-gc job once unreferenced for 24 h.");

        api.MapGet("/nodes/{id:guid}/files", async Task<Ok<IReadOnlyList<AttachmentDto>>> (Guid id, FileService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ListForNodeAsync(id, ct)))
            .AddEndpointFilter<WorkspaceContextFilter>()
            .WithTags("Files")
            .WithName("ListNodeFiles");

        api.MapGet("/covers", Ok<IReadOnlyList<CoverDto>> (CoverGallery gallery) => TypedResults.Ok(gallery.Covers))
            .WithTags("Files")
            .WithName("ListCovers")
            .WithDescription("Built-in cover gallery served from /covers/*.");

        api.MapPost("/links/preview", async Task<Ok<LinkPreviewDto>> (LinkPreviewRequest request, LinkPreviewService service, CancellationToken ct) =>
                TypedResults.Ok(await service.PreviewAsync(request.Url, ct)))
            .WithTags("Files")
            .WithName("PreviewLink")
            .WithDescription("OpenGraph/Twitter/oEmbed preview, cached 7 days. Failures answer 200 with just {url, finalUrl}.");

        return api;
    }

    private static async Task<Created<AttachmentDto>> UploadAsync(HttpContext http, FileService service, FilesOptions options, CancellationToken ct)
    {
        var request = http.Request;
        if (!request.HasFormContentType || !MediaTypeHeaderValue.TryParse(request.ContentType, out var contentType)
            || !contentType.MediaType.Equals("multipart/form-data", StringComparison.OrdinalIgnoreCase))
            throw new ValidationException("Expected multipart/form-data.");
        var boundary = HeaderUtilities.RemoveQuotes(contentType.Boundary).Value;
        if (string.IsNullOrWhiteSpace(boundary)) throw new ValidationException("Missing multipart boundary.");

        // Allow the whole upload plus some slack for the other fields (Kestrel defaults to 30 MB).
        var sizeFeature = http.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (sizeFeature is { IsReadOnly: false }) sizeFeature.MaxRequestBodySize = options.MaxUploadBytes + 1024 * 1024;

        var reader = new MultipartReader(boundary, request.Body) { HeadersLengthLimit = 16 * 1024 };
        var fields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        string? tempPath = null;
        string? fileName = null;
        string? declaredMime = null;
        try
        {
            MultipartSection? section;
            while ((section = await reader.ReadNextSectionAsync(ct)) is not null)
            {
                if (!ContentDispositionHeaderValue.TryParse(section.ContentDisposition, out var disposition) || !disposition.DispositionType.Equals("form-data")) continue;
                var name = HeaderUtilities.RemoveQuotes(disposition.Name).Value ?? "";
                var isFile = disposition.FileName.HasValue || disposition.FileNameStar.HasValue;
                if (isFile || name.Equals("file", StringComparison.OrdinalIgnoreCase))
                {
                    if (tempPath is not null) throw new ValidationException("Only one file per request.");
                    fileName = HeaderUtilities.RemoveQuotes(disposition.FileNameStar.HasValue ? disposition.FileNameStar : disposition.FileName).Value;
                    declaredMime = section.ContentType;
                    // Spool the part to a temp file so field order in the form does not matter (nodeId may come after the file).
                    tempPath = Path.Combine(Path.GetTempPath(), "nook-upload-" + Guid.NewGuid().ToString("N"));
                    await using var spool = new FileStream(tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1 << 16, FileOptions.Asynchronous);
                    await CopyCappedAsync(section.Body, spool, options.MaxUploadBytes, ct);
                }
                else
                {
                    using var streamReader = new StreamReader(section.Body, leaveOpen: true);
                    var value = await streamReader.ReadToEndAsync(ct);
                    if (value.Length > 4096) throw new ValidationException($"Field '{name}' is too long.");
                    fields[name] = value;
                }
            }

            if (tempPath is null) throw new ValidationException("Missing 'file' part.");
            if (!fields.TryGetValue("nodeId", out var nodeIdRaw) || !Guid.TryParse(nodeIdRaw, out var nodeId))
                throw new ValidationException("nodeId is required.", new Dictionary<string, string[]> { ["nodeId"] = ["nodeId (uuid) is required."] });
            Guid? blockId = null;
            if (fields.TryGetValue("blockId", out var blockRaw) && !string.IsNullOrWhiteSpace(blockRaw))
            {
                if (!Guid.TryParse(blockRaw, out var b)) throw new ValidationException("blockId must be a uuid.");
                blockId = b;
            }
            fields.TryGetValue("propertyId", out var propertyId);
            fields.TryGetValue("purpose", out var purpose);

            await using var content = new FileStream(tempPath, FileMode.Open, FileAccess.Read, FileShare.None, 1 << 16, FileOptions.Asynchronous | FileOptions.SequentialScan | FileOptions.DeleteOnClose);
            var dto = await service.UploadAsync(content, fileName, declaredMime, new UploadTarget(nodeId, blockId, propertyId, purpose), ct);
            return TypedResults.Created(dto.Url, dto);
        }
        finally
        {
            if (tempPath is not null && File.Exists(tempPath))
            {
                try { File.Delete(tempPath); } catch (IOException) { }
            }
        }
    }

    private static async Task CopyCappedAsync(Stream source, Stream destination, long max, CancellationToken ct)
    {
        var buffer = new byte[1 << 16];
        long total = 0;
        int read;
        while ((read = await source.ReadAsync(buffer, ct)) > 0)
        {
            total += read;
            if (total > max) throw new PayloadTooLargeException($"The file exceeds the upload limit of {max / (1024 * 1024)} MB.");
            await destination.WriteAsync(buffer.AsMemory(0, read), ct);
        }
    }

    private static async Task<IResult> GetContentAsync(Guid id, string? download, HttpContext http, FileService service, IBlobStore blobs, CancellationToken ct)
    {
        var (attachment, _) = await service.RequireAsync(id, WorkspaceRole.Viewer, ct);
        Stream stream;
        try { stream = blobs.OpenRead(attachment.BlobSha); }
        catch (FileNotFoundException) { throw new NotFoundException("File content is missing."); }

        var asDownload = download is "1" or "true";
        var contentType = !asDownload && MimeSniffer.IsActiveContent(attachment.Mime) ? MimeSniffer.OctetStream : attachment.Mime;
        var disposition = new ContentDispositionHeaderValue(asDownload ? "attachment" : "inline");
        disposition.SetHttpFileName(attachment.Filename);

        var headers = http.Response.Headers;
        headers.ContentDisposition = disposition.ToString();
        headers.CacheControl = CacheControlValue;
        headers.XContentTypeOptions = "nosniff";
        headers.ContentSecurityPolicy = "default-src 'none'; sandbox";
        return TypedResults.Stream(stream, contentType, lastModified: attachment.CreatedAt, entityTag: new EntityTagHeaderValue($"\"{attachment.BlobSha}\""), enableRangeProcessing: true);
    }

    private static async Task<IResult> GetThumbAsync(Guid id, int? w, HttpContext http, FileService service, CancellationToken ct)
    {
        var (attachment, _) = await service.RequireAsync(id, WorkspaceRole.Viewer, ct);
        var width = w ?? FileService.DefaultThumbWidth;
        var stream = await service.ThumbnailAsync(attachment, width, ct);
        var headers = http.Response.Headers;
        headers.CacheControl = CacheControlValue;
        headers.XContentTypeOptions = "nosniff";
        return TypedResults.Stream(stream, "image/webp", lastModified: attachment.CreatedAt, entityTag: new EntityTagHeaderValue($"\"{attachment.BlobSha}-w{width}\""), enableRangeProcessing: false);
    }
}

/// <summary>
/// Like <see cref="WorkspaceContextFilter"/>, but when <c>X-Workspace-Id</c> is absent the workspace is resolved from the attachment
/// in the route (<c>{id}</c>), so plain <c>&lt;img src="/api/files/{id}"&gt;</c> requests work. Access rules are unchanged: the caller
/// must be a member of (or hold a share in) that workspace and have at least Viewer on the node.
/// </summary>
public sealed class AttachmentWorkspaceFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var accessor = http.RequestServices.GetRequiredService<IWorkspaceContextAccessor>();
        if (accessor.Current is null)
        {
            var currentUser = http.RequestServices.GetRequiredService<ICurrentUser>();
            var resolver = http.RequestServices.GetRequiredService<WorkspaceContextResolver>();
            var raw = http.Request.Headers[WorkspaceContextFilter.HeaderName].ToString();
            if (!string.IsNullOrEmpty(raw))
            {
                if (!Guid.TryParse(raw, out var workspaceId)) throw new ForbiddenException($"Invalid {WorkspaceContextFilter.HeaderName} header.");
                accessor.Current = await resolver.ResolveAsync(currentUser.UserId, workspaceId, http.RequestAborted);
            }
            else
            {
                if (!Guid.TryParse(http.Request.RouteValues["id"]?.ToString(), out var attachmentId)) throw new NotFoundException("File not found.");
                var db = http.RequestServices.GetRequiredService<IAppDbContext>();
                var workspaceId = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.FirstOrDefaultAsync(
                    db.Attachments.Where(a => a.Id == attachmentId).Select(a => (Guid?)a.WorkspaceId), http.RequestAborted);
                if (workspaceId is null) throw new NotFoundException("File not found.");
                accessor.Current = await resolver.ResolveAsync(currentUser.UserId, workspaceId.Value, http.RequestAborted);
            }
        }
        return await next(context);
    }
}

/// <summary>The built-in cover gallery: <c>wwwroot/covers/covers.json</c> (generated by <c>scripts/gen-covers.py</c>).</summary>
public sealed class CoverGallery
{
    public CoverGallery(IWebHostEnvironment env, ILogger<CoverGallery> logger)
    {
        var path = Path.Combine(CoversDirectory(env), "covers.json");
        var covers = new List<CoverDto>();
        if (File.Exists(path))
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(path));
                foreach (var item in doc.RootElement.EnumerateArray())
                {
                    var id = item.GetProperty("id").GetString()!;
                    var file = item.GetProperty("file").GetString()!;
                    covers.Add(new CoverDto(id, item.GetProperty("name").GetString()!, item.GetProperty("group").GetString()!, $"/covers/{file}", $"/covers/{file}"));
                }
            }
            catch (Exception e) when (e is JsonException or KeyNotFoundException or InvalidOperationException)
            {
                logger.LogWarning(e, "covers.json is malformed; the gallery is empty");
            }
        }
        else
        {
            logger.LogWarning("Cover gallery manifest not found at {Path}", path);
        }
        Covers = covers;
    }

    public IReadOnlyList<CoverDto> Covers { get; }

    public static string CoversDirectory(IWebHostEnvironment env) =>
        Path.Combine(env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot"), "covers");
}

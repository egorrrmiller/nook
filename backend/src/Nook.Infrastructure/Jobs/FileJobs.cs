using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Nook.Application.Files;
using Nook.Infrastructure.Files;
using Nook.Infrastructure.Files.Extractors;
using Nook.Infrastructure.Persistence;
using Nook.Plugins.Sdk;

namespace Nook.Infrastructure.Jobs;

/// <summary>Enqueues file jobs on the Hangfire queue <c>files</c>.</summary>
public sealed class HangfireFileJobs(IBackgroundJobClient client) : IFileJobs
{
    public void EnqueueExtraction(Guid attachmentId) =>
        client.Enqueue<FileExtractionJob>(j => j.RunAsync(attachmentId, CancellationToken.None));
}

/// <summary>
/// Background metadata/text extraction for one attachment: image dimensions (libvips), mp4/wav duration (container headers),
/// PDF page count, and text through the first <see cref="IFileTextExtractor"/> whose MIME list matches.
/// </summary>
public sealed class FileExtractionJob(
    AppDbContext db,
    IBlobStore blobs,
    IImageProcessor images,
    IEnumerable<IFileTextExtractor> extractors,
    ILogger<FileExtractionJob> logger)
{
    public const string QueueName = "files";

    [Queue(QueueName)]
    [AutomaticRetry(Attempts = 3)]
    public async Task RunAsync(Guid attachmentId, CancellationToken ct)
    {
        var attachment = await db.Attachments.FirstOrDefaultAsync(a => a.Id == attachmentId, ct);
        if (attachment is null)
        {
            logger.LogDebug("Extraction skipped: attachment {Id} no longer exists", attachmentId);
            return;
        }
        if (!blobs.Exists(attachment.BlobSha))
        {
            logger.LogWarning("Extraction skipped: blob {Sha} of attachment {Id} is missing on disk", attachment.BlobSha, attachmentId);
            return;
        }

        var meta = new AttachmentMeta();
        var mime = attachment.Mime;

        if (MimeSniffer.IsImage(mime) && images.IsAvailable)
        {
            await using var s = blobs.OpenRead(attachment.BlobSha);
            if (images.Dimensions(s) is var (w, h)) meta = meta with { Width = w, Height = h };
        }

        if (mime.StartsWith("video/", StringComparison.Ordinal) || mime.StartsWith("audio/", StringComparison.Ordinal))
        {
            await using var s = blobs.OpenRead(attachment.BlobSha);
            meta = meta with { Duration = MediaProbe.Duration(s, mime) };
        }

        if (mime == "application/pdf")
        {
            try
            {
                await using var s = blobs.OpenRead(attachment.BlobSha);
                meta = meta with { Pages = PdfTextExtractor.PageCount(s) };
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                logger.LogInformation(e, "Could not count pages of attachment {Id}", attachmentId);
            }
        }

        var extractor = Pick(mime);
        if (extractor is not null)
        {
            try
            {
                await using var s = blobs.OpenRead(attachment.BlobSha);
                var text = await extractor.ExtractAsync(s, ct);
                attachment.ExtractedText = FileTextLimits.Cap(text);
                meta = meta with { TextExtracted = true };
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                logger.LogInformation(e, "Text extraction failed for attachment {Id} ({Mime}) with {Extractor}", attachmentId, mime, extractor.GetType().Name);
                meta = meta with { TextExtracted = false };
            }
        }

        attachment.Meta = FileService.MergeMeta(attachment.Meta, meta);
        await db.SaveChangesAsync(ct);
    }

    private IFileTextExtractor? Pick(string mime)
    {
        foreach (var extractor in extractors)
        {
            foreach (var pattern in extractor.Mimes)
            {
                if (pattern.EndsWith("/*", StringComparison.Ordinal)
                        ? mime.StartsWith(pattern[..^1], StringComparison.OrdinalIgnoreCase)
                        : mime.Equals(pattern, StringComparison.OrdinalIgnoreCase))
                    return extractor;
            }
        }
        return null;
    }
}

/// <summary>Daily <c>blob-gc</c>: deletes blobs (rows + files + derivatives) that no attachment references and that are older than 24 h.</summary>
public sealed class BlobGcJob(AppDbContext db, IBlobStore blobs, ILogger<BlobGcJob> logger)
{
    public static readonly TimeSpan MinAge = TimeSpan.FromHours(24);

    [Queue(FileExtractionJob.QueueName)]
    public Task<int> RunAsync(CancellationToken ct) => CollectAsync(DateTimeOffset.UtcNow - MinAge, ct);

    /// <summary>Collects unreferenced blobs stored before <paramref name="cutoff"/>. Returns the number of blobs removed.</summary>
    public async Task<int> CollectAsync(DateTimeOffset cutoff, CancellationToken ct)
    {
        var removed = 0;
        var orphans = await db.Blobs
            .Where(b => b.StoredAt < cutoff && !db.Attachments.Any(a => a.BlobSha == b.Sha256))
            .Select(b => b.Sha256)
            .ToListAsync(ct);
        foreach (var sha in orphans)
        {
            ct.ThrowIfCancellationRequested();
            var deleted = await db.Blobs.Where(b => b.Sha256 == sha && !db.Attachments.Any(a => a.BlobSha == b.Sha256)).ExecuteDeleteAsync(ct);
            if (deleted == 0) continue; // referenced again in the meantime
            blobs.Delete(sha);
            removed++;
        }

        // Files with no row at all (crashed uploads, manual restores).
        var known = orphans.Count == 0 ? null : orphans.ToHashSet();
        foreach (var (sha, modified) in blobs.EnumerateBlobs().ToList())
        {
            if (modified >= cutoff) continue;
            if (known is not null && known.Contains(sha)) continue;
            if (await db.Blobs.AnyAsync(b => b.Sha256 == sha, ct)) continue;
            blobs.Delete(sha);
            removed++;
        }

        if (blobs is DiskBlobStore disk) disk.CleanupTemp(MinAge);
        if (removed > 0) logger.LogInformation("blob-gc removed {Count} unreferenced blob(s)", removed);
        return removed;
    }
}

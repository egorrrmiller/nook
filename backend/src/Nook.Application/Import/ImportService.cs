using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Knowledge;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Plugins.Sdk;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Import;

/// <summary>
/// Contracts §9.8 <c>POST /import</c>: picks the <see cref="IImporter"/> by file extension and runs it, or — for archives
/// over <see cref="BackgroundThresholdBytes"/> — parks the upload and queues a background job (<c>GET /import/{jobId}</c>).
/// </summary>
public sealed class ImportService(
    IAppDbContext db,
    IWorkspaceContextAccessor contextAccessor,
    NodeService nodes,
    IEnumerable<IImporter> importers,
    IServiceProvider services,
    IOutbox outbox,
    IClock clock)
{
    /// <summary>Archives larger than this run as a Hangfire job (contracts §9.8: 20 MB).</summary>
    public const long BackgroundThresholdBytes = 20L * 1024 * 1024;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public IImporter Resolve(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        if (ext.Length == 0) throw new ValidationException("The uploaded file needs an extension (.md, .markdown, .txt, .html, .csv or .zip).");
        return importers.FirstOrDefault(i => i.Accepts.Any(a => string.Equals(a, ext, StringComparison.OrdinalIgnoreCase)))
               ?? throw new ValidationException($"No importer accepts '{ext}'.");
    }

    public async Task ValidateParentAsync(Guid? parentId, CancellationToken ct)
    {
        var ctx = contextAccessor.Required;
        if (parentId is { } id) await nodes.RequireAsync(id, WorkspaceRole.Editor, ct);
        else if (ctx.MembershipRole is null || !ctx.MembershipRole.Value.CanEdit()) throw new ForbiddenException("Only workspace editors can import at the root.");
    }

    public async Task<ImportResponse> RunAsync(IImporter importer, Stream content, string fileName, Guid? parentId, CancellationToken ct)
    {
        var ctx = contextAccessor.Required;
        var result = await importer.ImportAsync(new ImportRequest(ctx.WorkspaceId, ctx.UserId, parentId, content, fileName, services), ct);
        var nodeIds = result.NodeIds ?? [];
        outbox.Enqueue(new ImportCompleted(ctx.WorkspaceId, null, result.PagesCreated, nodeIds.ToArray(), ctx.UserId));
        await db.SaveChangesAsync(ct);
        return new ImportResponse(result.PagesCreated, nodeIds, result.Warnings);
    }

    /// <summary>Parks the upload under <c>NOOK_DATA_DIR/imports</c> and records a job row; the host queues the Hangfire job.</summary>
    public async Task<ImportJob> QueueAsync(Stream content, string fileName, Guid? parentId, DataDirectory dataDir, CancellationToken ct)
    {
        var ctx = contextAccessor.Required;
        Directory.CreateDirectory(dataDir.Imports);
        var job = new ImportJob
        {
            WorkspaceId = ctx.WorkspaceId, UserId = ctx.UserId, ParentNodeId = parentId,
            FileName = fileName, FilePath = "", Status = "pending", CreatedAt = clock.UtcNow,
        };
        job.FilePath = Path.Combine(dataDir.Imports, job.Id.ToString("N") + Path.GetExtension(fileName));
        await using (var file = File.Create(job.FilePath))
        {
            await content.CopyToAsync(file, ct);
        }
        db.ImportJobs.Add(job);
        await db.SaveChangesAsync(ct);
        return job;
    }

    public async Task<ImportJobStatusResponse> StatusAsync(Guid jobId, CancellationToken ct)
    {
        var ctx = contextAccessor.Required;
        var job = await db.ImportJobs.AsNoTracking().FirstOrDefaultAsync(j => j.Id == jobId && j.WorkspaceId == ctx.WorkspaceId, ct)
                  ?? throw new NotFoundException("Import job not found.");
        if (job.UserId != ctx.UserId && !ctx.IsWorkspaceOwner) throw new ForbiddenException("This import belongs to another user.");
        var result = job.Result is { ValueKind: JsonValueKind.Object } r ? r.Deserialize<ImportResponse>(Json) : null;
        return new ImportJobStatusResponse(job.Id, job.Status, result, job.Error, job.CreatedAt, job.FinishedAt);
    }

    public static JsonElement Serialize(ImportResponse response) => JsonSerializer.SerializeToElement(response, Json);
}

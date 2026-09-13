using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Nook.Application.Common;
using Nook.Application.Import;
using Nook.Application.Workspaces;
using Nook.Domain.Enums;
using Nook.Infrastructure.Persistence;
using Nook.Plugins.Sdk.Events;

namespace Nook.Infrastructure.Jobs;

/// <summary>Runs a parked <c>import_jobs</c> row (contracts §9.8, archives &gt; 20 MB) on the Hangfire queue <c>imports</c>.</summary>
public sealed class ImportJobRunner(IServiceScopeFactory scopeFactory, ILogger<ImportJobRunner> logger)
{
    public const string Queue = "imports";

    [Queue(Queue)]
    public async Task RunAsync(Guid jobId, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<AppDbContext>();
        var clock = sp.GetRequiredService<IClock>();

        var job = await db.ImportJobs.FirstOrDefaultAsync(j => j.Id == jobId, ct);
        if (job is null) { logger.LogWarning("Import job {JobId} not found", jobId); return; }
        if (job.Status is "done" or "failed") return;

        job.Status = "running";
        await db.SaveChangesAsync(ct);

        try
        {
            // The job runs outside a request, so the workspace context is established from the stored job row.
            var resolver = sp.GetRequiredService<WorkspaceContextResolver>();
            sp.GetRequiredService<IWorkspaceContextAccessor>().Current = await resolver.ResolveAsync(job.UserId, job.WorkspaceId, ct);

            var service = sp.GetRequiredService<ImportService>();
            var importer = service.Resolve(job.FileName);
            await using var file = File.OpenRead(job.FilePath);
            var result = await service.RunAsync(importer, file, job.FileName, job.ParentNodeId, ct);

            job.Result = ImportService.Serialize(result);
            job.Status = "done";
            sp.GetRequiredService<IOutbox>().Enqueue(new ImportCompleted(job.WorkspaceId, job.Id, result.PagesCreated, result.NodeIds.ToArray(), job.UserId));
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            logger.LogError(e, "Import job {JobId} failed", jobId);
            job.Status = "failed";
            job.Error = e.Message.Length > 2000 ? e.Message[..2000] : e.Message;
        }
        finally
        {
            job.FinishedAt = clock.UtcNow;
            await db.SaveChangesAsync(CancellationToken.None);
            try { if (File.Exists(job.FilePath)) File.Delete(job.FilePath); } catch (IOException) { /* best effort */ }
        }
    }
}

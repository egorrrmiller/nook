using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Nook.Application.Common;
using Nook.Application.Nodes;
using Nook.Application.Settings;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Trash;

/// <summary>
/// Logic behind the Hangfire recurring job <c>trash-purge</c> (hourly): permanently deletes trash roots older than the
/// workspace setting <c>trash.retentionDays</c> (default 30). Runs without a workspace context.
/// </summary>
public sealed class TrashRetentionService(IAppDbContext db, IClock clock, IOutbox outbox, ILogger<TrashRetentionService> logger)
{
    /// <summary>Returns the number of nodes purged across all workspaces.</summary>
    public async Task<int> PurgeExpiredAsync(CancellationToken ct)
    {
        var now = clock.UtcNow;
        var workspaceIds = await db.Workspaces.AsNoTracking().Select(w => w.Id).ToListAsync(ct);
        var total = 0;
        foreach (var ws in workspaceIds)
        {
            var days = await SettingsService.GetTrashRetentionDaysAsync(db, ws, ct);
            var cutoff = now.AddDays(-days);
            var roots = await db.Nodes.AsNoTracking()
                .Where(n => n.WorkspaceId == ws && n.DeletedAt != null && n.DeletedAt < cutoff
                            && (n.ParentId == null || n.Parent!.DeletedAt == null))
                .Select(n => n.Id)
                .ToListAsync(ct);
            if (roots.Count == 0) continue;

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            foreach (var root in roots)
            {
                var ids = await TreeQueries.SubtreeIdsAsync(db, ws, [root], ct);
                total += await TrashPurger.PurgeAsync(db, ws, ids, ct);
                outbox.Enqueue(new NodePurged(ws, root, ids.ToArray(), null));
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            logger.LogInformation("trash-purge: workspace {WorkspaceId} — purged {Roots} trash root(s) older than {Days} day(s)", ws, roots.Count, days);
        }
        return total;
    }
}

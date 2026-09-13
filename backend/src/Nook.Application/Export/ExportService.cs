using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Enums;
using Nook.Plugins.Sdk;

namespace Nook.Application.Export;

/// <summary>Contracts §9.8 <c>POST /export</c>: validates the request, picks the <see cref="IExporter"/> and streams the zip.</summary>
public sealed class ExportService(
    IAppDbContext db,
    IWorkspaceContextAccessor contextAccessor,
    NodeService nodes,
    IEnumerable<IExporter> exporters,
    IServiceProvider services)
{
    public const int MaxRoots = 200;

    public sealed record Plan(IExporter Exporter, Guid[] NodeIds, bool IncludeChildren, bool IncludeFiles, string FileName, string ContentType);

    public async Task<Plan> PrepareAsync(ExportRequestDto request, CancellationToken ct)
    {
        var ctx = contextAccessor.Required;
        var format = (request.Format ?? "markdown").ToLowerInvariant();
        var exporter = exporters.FirstOrDefault(e => string.Equals(e.Id, format, StringComparison.OrdinalIgnoreCase))
                       ?? throw new ValidationException($"Unknown export format '{format}'.");

        var ids = (request.NodeIds ?? []).Distinct().ToArray();
        if (ids.Length == 0) throw new ValidationException("nodeIds must not be empty.");
        if (ids.Length > MaxRoots) throw new ValidationException($"At most {MaxRoots} nodes per export.");
        foreach (var id in ids) await nodes.RequireAsync(id, WorkspaceRole.Viewer, ct);

        var first = await db.Nodes.AsNoTracking().Where(n => n.Id == ids[0]).Select(n => n.Title).FirstOrDefaultAsync(ct);
        var workspaceName = await db.Workspaces.AsNoTracking().Where(w => w.Id == ctx.WorkspaceId).Select(w => w.Name).FirstOrDefaultAsync(ct);
        var baseName = ids.Length == 1 && !string.IsNullOrWhiteSpace(first) ? first! : workspaceName ?? "nook";
        var fileName = ExportPaths.SafeName(baseName, "nook") + "-export" + exporter.FileExtension;

        return new Plan(exporter, ids, request.IncludeChildren ?? true, request.IncludeFiles ?? false, fileName, exporter.ContentType);
    }

    public Task WriteAsync(Plan plan, Stream output, CancellationToken ct)
    {
        var ctx = contextAccessor.Required;
        return plan.Exporter.ExportAsync(
            new ExportRequest(ctx.WorkspaceId, ctx.UserId, plan.NodeIds, plan.IncludeChildren, services, plan.IncludeFiles),
            output, ct);
    }
}

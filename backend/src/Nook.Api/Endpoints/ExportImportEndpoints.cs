using Hangfire;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nook.Api.Auth;
using Nook.Application.Common;
using Nook.Application.Export;
using Nook.Application.Files;
using Nook.Application.Import;
using Nook.Application.Knowledge;
using Nook.Infrastructure.Jobs;

namespace Nook.Api.Endpoints;

/// <summary>Contracts §9.8 export (streamed zip) and import (direct, or a Hangfire job for large archives).</summary>
public static class ExportImportEndpoints
{
    public static RouteGroupBuilder MapExportImportEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/").WithTags("ExportImport").AddEndpointFilter<WorkspaceContextFilter>();

        g.MapPost("/export", async (ExportRequestDto request, ExportService service, HttpContext http, CancellationToken ct) =>
            {
                var plan = await service.PrepareAsync(request, ct);
                // ZipArchive writes synchronously; allow it for this response so the zip streams instead of being buffered.
                var bodyControl = http.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpBodyControlFeature>();
                if (bodyControl is not null) bodyControl.AllowSynchronousIO = true;
                http.Response.ContentType = plan.ContentType;
                http.Response.Headers.ContentDisposition = $"attachment; filename*=UTF-8''{Uri.EscapeDataString(plan.FileName)}";
                await service.WriteAsync(plan, http.Response.Body, ct);
            })
            .WithName("Export")
            .WithDescription("Streams a zip: <Title>.md next to a folder <Title>/ for children, frontmatter, relative internal links.")
            .Produces(StatusCodes.Status200OK, contentType: "application/zip");

        g.MapPost("/import", async Task<Results<Ok<ImportResponse>, Accepted<ImportAcceptedResponse>>> (
                [FromForm] IFormFile file, [FromForm] Guid? parentId,
                [FromServices] ImportService service, [FromServices] DataDirectory dataDir,
                [FromServices] IBackgroundJobClient? jobs, [FromServices] FilesOptions filesOptions, CancellationToken ct) =>
            {
                if (file is null || file.Length == 0) throw new ValidationException("A non-empty file is required.");
                if (filesOptions.HasUploadLimit && file.Length > filesOptions.MaxUploadBytes)
                    throw new NookTooLargeException($"The upload exceeds {filesOptions.MaxUploadBytes / (1024 * 1024)} MB.");
                var fileName = Path.GetFileName(file.FileName);
                var importer = service.Resolve(fileName);
                await service.ValidateParentAsync(parentId, ct);

                if (file.Length > ImportService.BackgroundThresholdBytes && jobs is not null)
                {
                    await using var upload = file.OpenReadStream();
                    var job = await service.QueueAsync(upload, fileName, parentId, dataDir, ct);
                    jobs.Enqueue<ImportJobRunner>(r => r.RunAsync(job.Id, CancellationToken.None));
                    return TypedResults.Accepted($"/api/import/{job.Id}", new ImportAcceptedResponse(job.Id));
                }

                await using var content = file.OpenReadStream();
                return TypedResults.Ok(await service.RunAsync(importer, content, fileName, parentId, ct));
            })
            .WithName("Import")
            .WithDescription("Imports .md/.markdown/.txt/.html/.csv/.zip. Archives over 20 MB return 202 { jobId }; poll GET /import/{jobId}.")
            .DisableAntiforgery()
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge);

        g.MapGet("/import/{jobId:guid}", async Task<Ok<ImportJobStatusResponse>> (Guid jobId, ImportService service, CancellationToken ct) =>
                TypedResults.Ok(await service.StatusAsync(jobId, ct)))
            .WithName("GetImportJob");

        return api;
    }
}

/// <summary>413 for oversized uploads (contracts §9: "413 too large").</summary>
public sealed class NookTooLargeException(string message = "Payload too large") : NookException(413, message);

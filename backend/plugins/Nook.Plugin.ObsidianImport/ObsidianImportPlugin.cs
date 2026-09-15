using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Nook.Plugins.Sdk;

namespace Nook.Plugin.ObsidianImport;

/// <summary>
/// Self-hosted Obsidian vault workflow. Preview is complete in this plugin; writes are delegated through the narrow
/// <see cref="IObsidianImportAdapter"/> contract because the public SDK intentionally does not expose Nook's storage internals.
/// </summary>
public sealed class ObsidianImportPlugin : IPlugin
{
    public string Id => "obsidian-import";
    public string Name => "Obsidian import";

    public void ConfigureServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<ObsidianVaultParser>();
    }

    public void MapEndpoints(RouteGroupBuilder group)
    {
        group.MapPost("/preview", PreviewAsync)
            .WithName("ObsidianImportPreview")
            .WithDescription("Validates a local Obsidian vault and returns a dry-run report.");
        group.MapPost("/import", ImportAsync)
            .WithName("ObsidianImport")
            .WithDescription("Imports a validated local Obsidian vault through the host adapter.");
    }

    private static async Task<IResult> PreviewAsync(HttpRequest request, ObsidianVaultParser parser, CancellationToken cancellationToken)
    {
        var upload = await ObsidianVaultUploads.ReadAsync(request, cancellationToken);
        var parsed = parser.Parse(upload.Files);
        var plan = parsed with { Diagnostics = upload.Diagnostics.Concat(parsed.Diagnostics).ToArray() };
        return Results.Ok(ObsidianPreviewResponse.FromPlan(plan));
    }

    private static async Task<IResult> ImportAsync(
        HttpRequest request,
        ObsidianVaultParser parser,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var upload = await ObsidianVaultUploads.ReadAsync(request, cancellationToken);
        var parsed = parser.Parse(upload.Files);
        var plan = parsed with { Diagnostics = upload.Diagnostics.Concat(parsed.Diagnostics).ToArray() };
        var preview = ObsidianPreviewResponse.FromPlan(plan);
        if (plan.HasErrors)
            return Results.UnprocessableEntity(new { code = "vault_has_errors", message = "Fix the reported vault errors before importing.", preview });

        var workspaceId = request.Headers["X-Workspace-Id"].ToString();
        if (string.IsNullOrWhiteSpace(workspaceId))
            return Results.BadRequest(new { code = "missing_workspace", message = "X-Workspace-Id is required." });

        var adapter = services.GetService<IObsidianImportAdapter>();
        if (adapter is null)
        {
            return Results.Json(new ObsidianImportUnavailableResponse(
                "adapter_not_configured",
                "Preview is available, but this host has not registered an IObsidianImportAdapter for writing pages, folders and attachments.",
                preview), statusCode: StatusCodes.Status501NotImplemented);
        }

        var result = await adapter.ImportAsync(new ObsidianImportRequest(workspaceId, request.HttpContext.User, plan), cancellationToken);
        return Results.Ok(result);
    }
}

using System.Security.Claims;
using System.Text.Json;

namespace Nook.Plugin.ObsidianImport;

/// <summary>A file supplied by the local vault picker or extracted from a vault archive.</summary>
public sealed record ObsidianVaultFile(string RawPath, byte[] Content);

public sealed record ObsidianVaultUpload(
    IReadOnlyList<ObsidianVaultFile> Files,
    IReadOnlyList<ObsidianImportDiagnostic> Diagnostics);

public sealed record ObsidianImportDiagnostic(
    string Severity,
    string Code,
    string? Path,
    string Message);

public sealed record ObsidianReference(
    string Kind,
    string Raw,
    string Target,
    string? Display,
    string? Heading,
    string? ResolvedPath,
    bool IsExternal,
    bool IsBroken);

/// <summary>
/// A normalized block hint. The original Markdown remains on <see cref="ObsidianPagePlan.Markdown"/> so a host
/// adapter can choose the exact BlockNote representation without this plugin depending on Nook's editor internals.
/// </summary>
public sealed record ObsidianBlockPlan(
    string Kind,
    string Text,
    string? CalloutType = null,
    string? CalloutTitle = null,
    bool CalloutFolded = false);

public sealed record ObsidianFolderPlan(
    string Path,
    string Name,
    string? ParentPath);

public sealed record ObsidianAttachmentPlan(
    string Path,
    string Name,
    string MimeType,
    long Size,
    byte[] Content,
    IReadOnlyList<string> ReferencedBy);

public sealed record ObsidianPagePlan(
    string Path,
    string Title,
    string? ParentPath,
    IReadOnlyDictionary<string, JsonElement> Properties,
    IReadOnlyList<string> Tags,
    string Markdown,
    IReadOnlyList<ObsidianBlockPlan> Blocks,
    IReadOnlyList<ObsidianReference> References);

public sealed record ObsidianImportPlan(
    IReadOnlyList<ObsidianFolderPlan> Folders,
    IReadOnlyList<ObsidianPagePlan> Pages,
    IReadOnlyList<ObsidianAttachmentPlan> Attachments,
    IReadOnlyList<ObsidianImportDiagnostic> Diagnostics)
{
    public bool HasErrors => Diagnostics.Any(d => string.Equals(d.Severity, "error", StringComparison.Ordinal));
}

public sealed record ObsidianImportRequest(
    string WorkspaceId,
    ClaimsPrincipal User,
    ObsidianImportPlan Plan);

public sealed record ObsidianImportExecutionResult(
    int PagesCreated,
    int FoldersCreated,
    int AttachmentsCreated,
    IReadOnlyList<string> Warnings,
    IReadOnlyList<string> CreatedNodeIds);

/// <summary>
/// Host adapter for the write phase. The current public SDK has no node/document/attachment writer, so the plugin
/// intentionally exposes this narrow integration point instead of reaching into Nook.Application from a plugin.
/// </summary>
public interface IObsidianImportAdapter
{
    Task<ObsidianImportExecutionResult> ImportAsync(ObsidianImportRequest request, CancellationToken cancellationToken);
}

public sealed record ObsidianPreviewResponse(
    int Pages,
    int Folders,
    int Attachments,
    int BrokenReferences,
    IReadOnlyList<ObsidianDiagnosticResponse> Diagnostics,
    IReadOnlyList<ObsidianPageResponse> PagePreview)
{
    public static ObsidianPreviewResponse FromPlan(ObsidianImportPlan plan)
    {
        var diagnostics = plan.Diagnostics.Select(ObsidianDiagnosticResponse.From).ToList();
        var broken = plan.Pages.SelectMany(p => p.References).Count(r => r.IsBroken);
        var pages = plan.Pages.Take(100).Select(p => new ObsidianPageResponse(
            p.Path,
            p.Title,
            p.ParentPath,
            p.Properties.Keys.OrderBy(k => k, StringComparer.OrdinalIgnoreCase).ToArray(),
            p.Tags,
            p.Blocks.Count,
            p.References.Count)).ToList();

        return new ObsidianPreviewResponse(plan.Pages.Count, plan.Folders.Count, plan.Attachments.Count, broken, diagnostics, pages);
    }
}

public sealed record ObsidianPageResponse(
    string Path,
    string Title,
    string? ParentPath,
    IReadOnlyList<string> Properties,
    IReadOnlyList<string> Tags,
    int Blocks,
    int References);

public sealed record ObsidianDiagnosticResponse(
    string Severity,
    string Code,
    string? Path,
    string Message)
{
    public static ObsidianDiagnosticResponse From(ObsidianImportDiagnostic diagnostic) =>
        new(diagnostic.Severity, diagnostic.Code, diagnostic.Path, diagnostic.Message);
}

public sealed record ObsidianImportUnavailableResponse(
    string Code,
    string Message,
    ObsidianPreviewResponse Preview);


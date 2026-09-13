using Microsoft.Extensions.DependencyInjection;
using Nook.Plugins.Sdk;

namespace Nook.Application.Export;

/// <summary>Contracts §9.8 built-in <c>markdown</c> exporter (zip of <c>.md</c> files, Notion-like layout).</summary>
public sealed class MarkdownExporter : IExporter
{
    public string Id => "markdown";
    public string DisplayName => "Markdown (.zip)";
    public string ContentType => "application/zip";
    public string FileExtension => ".zip";

    public Task ExportAsync(ExportRequest request, Stream output, CancellationToken cancellationToken) =>
        request.Services.GetRequiredService<ZipExportWriter>()
            .WriteAsync(request.WorkspaceId, request.NodeIds, request.IncludeChildren, request.IncludeFiles, "markdown", output, cancellationToken);
}

/// <summary>Contracts §9.8 built-in <c>html</c> exporter (zip of <c>.html</c> files with a minimal inline stylesheet).</summary>
public sealed class HtmlExporter : IExporter
{
    public string Id => "html";
    public string DisplayName => "HTML (.zip)";
    public string ContentType => "application/zip";
    public string FileExtension => ".zip";

    public Task ExportAsync(ExportRequest request, Stream output, CancellationToken cancellationToken) =>
        request.Services.GetRequiredService<ZipExportWriter>()
            .WriteAsync(request.WorkspaceId, request.NodeIds, request.IncludeChildren, request.IncludeFiles, "html", output, cancellationToken);
}

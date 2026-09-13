namespace Nook.Plugins.Sdk;

/// <summary>Imports external content into a workspace (e.g. an Obsidian vault). Built-ins: <c>markdown</c>, <c>html</c>, <c>csv</c>, <c>zip</c>.</summary>
public interface IImporter
{
    string Id { get; }
    string DisplayName { get; }

    /// <summary>Accepted upload MIME types or extensions (e.g. <c>".zip"</c>, <c>".md"</c>).</summary>
    IReadOnlyList<string> Accepts { get; }

    Task<ImportResult> ImportAsync(ImportRequest request, CancellationToken cancellationToken);
}

public sealed record ImportRequest(Guid WorkspaceId, Guid UserId, Guid? ParentNodeId, Stream Content, string FileName, IServiceProvider Services);

/// <param name="NodeIds">Ids of the created top-level pages (wave 1 addition; <c>null</c> when the importer does not report them).</param>
public sealed record ImportResult(int PagesCreated, IReadOnlyList<string> Warnings, IReadOnlyList<Guid>? NodeIds = null);

/// <summary>Exports nodes to an external format (e.g. Markdown zip). Built-ins: <c>markdown</c>, <c>html</c>.</summary>
public interface IExporter
{
    string Id { get; }
    string DisplayName { get; }

    /// <summary>MIME type of the produced stream.</summary>
    string ContentType { get; }
    string FileExtension { get; }

    Task ExportAsync(ExportRequest request, Stream output, CancellationToken cancellationToken);
}

/// <param name="IncludeFiles">Bundle attachments (wave 1 addition, contracts §9.8).</param>
public sealed record ExportRequest(Guid WorkspaceId, Guid UserId, IReadOnlyList<Guid> NodeIds, bool IncludeChildren, IServiceProvider Services, bool IncludeFiles = false);

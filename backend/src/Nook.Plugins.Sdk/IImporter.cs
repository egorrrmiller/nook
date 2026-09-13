namespace Nook.Plugins.Sdk;

/// <summary>Imports external content into a workspace (e.g. an Obsidian vault). Wave 0 defines only the contract.</summary>
public interface IImporter
{
    string Id { get; }
    string DisplayName { get; }

    /// <summary>Accepted upload MIME types or extensions (e.g. <c>".zip"</c>, <c>".md"</c>).</summary>
    IReadOnlyList<string> Accepts { get; }

    Task<ImportResult> ImportAsync(ImportRequest request, CancellationToken cancellationToken);
}

public sealed record ImportRequest(Guid WorkspaceId, Guid UserId, Guid? ParentNodeId, Stream Content, string FileName, IServiceProvider Services);

public sealed record ImportResult(int PagesCreated, IReadOnlyList<string> Warnings);

/// <summary>Exports nodes to an external format (e.g. Markdown zip).</summary>
public interface IExporter
{
    string Id { get; }
    string DisplayName { get; }

    /// <summary>MIME type of the produced stream.</summary>
    string ContentType { get; }
    string FileExtension { get; }

    Task ExportAsync(ExportRequest request, Stream output, CancellationToken cancellationToken);
}

public sealed record ExportRequest(Guid WorkspaceId, Guid UserId, IReadOnlyList<Guid> NodeIds, bool IncludeChildren, IServiceProvider Services);

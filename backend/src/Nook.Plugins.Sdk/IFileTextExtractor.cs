namespace Nook.Plugins.Sdk;

/// <summary>
/// Extracts searchable plain text from an uploaded file. Registered via DI (<c>services.AddSingleton&lt;IFileTextExtractor, ...&gt;()</c>);
/// the host runs extraction on the Hangfire queue <c>files</c> and picks the first extractor whose <see cref="Mimes"/> match the
/// attachment's MIME type (exact match, or a <c>type/*</c> wildcard).
/// </summary>
public interface IFileTextExtractor
{
    /// <summary>MIME types this extractor handles, e.g. <c>application/pdf</c> or <c>text/*</c>.</summary>
    IReadOnlyList<string> Mimes { get; }

    /// <summary>Returns the extracted text, or <c>null</c> when the file contains none. The stream is seekable and positioned at 0.</summary>
    Task<string?> ExtractAsync(Stream content, CancellationToken cancellationToken);
}

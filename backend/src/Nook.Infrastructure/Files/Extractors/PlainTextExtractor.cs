using System.Text;
using Nook.Plugins.Sdk;

namespace Nook.Infrastructure.Files.Extractors;

/// <summary>text/* and a few text-like application types: UTF-8 passthrough (BOM-aware), capped at 1 MB.</summary>
public sealed class PlainTextExtractor : IFileTextExtractor
{
    public IReadOnlyList<string> Mimes { get; } = ["text/*", "application/json", "application/xml", "application/x-yaml", "application/yaml"];

    public async Task<string?> ExtractAsync(Stream content, CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(content, new UTF8Encoding(false), detectEncodingFromByteOrderMarks: true, bufferSize: 16 * 1024, leaveOpen: true);
        var buffer = new char[16 * 1024];
        var sb = new StringBuilder();
        int read;
        while (sb.Length < FileTextLimits.MaxChars && (read = await reader.ReadAsync(buffer.AsMemory(), cancellationToken)) > 0)
        {
            sb.Append(buffer, 0, read);
        }
        return FileTextLimits.Cap(sb.ToString());
    }
}

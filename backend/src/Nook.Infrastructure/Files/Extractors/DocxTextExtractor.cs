using System.Text;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using Nook.Plugins.Sdk;

namespace Nook.Infrastructure.Files.Extractors;

/// <summary>DOCX text via the Open XML SDK (MIT): paragraphs of the main document part, one per line.</summary>
public sealed class DocxTextExtractor : IFileTextExtractor
{
    public IReadOnlyList<string> Mimes { get; } = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

    public Task<string?> ExtractAsync(Stream content, CancellationToken cancellationToken) =>
        Task.Run(() =>
        {
            using var doc = WordprocessingDocument.Open(content, isEditable: false);
            var body = doc.MainDocumentPart?.Document?.Body;
            if (body is null) return null;
            var sb = new StringBuilder();
            foreach (var paragraph in body.Descendants<Paragraph>())
            {
                cancellationToken.ThrowIfCancellationRequested();
                var line = paragraph.InnerText;
                if (string.IsNullOrWhiteSpace(line)) continue;
                sb.Append(line).Append('\n');
                if (sb.Length > FileTextLimits.MaxChars) break;
            }
            return FileTextLimits.Cap(sb.ToString());
        }, cancellationToken);
}

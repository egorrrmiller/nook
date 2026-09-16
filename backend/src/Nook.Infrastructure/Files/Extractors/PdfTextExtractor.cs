using System.Text;
using Nook.Plugins.Sdk;
using UglyToad.PdfPig;

namespace Nook.Infrastructure.Files.Extractors;

/// <summary>PDF text via PdfPig (Apache-2.0).</summary>
public sealed class PdfTextExtractor : IFileTextExtractor
{
    public IReadOnlyList<string> Mimes { get; } = ["application/pdf"];

    public Task<string?> ExtractAsync(Stream content, CancellationToken cancellationToken) =>
        Task.Run(() =>
        {
            using var doc = PdfDocument.Open(content, new ParsingOptions { UseLenientParsing = true, SkipMissingFonts = true });
            var sb = new StringBuilder();
            var first = true;
            foreach (var page in doc.GetPages())
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!first) sb.Append('\f');
                first = false;
                var text = page.Text;
                if (!string.IsNullOrWhiteSpace(text)) sb.Append(text.Trim()).Append('\n');
                if (sb.Length > FileTextLimits.MaxChars) break;
            }
            return FileTextLimits.Cap(sb.ToString());
        }, cancellationToken);

    public static int PageCount(Stream content)
    {
        content.Position = 0;
        using var doc = PdfDocument.Open(content, new ParsingOptions { UseLenientParsing = true, SkipMissingFonts = true });
        return doc.NumberOfPages;
    }
}

public static class FileTextLimits
{
    /// <summary>Extracted text is capped at 1 MB of characters.</summary>
    public const int MaxChars = 1024 * 1024;

    public static string? Cap(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        text = text.Replace("\0", "");
        return text.Length > MaxChars ? text[..MaxChars] : text;
    }
}

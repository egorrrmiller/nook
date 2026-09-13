using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Nook.Application.Collab;
using Nook.Plugins.Sdk;

namespace Nook.Application.Import;

/// <summary>Contracts §9.8: a single <c>.md</c>/<c>.markdown</c>/<c>.txt</c> file becomes one page.</summary>
public sealed class MarkdownImporter : IImporter
{
    public string Id => "markdown";
    public string DisplayName => "Markdown";
    public IReadOnlyList<string> Accepts => [".md", ".markdown", ".txt", "text/markdown", "text/plain"];

    public async Task<ImportResult> ImportAsync(ImportRequest request, CancellationToken cancellationToken)
    {
        var collab = request.Services.GetRequiredService<ICollabClient>();
        var writer = request.Services.GetRequiredService<ImportWriter>();
        var text = await new StreamReader(request.Content, Encoding.UTF8).ReadToEndAsync(cancellationToken);
        var blocks = await collab.ConvertFromMarkdownAsync(text, cancellationToken);

        var title = BlockJson.FirstHeading(blocks) ?? Path.GetFileNameWithoutExtension(request.FileName);
        if (BlockJson.FirstHeading(blocks) is not null) blocks = BlockJson.DropFirstHeading(blocks);

        var node = await writer.CreatePageAsync(request.WorkspaceId, request.ParentNodeId, title, request.UserId, cancellationToken);
        await writer.FillAsync(node, ImportWriter.NormalizeTitle(title), blocks, request.UserId, cancellationToken);
        return new ImportResult(1, [], [node.Id]);
    }
}

/// <summary>Contracts §9.8: a single <c>.html</c>/<c>.htm</c> file becomes one page.</summary>
public sealed class HtmlImporter : IImporter
{
    public string Id => "html";
    public string DisplayName => "HTML";
    public IReadOnlyList<string> Accepts => [".html", ".htm", "text/html"];

    public async Task<ImportResult> ImportAsync(ImportRequest request, CancellationToken cancellationToken)
    {
        var collab = request.Services.GetRequiredService<ICollabClient>();
        var writer = request.Services.GetRequiredService<ImportWriter>();
        var html = await new StreamReader(request.Content, Encoding.UTF8).ReadToEndAsync(cancellationToken);
        var blocks = await collab.ConvertFromHtmlAsync(html, cancellationToken);

        var title = HtmlTitle(html) ?? BlockJson.FirstHeading(blocks) ?? Path.GetFileNameWithoutExtension(request.FileName);
        var node = await writer.CreatePageAsync(request.WorkspaceId, request.ParentNodeId, title, request.UserId, cancellationToken);
        await writer.FillAsync(node, ImportWriter.NormalizeTitle(title), blocks, request.UserId, cancellationToken);
        return new ImportResult(1, [], [node.Id]);
    }

    public static string? HtmlTitle(string html)
    {
        var m = System.Text.RegularExpressions.Regex.Match(html, "<title[^>]*>(?<t>.*?)</title>",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Singleline,
            TimeSpan.FromSeconds(2));
        if (!m.Success) return null;
        var title = System.Net.WebUtility.HtmlDecode(m.Groups["t"].Value).Trim();
        return title.Length == 0 ? null : title;
    }
}

/// <summary>Contracts §9.8: a <c>.csv</c> file becomes one page with a single <c>table</c> block (≤ 1 000 rows).</summary>
public sealed class CsvImporter : IImporter
{
    public const int MaxRows = 1000;

    public string Id => "csv";
    public string DisplayName => "CSV";
    public IReadOnlyList<string> Accepts => [".csv", ".tsv", "text/csv"];

    public async Task<ImportResult> ImportAsync(ImportRequest request, CancellationToken cancellationToken)
    {
        var writer = request.Services.GetRequiredService<ImportWriter>();
        var text = await new StreamReader(request.Content, Encoding.UTF8).ReadToEndAsync(cancellationToken);
        var separator = Path.GetExtension(request.FileName).Equals(".tsv", StringComparison.OrdinalIgnoreCase) ? '\t' : Detect(text);
        var rows = Parse(text, separator);
        var warnings = new List<string>();
        if (rows.Count > MaxRows)
        {
            warnings.Add($"CSV has {rows.Count} rows; only the first {MaxRows} were imported.");
            rows = rows.Take(MaxRows).ToList();
        }
        if (rows.Count == 0) warnings.Add("CSV contained no rows; an empty page was created.");

        var blocks = rows.Count == 0 ? BlockJson.Paragraph("") : BlockJson.Table(rows);
        var title = Path.GetFileNameWithoutExtension(request.FileName);
        var node = await writer.CreatePageAsync(request.WorkspaceId, request.ParentNodeId, title, request.UserId, cancellationToken);
        await writer.FillAsync(node, ImportWriter.NormalizeTitle(title), blocks, request.UserId, cancellationToken);
        return new ImportResult(1, warnings, [node.Id]);
    }

    private static char Detect(string text)
    {
        var line = text.Split('\n', 2)[0];
        return line.Count(c => c == ';') > line.Count(c => c == ',') ? ';' : ',';
    }

    /// <summary>RFC 4180 parser (quoted fields, doubled quotes, embedded newlines).</summary>
    public static List<IReadOnlyList<string>> Parse(string text, char separator)
    {
        var rows = new List<IReadOnlyList<string>>();
        var row = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;
        var any = false;

        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (inQuotes)
            {
                if (ch == '"')
                {
                    if (i + 1 < text.Length && text[i + 1] == '"') { field.Append('"'); i++; }
                    else inQuotes = false;
                }
                else field.Append(ch);
                continue;
            }
            if (ch == '"') { inQuotes = true; any = true; continue; }
            if (ch == separator) { row.Add(field.ToString()); field.Clear(); any = true; continue; }
            if (ch is '\n' or '\r')
            {
                if (ch == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
                row.Add(field.ToString());
                field.Clear();
                if (any || row.Any(c => c.Length > 0)) rows.Add(row);
                row = [];
                any = false;
                continue;
            }
            field.Append(ch);
            any = true;
        }
        if (field.Length > 0 || row.Count > 0)
        {
            row.Add(field.ToString());
            if (row.Any(c => c.Length > 0)) rows.Add(row);
        }
        return rows;
    }
}

/// <summary>Serialisation helper shared by <see cref="ZipImporter"/> (blocks are handed to collab as raw JSON).</summary>
internal static class ImporterJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
}

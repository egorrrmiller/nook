using System.IO.Compression;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Nook.Application.Collab;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Plugins.Sdk;

namespace Nook.Application.Import;

/// <summary>
/// Contracts §9.8 zip import: folders become parent pages (a folder merges into a sibling <c>&lt;Name&gt;.md</c> when one
/// exists), <c>.md</c>/<c>.html</c>/<c>.txt</c>/<c>.csv</c> files become pages, relatively referenced images become
/// attachments and links between imported files become mentions (<c>/w/{ws}/p/{id}</c>).
/// </summary>
public sealed class ZipImporter : IImporter
{
    public const int MaxEntries = 20_000;
    public const long MaxEntryBytes = 64L * 1024 * 1024;

    private static readonly string[] DocExtensions = [".md", ".markdown", ".txt", ".html", ".htm", ".csv"];

    public string Id => "zip";
    public string DisplayName => "Zip archive";
    public IReadOnlyList<string> Accepts => [".zip", "application/zip", "application/x-zip-compressed"];

    public async Task<ImportResult> ImportAsync(ImportRequest request, CancellationToken ct)
    {
        var services = request.Services;
        var collab = services.GetRequiredService<ICollabClient>();
        var writer = services.GetRequiredService<ImportWriter>();
        var workspaceId = request.WorkspaceId;
        var warnings = new List<string>();

        using var zip = new ZipArchive(request.Content, ZipArchiveMode.Read, leaveOpen: true);
        var docs = new List<DocEntry>();
        var assets = new Dictionary<string, ZipArchiveEntry>(StringComparer.OrdinalIgnoreCase);
        var count = 0;

        foreach (var entry in zip.Entries)
        {
            if (++count > MaxEntries) { warnings.Add($"Archive has more than {MaxEntries} entries; the rest was skipped."); break; }
            var path = Normalize(entry.FullName);
            if (path is null || entry.FullName.EndsWith('/')) continue;
            if (entry.Length > MaxEntryBytes) { warnings.Add($"'{path}' is larger than {MaxEntryBytes / (1024 * 1024)} MB and was skipped."); continue; }
            var ext = Path.GetExtension(path).ToLowerInvariant();
            if (DocExtensions.Contains(ext)) docs.Add(new DocEntry(path, entry, ext));
            else assets[path] = entry;
        }
        if (docs.Count == 0) return new ImportResult(0, warnings.Append("The archive contained no importable documents.").ToList(), []);

        docs = docs.OrderBy(d => d.Path.Count(c => c == '/')).ThenBy(d => d.Path, StringComparer.OrdinalIgnoreCase).ToList();
        var docByPath = docs.ToDictionary(d => d.Path, StringComparer.OrdinalIgnoreCase);

        // Folder pages: a folder merges into the sibling document of the same name when one exists.
        var folderOwners = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase); // folder path -> doc path
        foreach (var dir in docs.Select(d => Parent(d.Path)).Where(d => d.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase)
                     .Concat(assets.Keys.Select(Parent).Where(d => d.Length > 0))
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            foreach (var folder in Chain(dir))
            {
                if (folderOwners.ContainsKey(folder)) continue;
                var owner = DocExtensions.Select(e => folder + e).FirstOrDefault(docByPath.ContainsKey);
                if (owner is not null) folderOwners[folder] = owner;
            }
        }

        // Pass 1: create every node (folders first so parents exist).
        var nodeByPath = new Dictionary<string, Node>(StringComparer.OrdinalIgnoreCase);   // doc path -> node
        var nodeByFolder = new Dictionary<string, Node>(StringComparer.OrdinalIgnoreCase); // folder path -> node
        var created = new List<Node>();

        async Task<Node?> FolderNodeAsync(string folder)
        {
            if (folder.Length == 0) return null;
            if (nodeByFolder.TryGetValue(folder, out var existing)) return existing;
            var parent = await FolderNodeAsync(Parent(folder));
            Node node;
            if (folderOwners.TryGetValue(folder, out var ownerDoc))
            {
                node = nodeByPath.TryGetValue(ownerDoc, out var owner) ? owner : await CreateDocNodeAsync(ownerDoc, parent);
            }
            else
            {
                node = await writer.CreatePageAsync(workspaceId, parent?.Id ?? request.ParentNodeId, LastSegment(folder), request.UserId, ct);
                created.Add(node);
            }
            nodeByFolder[folder] = node;
            return node;
        }

        async Task<Node> CreateDocNodeAsync(string docPath, Node? parent)
        {
            var doc = docByPath[docPath];
            parent ??= await FolderNodeAsync(Parent(docPath));
            var node = await writer.CreatePageAsync(workspaceId, parent?.Id ?? request.ParentNodeId, Path.GetFileNameWithoutExtension(docPath), request.UserId, ct);
            nodeByPath[docPath] = node;
            created.Add(node);
            return node;
        }

        foreach (var doc in docs)
        {
            if (nodeByPath.ContainsKey(doc.Path)) continue;
            var folder = TrimExtension(doc.Path);
            if (folderOwners.TryGetValue(folder, out var owner) && string.Equals(owner, doc.Path, StringComparison.OrdinalIgnoreCase))
            {
                var node = await CreateDocNodeAsync(doc.Path, null);
                nodeByFolder[folder] = node;
                continue;
            }
            await CreateDocNodeAsync(doc.Path, null);
        }

        // Pass 2: convert content, rewire links and attachments, write the documents.
        var attachmentUrls = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase); // asset path -> /api/files/{id}
        foreach (var doc in docs)
        {
            ct.ThrowIfCancellationRequested();
            var node = nodeByPath[doc.Path];
            var text = await ReadTextAsync(doc.Zip, ct);
            JsonElement blocks;
            string title;

            if (doc.Extension == ".csv")
            {
                var rows = CsvImporter.Parse(text, text.Split('\n', 2)[0].Count(c => c == ';') > text.Split('\n', 2)[0].Count(c => c == ',') ? ';' : ',');
                if (rows.Count > CsvImporter.MaxRows)
                {
                    warnings.Add($"'{doc.Path}' has {rows.Count} rows; only the first {CsvImporter.MaxRows} were imported.");
                    rows = rows.Take(CsvImporter.MaxRows).ToList();
                }
                blocks = rows.Count == 0 ? BlockJson.Paragraph("") : BlockJson.Table(rows);
                title = Path.GetFileNameWithoutExtension(doc.Path);
            }
            else if (doc.Extension is ".html" or ".htm")
            {
                blocks = await collab.ConvertFromHtmlAsync(text, ct);
                title = HtmlImporter.HtmlTitle(text) ?? BlockJson.FirstHeading(blocks) ?? Path.GetFileNameWithoutExtension(doc.Path);
            }
            else
            {
                var (frontmatter, body) = SplitFrontmatter(text);
                blocks = await collab.ConvertFromMarkdownAsync(body, ct);
                title = frontmatter ?? BlockJson.FirstHeading(blocks) ?? Path.GetFileNameWithoutExtension(doc.Path);
                if (frontmatter is null && BlockJson.FirstHeading(blocks) is not null) blocks = BlockJson.DropFirstHeading(blocks);
            }

            var docDir = Parent(doc.Path);

            // Pass 2a: discover the assets this page references, so they can be uploaded before the rewrite.
            var needed = new List<string>();
            BlockJson.RewriteUrls(blocks, href =>
            {
                var resolved = ResolveReference(href, docDir);
                if (resolved is not null && assets.ContainsKey(resolved) && !attachmentUrls.ContainsKey(resolved) && !needed.Contains(resolved)) needed.Add(resolved);
                return null;
            });
            foreach (var assetPath in needed)
            {
                var bytes = ReadBytes(assets[assetPath]);
                if (bytes is null) { warnings.Add($"'{assetPath}' could not be read and was skipped."); continue; }
                var attachment = await writer.AddAttachmentAsync(node, Path.GetFileName(assetPath), ImportWriter.MimeFor(assetPath), bytes, ct);
                attachmentUrls[assetPath] = "/api/files/" + attachment.Id;
            }

            // Pass 2b: links between imported files become mentions, asset references point at the new attachments.
            blocks = BlockJson.RewriteUrls(blocks, href =>
            {
                var (_, anchor) = SplitAnchor(href);
                var resolved = ResolveReference(href, docDir);
                if (resolved is null) return null;
                if (nodeByPath.TryGetValue(resolved, out var targetNode))
                    return $"/w/{workspaceId}/p/{targetNode.Id}" + (anchor.Length > 0 ? "#" + anchor : "");
                if (nodeByFolder.TryGetValue(TrimTrailingSlash(resolved), out var folderNode))
                    return $"/w/{workspaceId}/p/{folderNode.Id}";
                if (attachmentUrls.TryGetValue(resolved, out var url)) return url;
                if (!assets.ContainsKey(resolved)) warnings.Add($"'{doc.Path}': could not resolve '{href}'.");
                return null;
            });

            await writer.FillAsync(node, ImportWriter.NormalizeTitle(title), blocks, request.UserId, ct);
        }

        return new ImportResult(created.Count, warnings, created.Select(n => n.Id).ToList());
    }

    private sealed record DocEntry(string Path, ZipArchiveEntry Zip, string Extension);

    // --- helpers ----------------------------------------------------------------------------------------------------

    private static async Task<string> ReadTextAsync(ZipArchiveEntry entry, CancellationToken ct)
    {
        await using var stream = entry.Open();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return await reader.ReadToEndAsync(ct);
    }

    private static byte[]? ReadBytes(ZipArchiveEntry entry)
    {
        try
        {
            using var stream = entry.Open();
            using var buffer = new MemoryStream();
            stream.CopyTo(buffer);
            return buffer.ToArray();
        }
        catch (InvalidDataException)
        {
            return null;
        }
    }

    /// <summary>Normalises a zip path and rejects traversal (<c>..</c>) and absolute entries.</summary>
    public static string? Normalize(string raw)
    {
        var path = raw.Replace('\\', '/').TrimStart('/');
        if (path.Length == 0) return null;
        var segments = new List<string>();
        foreach (var segment in path.Split('/', StringSplitOptions.RemoveEmptyEntries))
        {
            if (segment == ".") continue;
            if (segment == "..") { if (segments.Count == 0) return null; segments.RemoveAt(segments.Count - 1); continue; }
            if (segment.StartsWith("__MACOSX", StringComparison.Ordinal) || segment == ".DS_Store") return null;
            segments.Add(segment);
        }
        return segments.Count == 0 ? null : string.Join('/', segments);
    }

    /// <summary>Resolves a document-relative href to a normalised zip path; <c>null</c> for anchors, absolute URLs and mail links.</summary>
    public static string? ResolveReference(string href, string dir)
    {
        if (href.Length == 0 || href.StartsWith('#') || href.Contains("://", StringComparison.Ordinal)
            || href.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase) || href.StartsWith("nook:", StringComparison.OrdinalIgnoreCase)) return null;
        var hash = href.IndexOf('#');
        var target = hash < 0 ? href : href[..hash];
        return target.Length == 0 ? null : Resolve(dir, target);
    }

    /// <summary>Resolves <paramref name="href"/> (url-encoded, possibly relative) against <paramref name="dir"/>.</summary>
    public static string? Resolve(string dir, string href)
    {
        if (href.Length == 0) return null;
        string decoded;
        try { decoded = Uri.UnescapeDataString(href); }
        catch (UriFormatException) { decoded = href; }
        var combined = decoded.StartsWith('/') ? decoded : (dir.Length == 0 ? decoded : dir + "/" + decoded);
        return Normalize(combined);
    }

    private static (string Target, string Anchor) SplitAnchor(string href)
    {
        var hash = href.IndexOf('#');
        return hash < 0 ? (href, "") : (href[..hash], href[(hash + 1)..]);
    }

    private static string Parent(string path)
    {
        var slash = path.LastIndexOf('/');
        return slash < 0 ? "" : path[..slash];
    }

    private static string LastSegment(string path)
    {
        var slash = path.LastIndexOf('/');
        return slash < 0 ? path : path[(slash + 1)..];
    }

    private static string TrimExtension(string path)
    {
        var dot = path.LastIndexOf('.');
        var slash = path.LastIndexOf('/');
        return dot > slash ? path[..dot] : path;
    }

    private static string TrimTrailingSlash(string path) => path.TrimEnd('/');

    /// <summary>Every folder path from the root down to <paramref name="dir"/>.</summary>
    private static IEnumerable<string> Chain(string dir)
    {
        var segments = dir.Split('/', StringSplitOptions.RemoveEmptyEntries);
        for (var i = 1; i <= segments.Length; i++) yield return string.Join('/', segments.Take(i));
    }

    /// <summary>Strips a YAML frontmatter block and returns its <c>title:</c> (when present) plus the remaining markdown.</summary>
    public static (string? Title, string Body) SplitFrontmatter(string text)
    {
        var normalized = text.Replace("\r\n", "\n");
        if (!normalized.StartsWith("---\n", StringComparison.Ordinal)) return (null, text);
        var end = normalized.IndexOf("\n---", 3, StringComparison.Ordinal);
        if (end < 0) return (null, text);
        var block = normalized[4..end];
        var body = normalized[(end + 4)..].TrimStart('\n');
        string? title = null;
        foreach (var line in block.Split('\n'))
        {
            if (!line.StartsWith("title:", StringComparison.OrdinalIgnoreCase)) continue;
            title = line[6..].Trim().Trim('"', '\'');
            if (title.Length == 0) title = null;
            break;
        }
        return (title, body);
    }
}

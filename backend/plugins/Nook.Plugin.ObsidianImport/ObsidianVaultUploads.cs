using System.IO.Compression;
using Microsoft.AspNetCore.Http;

namespace Nook.Plugin.ObsidianImport;

internal static class ObsidianVaultUploads
{
    private const int MaxEntries = 20_000;
    private const long MaxFileBytes = 64L * 1024 * 1024;
    private const long MaxTotalBytes = 512L * 1024 * 1024;

    public static async Task<ObsidianVaultUpload> ReadAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        var diagnostics = new List<ObsidianImportDiagnostic>();
        var files = new List<ObsidianVaultFile>();
        IFormCollection form;
        try
        {
            form = await request.ReadFormAsync(cancellationToken);
        }
        catch (InvalidDataException)
        {
            diagnostics.Add(new("error", "upload.invalid_multipart", null, "Expected a multipart/form-data upload."));
            return new ObsidianVaultUpload(files, diagnostics);
        }

        if (form.Files.Count == 0)
        {
            diagnostics.Add(new("error", "upload.empty", null, "Choose at least one Markdown file or an Obsidian vault folder."));
            return new ObsidianVaultUpload(files, diagnostics);
        }
        var total = 0L;

        foreach (var upload in form.Files)
        {
            if (upload.Length > MaxFileBytes)
            {
                diagnostics.Add(new("error", "upload.too_large", upload.FileName, $"Files larger than {MaxFileBytes / (1024 * 1024)} MiB are not accepted."));
                continue;
            }
            if (total + upload.Length > MaxTotalBytes)
            {
                diagnostics.Add(new("error", "upload.total_too_large", upload.FileName, $"The vault exceeds the {MaxTotalBytes / (1024 * 1024)} MiB upload limit."));
                break;
            }

            await using var source = upload.OpenReadStream();
            using var memory = new MemoryStream(capacity: checked((int)Math.Min(upload.Length, int.MaxValue)));
            await source.CopyToAsync(memory, cancellationToken);
            total += memory.Length;
            var bytes = memory.ToArray();

            if (Path.GetExtension(upload.FileName).Equals(".zip", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(upload.ContentType, "application/zip", StringComparison.OrdinalIgnoreCase))
            {
                ReadZip(bytes, upload.FileName, files, diagnostics, ref total);
            }
            else
            {
                files.Add(new ObsidianVaultFile(upload.FileName, bytes));
            }
        }

        return new ObsidianVaultUpload(files, diagnostics);
    }

    private static void ReadZip(
        byte[] archiveBytes,
        string archiveName,
        List<ObsidianVaultFile> files,
        List<ObsidianImportDiagnostic> diagnostics,
        ref long total)
    {
        try
        {
            using var archive = new ZipArchive(new MemoryStream(archiveBytes, writable: false), ZipArchiveMode.Read);
            var entries = 0;
            foreach (var entry in archive.Entries)
            {
                if (++entries > MaxEntries)
                {
                    diagnostics.Add(new("error", "archive.too_many_entries", archiveName, $"Archives may contain at most {MaxEntries} files."));
                    break;
                }
                if (entry.FullName.EndsWith('/')) continue;
                if (entry.Length > MaxFileBytes)
                {
                    diagnostics.Add(new("error", "archive.file_too_large", entry.FullName, $"Files larger than {MaxFileBytes / (1024 * 1024)} MiB are not accepted."));
                    continue;
                }
                if (total + entry.Length > MaxTotalBytes)
                {
                    diagnostics.Add(new("error", "archive.total_too_large", entry.FullName, $"The vault exceeds the {MaxTotalBytes / (1024 * 1024)} MiB upload limit."));
                    break;
                }

                using var source = entry.Open();
                using var memory = new MemoryStream(capacity: checked((int)Math.Min(entry.Length, int.MaxValue)));
                source.CopyTo(memory);
                var bytes = memory.ToArray();
                total += bytes.LongLength;
                files.Add(new ObsidianVaultFile(entry.FullName, bytes));
            }
        }
        catch (InvalidDataException)
        {
            diagnostics.Add(new("error", "archive.invalid", archiveName, "The uploaded .zip is not a valid archive."));
        }
    }
}

using System.Security.Cryptography;
using Nook.Application.Files;

namespace Nook.Infrastructure.Files;

/// <summary>
/// <c>NOOK_DATA_DIR/blobs/ab/cd/&lt;sha256&gt;</c> for originals (immutable, deduplicated), <c>derivatives/&lt;sha256&gt;/&lt;spec&gt;.webp</c>
/// for thumbnails, <c>tmp/</c> for in-flight uploads (hashed while streaming, then moved into place atomically).
/// </summary>
public sealed class DiskBlobStore : IBlobStore
{
    private readonly string _blobs;
    private readonly string _derivatives;
    private readonly string _tmp;

    public DiskBlobStore(string dataDir)
    {
        Root = Path.GetFullPath(dataDir);
        _blobs = Path.Combine(Root, "blobs");
        _derivatives = Path.Combine(Root, "derivatives");
        _tmp = Path.Combine(Root, "tmp");
        Directory.CreateDirectory(_blobs);
        Directory.CreateDirectory(_derivatives);
        Directory.CreateDirectory(_tmp);
    }

    public string Root { get; }

    public string PathOf(string sha256)
    {
        Validate(sha256);
        return Path.Combine(_blobs, sha256[..2], sha256[2..4], sha256);
    }

    public string DerivativeDir(string sha256)
    {
        Validate(sha256);
        return Path.Combine(_derivatives, sha256);
    }

    public async Task<StoredBlob> StoreAsync(Stream content, long maxBytes, CancellationToken ct)
    {
        var tmp = Path.Combine(_tmp, Guid.NewGuid().ToString("N"));
        var head = new byte[MimeSniffer.HeadLength];
        var headLen = 0;
        long size = 0;
        string sha;
        try
        {
            using var hasher = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            await using (var file = new FileStream(tmp, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1 << 16, FileOptions.Asynchronous | FileOptions.SequentialScan))
            {
                var buffer = new byte[1 << 16];
                int read;
                while ((read = await content.ReadAsync(buffer, ct)) > 0)
                {
                    size += read;
                    if (maxBytes != FilesOptions.Unlimited && size > maxBytes)
                        throw new PayloadTooLargeException($"The file exceeds the upload limit of {maxBytes / (1024 * 1024)} MB.");
                    if (headLen < head.Length)
                    {
                        var n = Math.Min(head.Length - headLen, read);
                        buffer.AsSpan(0, n).CopyTo(head.AsSpan(headLen));
                        headLen += n;
                    }
                    hasher.AppendData(buffer, 0, read);
                    await file.WriteAsync(buffer.AsMemory(0, read), ct);
                }
                await file.FlushAsync(ct);
            }
            sha = Convert.ToHexStringLower(hasher.GetHashAndReset());
        }
        catch
        {
            TryDeleteFile(tmp);
            throw;
        }

        var target = PathOf(sha);
        var isNew = false;
        if (File.Exists(target))
        {
            TryDeleteFile(tmp);
        }
        else
        {
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            try
            {
                File.Move(tmp, target, overwrite: false);
                isNew = true;
            }
            catch (IOException) when (File.Exists(target))
            {
                TryDeleteFile(tmp); // a concurrent upload of the same bytes won the race
            }
        }
        return new StoredBlob(sha, size, isNew, head.AsSpan(0, headLen).ToArray());
    }

    public bool Exists(string sha256) => File.Exists(PathOf(sha256));

    public Stream OpenRead(string sha256) =>
        new FileStream(PathOf(sha256), FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 16, FileOptions.Asynchronous | FileOptions.SequentialScan);

    public DateTimeOffset? LastModified(string sha256)
    {
        var path = PathOf(sha256);
        return File.Exists(path) ? new DateTimeOffset(File.GetLastWriteTimeUtc(path), TimeSpan.Zero) : null;
    }

    public void Delete(string sha256)
    {
        TryDeleteFile(PathOf(sha256));
        var dir = DerivativeDir(sha256);
        if (Directory.Exists(dir))
        {
            try { Directory.Delete(dir, recursive: true); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    public IEnumerable<(string Sha256, DateTimeOffset ModifiedAt)> EnumerateBlobs()
    {
        if (!Directory.Exists(_blobs)) yield break;
        foreach (var file in Directory.EnumerateFiles(_blobs, "*", SearchOption.AllDirectories))
        {
            var name = Path.GetFileName(file);
            if (name.Length != 64 || !name.All(Uri.IsHexDigit)) continue;
            yield return (name.ToLowerInvariant(), new DateTimeOffset(File.GetLastWriteTimeUtc(file), TimeSpan.Zero));
        }
    }

    public Stream? OpenDerivative(string sha256, string spec)
    {
        var path = Path.Combine(DerivativeDir(sha256), SafeSpec(spec) + ".webp");
        if (!File.Exists(path)) return null;
        try
        {
            return new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 16, FileOptions.Asynchronous);
        }
        catch (FileNotFoundException)
        {
            return null;
        }
    }

    public async Task WriteDerivativeAsync(string sha256, string spec, ReadOnlyMemory<byte> bytes, CancellationToken ct)
    {
        var dir = DerivativeDir(sha256);
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, SafeSpec(spec) + ".webp");
        var tmp = path + "." + Guid.NewGuid().ToString("N") + ".part";
        await using (var file = new FileStream(tmp, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1 << 16, FileOptions.Asynchronous))
        {
            await file.WriteAsync(bytes, ct);
        }
        try { File.Move(tmp, path, overwrite: true); }
        catch (IOException) { TryDeleteFile(tmp); }
    }

    /// <summary>Removes abandoned upload temp files older than <paramref name="olderThan"/>.</summary>
    public int CleanupTemp(TimeSpan olderThan)
    {
        var cutoff = DateTime.UtcNow - olderThan;
        var removed = 0;
        if (!Directory.Exists(_tmp)) return 0;
        foreach (var file in Directory.EnumerateFiles(_tmp))
        {
            try
            {
                if (File.GetLastWriteTimeUtc(file) < cutoff) { File.Delete(file); removed++; }
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
        return removed;
    }

    private static void Validate(string sha256)
    {
        if (sha256.Length != 64 || !sha256.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f'))
            throw new ArgumentException("Invalid sha256.", nameof(sha256));
    }

    private static string SafeSpec(string spec)
    {
        if (spec.Length == 0 || spec.Length > 32 || !spec.All(char.IsAsciiLetterOrDigit)) throw new ArgumentException("Invalid derivative spec.", nameof(spec));
        return spec;
    }

    private static void TryDeleteFile(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}

namespace Nook.Application.Files;

/// <summary>Content-addressed, immutable binary storage plus a cache of derived files (thumbnails).</summary>
public interface IBlobStore
{
    /// <summary>
    /// Streams <paramref name="content"/> into the store while hashing it. Throws <see cref="PayloadTooLargeException"/> once more than
    /// <paramref name="maxBytes"/> were read (the partial file is discarded). Returns the sha256, the size, whether the blob was new and the
    /// first bytes (for MIME sniffing).
    /// </summary>
    Task<StoredBlob> StoreAsync(Stream content, long maxBytes, CancellationToken ct);

    bool Exists(string sha256);

    /// <summary>Opens the blob for reading (seekable). Throws <see cref="FileNotFoundException"/> when missing.</summary>
    Stream OpenRead(string sha256);

    DateTimeOffset? LastModified(string sha256);

    /// <summary>Deletes the blob and all its derivatives (idempotent).</summary>
    void Delete(string sha256);

    /// <summary>All blobs currently on disk with their modification time.</summary>
    IEnumerable<(string Sha256, DateTimeOffset ModifiedAt)> EnumerateBlobs();

    Stream? OpenDerivative(string sha256, string spec);

    Task WriteDerivativeAsync(string sha256, string spec, ReadOnlyMemory<byte> bytes, CancellationToken ct);
}

public sealed record StoredBlob(string Sha256, long Size, bool IsNew, byte[] Head);

using Nook.Application.Files;

namespace Nook.Application.Export;

/// <summary>
/// Read-only access to the §8 blob store for the export writer: opens an existing blob or reports it as <c>null</c>
/// (an attachment row whose bytes are gone must not fail a whole export).
/// </summary>
public sealed class BlobReader(IBlobStore blobs)
{
    public Stream? Open(string sha256)
    {
        if (string.IsNullOrWhiteSpace(sha256) || sha256.Length < 4 || !blobs.Exists(sha256)) return null;
        try
        {
            return blobs.OpenRead(sha256);
        }
        catch (FileNotFoundException)
        {
            return null;
        }
    }
}

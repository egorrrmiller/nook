using Nook.Application.Knowledge;

namespace Nook.Application.Export;

/// <summary>
/// Read-only access to the §8 blob store (<c>NOOK_DATA_DIR/blobs/ab/cd/&lt;sha256&gt;</c>). The store itself is written by the
/// files workstream; this helper only opens existing files and reports missing ones as <c>null</c>.
/// </summary>
public sealed class BlobReader(DataDirectory dataDir)
{
    public Stream? Open(string sha256)
    {
        if (string.IsNullOrWhiteSpace(sha256) || sha256.Length < 4) return null;
        var path = dataDir.BlobPath(sha256);
        return File.Exists(path) ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, useAsync: true) : null;
    }
}

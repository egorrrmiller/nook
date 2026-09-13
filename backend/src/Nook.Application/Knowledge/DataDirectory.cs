using Microsoft.Extensions.Configuration;

namespace Nook.Application.Knowledge;

/// <summary>
/// Resolves <c>NOOK_DATA_DIR</c> (or <c>Nook:DataDir</c>, default <c>./data</c>) the same way the API host does, so the
/// knowledge slices can read blobs (<c>blobs/ab/cd/&lt;sha256&gt;</c>) and park large import uploads (<c>imports/</c>).
/// </summary>
public sealed class DataDirectory(IConfiguration configuration)
{
    public string Root { get; } = Path.GetFullPath(configuration["NOOK_DATA_DIR"] ?? configuration["Nook:DataDir"] ?? "./data");

    public string Blobs => Path.Combine(Root, "blobs");
    public string Imports => Path.Combine(Root, "imports");

    /// <summary>Contracts §8 layout: <c>blobs/ab/cd/&lt;sha256&gt;</c>.</summary>
    public string BlobPath(string sha256)
    {
        if (sha256.Length < 4) throw new ArgumentException("Invalid sha256.", nameof(sha256));
        var sha = sha256.ToLowerInvariant();
        return Path.Combine(Blobs, sha[..2], sha[2..4], sha);
    }
}

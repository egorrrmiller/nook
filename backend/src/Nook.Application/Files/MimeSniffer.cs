using System.Text;

namespace Nook.Application.Files;

/// <summary>Detects the MIME type from magic bytes, falling back to the declared type and finally to the file extension.</summary>
public static class MimeSniffer
{
    public const string OctetStream = "application/octet-stream";
    public const int HeadLength = 1024;

    private static readonly Dictionary<string, string> ByExtension = new(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = "image/png", [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".gif"] = "image/gif", [".webp"] = "image/webp",
        [".svg"] = "image/svg+xml", [".bmp"] = "image/bmp", [".tif"] = "image/tiff", [".tiff"] = "image/tiff", [".heic"] = "image/heic",
        [".avif"] = "image/avif", [".ico"] = "image/x-icon",
        [".pdf"] = "application/pdf", [".zip"] = "application/zip",
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        [".txt"] = "text/plain", [".md"] = "text/markdown", [".markdown"] = "text/markdown", [".csv"] = "text/csv", [".json"] = "application/json",
        [".html"] = "text/html", [".htm"] = "text/html", [".xml"] = "application/xml",
        [".mp4"] = "video/mp4", [".m4v"] = "video/mp4", [".mov"] = "video/quicktime", [".webm"] = "video/webm", [".mkv"] = "video/x-matroska",
        [".mp3"] = "audio/mpeg", [".m4a"] = "audio/mp4", [".ogg"] = "audio/ogg", [".oga"] = "audio/ogg", [".wav"] = "audio/wav", [".flac"] = "audio/flac",
    };

    private static readonly HashSet<string> OfficeZipTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };

    public static string Sniff(ReadOnlySpan<byte> head, string? declared, string? filename)
    {
        declared = NormalizeDeclared(declared);
        var ext = ExtensionOf(filename);
        var byMagic = FromMagic(head);

        if (byMagic == "application/zip")
        {
            if (declared is not null && OfficeZipTypes.Contains(declared)) return declared;
            if (ext is not null && ByExtension.TryGetValue(ext, out var e) && OfficeZipTypes.Contains(e)) return e;
            return "application/zip";
        }
        if (byMagic is not null) return byMagic;

        if (LooksLikeSvg(head)) return "image/svg+xml";

        if (declared is not null && declared != OctetStream) return declared;
        if (ext is not null && ByExtension.TryGetValue(ext, out var byExt)) return byExt;
        return LooksLikeText(head) ? "text/plain" : OctetStream;
    }

    /// <summary>Types the thumbnail endpoint can rasterise (everything libvips loads, SVG included).</summary>
    public static bool IsThumbnailable(string mime) =>
        mime.StartsWith("image/", StringComparison.OrdinalIgnoreCase) && !mime.Equals("image/x-icon", StringComparison.OrdinalIgnoreCase);

    public static bool IsImage(string mime) => mime.StartsWith("image/", StringComparison.OrdinalIgnoreCase);

    /// <summary>Types that can run script when rendered inline by a browser; served as <c>application/octet-stream</c> unless downloaded.</summary>
    public static bool IsActiveContent(string mime)
    {
        var m = mime.Split(';')[0].Trim();
        return m.Equals("image/svg+xml", StringComparison.OrdinalIgnoreCase)
               || m.Equals("text/html", StringComparison.OrdinalIgnoreCase)
               || m.Equals("application/xhtml+xml", StringComparison.OrdinalIgnoreCase)
               || m.Equals("text/xml", StringComparison.OrdinalIgnoreCase)
               || m.Equals("application/xml", StringComparison.OrdinalIgnoreCase)
               || m.Equals("application/javascript", StringComparison.OrdinalIgnoreCase)
               || m.Equals("text/javascript", StringComparison.OrdinalIgnoreCase);
    }

    public static string? NormalizeDeclared(string? declared)
    {
        if (string.IsNullOrWhiteSpace(declared)) return null;
        var m = declared.Split(';')[0].Trim().ToLowerInvariant();
        if (m.Length == 0 || m.Length > 255 || !m.Contains('/')) return null;
        return m;
    }

    public static string? ExtensionOf(string? filename)
    {
        if (string.IsNullOrEmpty(filename)) return null;
        var ext = Path.GetExtension(filename);
        return string.IsNullOrEmpty(ext) ? null : ext;
    }

    // Not u8 literals: those are UTF-8 encoded, so bytes >= 0x80 would become two bytes.
    private static ReadOnlySpan<byte> PngMagic => [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    private static ReadOnlySpan<byte> WebmMagic => [0x1A, 0x45, 0xDF, 0xA3];

    private static string? FromMagic(ReadOnlySpan<byte> h)
    {
        if (h.Length >= 8 && h[..8].SequenceEqual(PngMagic)) return "image/png";
        if (h.Length >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF) return "image/jpeg";
        if (h.Length >= 6 && (h[..6].SequenceEqual("GIF87a"u8) || h[..6].SequenceEqual("GIF89a"u8))) return "image/gif";
        if (h.Length >= 12 && h[..4].SequenceEqual("RIFF"u8) && h[8..12].SequenceEqual("WEBP"u8)) return "image/webp";
        if (h.Length >= 12 && h[..4].SequenceEqual("RIFF"u8) && h[8..12].SequenceEqual("WAVE"u8)) return "audio/wav";
        if (h.Length >= 2 && h[0] == (byte)'B' && h[1] == (byte)'M') return "image/bmp";
        if (h.Length >= 4 && (h[..4].SequenceEqual("II*\0"u8) || h[..4].SequenceEqual("MM\0*"u8))) return "image/tiff";
        if (h.Length >= 5 && h[..5].SequenceEqual("%PDF-"u8)) return "application/pdf";
        if (h.Length >= 4 && h[..4].SequenceEqual("PK\x03\x04"u8)) return "application/zip";
        if (h.Length >= 4 && h[..4].SequenceEqual(WebmMagic)) return "video/webm";
        if (h.Length >= 4 && h[..4].SequenceEqual("OggS"u8)) return "audio/ogg";
        if (h.Length >= 4 && h[..4].SequenceEqual("fLaC"u8)) return "audio/flac";
        if (h.Length >= 3 && h[..3].SequenceEqual("ID3"u8)) return "audio/mpeg";
        if (h.Length >= 2 && h[0] == 0xFF && (h[1] & 0xE6) == 0xE2) return "audio/mpeg";
        if (h.Length >= 12 && h[4..8].SequenceEqual("ftyp"u8))
        {
            var brand = Encoding.ASCII.GetString(h[8..12]);
            if (brand.StartsWith("heic", StringComparison.Ordinal) || brand.StartsWith("heix", StringComparison.Ordinal) || brand is "mif1" or "msf1") return "image/heic";
            if (brand.StartsWith("avif", StringComparison.Ordinal)) return "image/avif";
            if (brand is "qt  ") return "video/quicktime";
            if (brand.StartsWith("M4A", StringComparison.Ordinal)) return "audio/mp4";
            return "video/mp4";
        }
        return null;
    }

    private static bool LooksLikeSvg(ReadOnlySpan<byte> h)
    {
        if (h.Length == 0 || !LooksLikeText(h)) return false;
        var text = Encoding.UTF8.GetString(h);
        var i = 0;
        while (i < text.Length && char.IsWhiteSpace(text[i])) i++;
        if (i >= text.Length || text[i] != '<') return false;
        return text.Contains("<svg", StringComparison.OrdinalIgnoreCase) && !text.Contains("<html", StringComparison.OrdinalIgnoreCase);
    }

    private static bool LooksLikeText(ReadOnlySpan<byte> h)
    {
        if (h.Length == 0) return true;
        foreach (var b in h)
        {
            if (b == 0) return false;
            if (b < 0x20 && b is not (9 or 10 or 13 or 12 or 0x1b)) return false;
        }
        return true;
    }
}

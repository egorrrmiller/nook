namespace Nook.Application.Files;

/// <summary>Image operations (libvips in Infrastructure). <see cref="IsAvailable"/> is false when the native library failed to load.</summary>
public interface IImageProcessor
{
    bool IsAvailable { get; }

    /// <summary>Pixel size of the image after EXIF orientation, or <c>null</c> when the stream is not a decodable image.</summary>
    (int Width, int Height)? Dimensions(Stream image);

    /// <summary>Produces a webp thumbnail of <paramref name="width"/> pixels (never upscales; EXIF auto-rotated).</summary>
    Task<byte[]> ThumbnailWebpAsync(Stream image, int width, CancellationToken ct);
}

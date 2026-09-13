using Microsoft.Extensions.Logging;
using NetVips;
using Nook.Application.Files;

namespace Nook.Infrastructure.Files;

/// <summary>libvips (via NetVips) image processing. Degrades gracefully: <see cref="IsAvailable"/> is false when the native library did not load.</summary>
public sealed class NetVipsImageProcessor : IImageProcessor
{
    private readonly Lazy<bool> _available;

    public NetVipsImageProcessor(ILogger<NetVipsImageProcessor> logger)
    {
        _available = new Lazy<bool>(() =>
        {
            try
            {
                if (!ModuleInitializer.VipsInitialized)
                {
                    logger.LogWarning(ModuleInitializer.Exception, "libvips is not available; thumbnails are disabled");
                    return false;
                }
                NetVips.NetVips.Concurrency = Math.Max(1, Math.Min(4, Environment.ProcessorCount / 2));
                Cache.Max = 0; // originals are read once per derivative; keep memory flat
                logger.LogInformation("libvips {Version} loaded", NetVips.NetVips.Version(0) + "." + NetVips.NetVips.Version(1) + "." + NetVips.NetVips.Version(2));
                return true;
            }
            catch (Exception e)
            {
                logger.LogWarning(e, "libvips failed to initialise; thumbnails are disabled");
                return false;
            }
        });
    }

    public bool IsAvailable => _available.Value;

    public (int Width, int Height)? Dimensions(Stream image)
    {
        if (!IsAvailable) return null;
        try
        {
            using var img = Image.NewFromStream(image, access: Enums.Access.Sequential);
            var swap = img.Contains("orientation") && img.Get("orientation") is int o && o is >= 5 and <= 8;
            return swap ? (img.Height, img.Width) : (img.Width, img.Height);
        }
        catch (VipsException)
        {
            return null;
        }
    }

    public Task<byte[]> ThumbnailWebpAsync(Stream image, int width, CancellationToken ct)
    {
        if (!IsAvailable) throw new InvalidOperationException("libvips is not available.");
        return Task.Run(() =>
        {
            ct.ThrowIfCancellationRequested();
            // Thumbnail auto-rotates from EXIF and never upscales (Size.Down); height follows the aspect ratio.
            using var thumb = Image.ThumbnailStream(image, width, height: width * 8, size: Enums.Size.Down, noRotate: false);
            return thumb.WebpsaveBuffer(q: 82, effort: 4, keep: Enums.ForeignKeep.None);
        }, ct);
    }
}

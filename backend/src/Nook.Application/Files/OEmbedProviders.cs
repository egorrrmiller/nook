using System.Text.RegularExpressions;

namespace Nook.Application.Files;

/// <summary>Built-in oEmbed/embed provider table (contracts §8). Matched against the final URL of a link preview.</summary>
public static partial class OEmbedProviders
{
    public sealed record Provider(string Name, Regex Pattern, string? OEmbedEndpoint, Func<Uri, Match, LinkEmbedDto?>? DirectEmbed);

    public static readonly IReadOnlyList<Provider> All =
    [
        new("YouTube", YouTube(), "https://www.youtube.com/oembed?format=json&url={url}", (u, m) =>
        {
            var id = m.Groups["id"].Value;
            return new LinkEmbedDto("YouTube", null, $"https://www.youtube.com/embed/{id}", null, null, 16.0 / 9.0);
        }),
        new("Vimeo", Vimeo(), "https://vimeo.com/api/oembed.json?url={url}", (u, m) =>
            new LinkEmbedDto("Vimeo", null, $"https://player.vimeo.com/video/{m.Groups["id"].Value}", null, null, 16.0 / 9.0)),
        new("Twitter", Twitter(), "https://publish.twitter.com/oembed?omit_script=true&url={url}", null),
        new("Figma", Figma(), "https://www.figma.com/api/oembed?url={url}", (u, _) =>
            new LinkEmbedDto("Figma", null, $"https://www.figma.com/embed?embed_host=nook&url={Uri.EscapeDataString(u.ToString())}", null, null, 16.0 / 9.0)),
        new("Loom", Loom(), "https://www.loom.com/v1/oembed?url={url}", (u, m) =>
            new LinkEmbedDto("Loom", null, $"https://www.loom.com/embed/{m.Groups["id"].Value}", null, null, 16.0 / 9.0)),
        new("CodePen", CodePen(), "https://codepen.io/api/oembed?format=json&url={url}", (u, m) =>
            new LinkEmbedDto("CodePen", null, $"https://codepen.io/{m.Groups["user"].Value}/embed/{m.Groups["id"].Value}?default-tab=result", null, 400, null)),
        new("GitHub Gist", Gist(), null, (u, m) =>
        {
            var path = $"{m.Groups["user"].Value}/{m.Groups["id"].Value}";
            return new LinkEmbedDto("GitHub Gist", $"<script src=\"https://gist.github.com/{path}.js\"></script>", $"https://gist.github.com/{path}", null, null, null);
        }),
        new("Google Maps", GoogleMaps(), null, (u, _) =>
        {
            var q = System.Web.HttpUtility.ParseQueryString(u.Query).Get("q");
            var embed = string.IsNullOrEmpty(q)
                ? $"https://www.google.com/maps?output=embed&{u.Query.TrimStart('?')}"
                : $"https://www.google.com/maps?q={Uri.EscapeDataString(q)}&output=embed";
            return new LinkEmbedDto("Google Maps", null, embed, null, 450, null);
        }),
        new("Spotify", Spotify(), "https://open.spotify.com/oembed?url={url}", (u, m) =>
            new LinkEmbedDto("Spotify", null, $"https://open.spotify.com/embed/{m.Groups["kind"].Value}/{m.Groups["id"].Value}", null, m.Groups["kind"].Value == "track" ? 152 : 352, null)),
        new("SoundCloud", SoundCloud(), "https://soundcloud.com/oembed?format=json&url={url}", (u, _) =>
            new LinkEmbedDto("SoundCloud", null, $"https://w.soundcloud.com/player/?url={Uri.EscapeDataString(u.ToString())}&visual=true", null, 166, null)),
    ];

    public static (Provider Provider, Match Match)? Match(Uri url)
    {
        var s = url.ToString();
        foreach (var p in All)
        {
            var m = p.Pattern.Match(s);
            if (m.Success) return (p, m);
        }
        return null;
    }

    [GeneratedRegex(@"^https?://(?:www\.|m\.)?(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/)|youtu\.be/)(?<id>[A-Za-z0-9_-]{6,})", RegexOptions.IgnoreCase)]
    private static partial Regex YouTube();

    [GeneratedRegex(@"^https?://(?:www\.)?vimeo\.com/(?:video/)?(?<id>\d+)", RegexOptions.IgnoreCase)]
    private static partial Regex Vimeo();

    [GeneratedRegex(@"^https?://(?:www\.|mobile\.)?(?:twitter\.com|x\.com)/[A-Za-z0-9_]+/status/\d+", RegexOptions.IgnoreCase)]
    private static partial Regex Twitter();

    [GeneratedRegex(@"^https?://(?:www\.)?figma\.com/(?:file|design|proto|board|slides|deck)/[A-Za-z0-9]+", RegexOptions.IgnoreCase)]
    private static partial Regex Figma();

    [GeneratedRegex(@"^https?://(?:www\.)?loom\.com/(?:share|embed)/(?<id>[a-f0-9]{32})", RegexOptions.IgnoreCase)]
    private static partial Regex Loom();

    [GeneratedRegex(@"^https?://codepen\.io/(?<user>[A-Za-z0-9_-]+)/(?:pen|full|details|embed)/(?<id>[A-Za-z0-9]+)", RegexOptions.IgnoreCase)]
    private static partial Regex CodePen();

    [GeneratedRegex(@"^https?://gist\.github\.com/(?<user>[A-Za-z0-9_-]+)/(?<id>[a-f0-9]+)", RegexOptions.IgnoreCase)]
    private static partial Regex Gist();

    [GeneratedRegex(@"^https?://(?:www\.)?google\.[a-z.]+/maps(?:/|\?)", RegexOptions.IgnoreCase)]
    private static partial Regex GoogleMaps();

    [GeneratedRegex(@"^https?://open\.spotify\.com/(?:intl-[a-z]+/)?(?<kind>track|album|playlist|episode|show|artist)/(?<id>[A-Za-z0-9]+)", RegexOptions.IgnoreCase)]
    private static partial Regex Spotify();

    [GeneratedRegex(@"^https?://(?:www\.|m\.)?soundcloud\.com/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+", RegexOptions.IgnoreCase)]
    private static partial Regex SoundCloud();
}

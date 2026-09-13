using System.Text;

namespace Nook.Application.Knowledge;

/// <summary>Opaque, url-safe pagination cursors (base64url of a small text payload).</summary>
public static class Cursor
{
    public static string Encode(string payload) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(payload)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string? Decode(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor)) return null;
        try
        {
            var s = cursor.Replace('-', '+').Replace('_', '/');
            s = s.PadRight(s.Length + (4 - s.Length % 4) % 4, '=');
            return Encoding.UTF8.GetString(Convert.FromBase64String(s));
        }
        catch (FormatException)
        {
            return null;
        }
    }

    /// <summary>Encodes an <c>(instant, id)</c> keyset cursor.</summary>
    public static string EncodeKeyset(DateTimeOffset at, Guid id) => Encode($"{at.UtcTicks}|{id}");

    public static (DateTimeOffset At, Guid Id)? DecodeKeyset(string? cursor)
    {
        var raw = Decode(cursor);
        if (raw is null) return null;
        var parts = raw.Split('|');
        if (parts.Length != 2 || !long.TryParse(parts[0], out var ticks) || !Guid.TryParse(parts[1], out var id)) return null;
        return (new DateTimeOffset(ticks, TimeSpan.Zero), id);
    }

    public static string EncodeOffset(int offset) => Encode($"o|{offset}");

    public static int? DecodeOffset(string? cursor)
    {
        var raw = Decode(cursor);
        if (raw is null || !raw.StartsWith("o|", StringComparison.Ordinal) || !int.TryParse(raw[2..], out var o) || o < 0) return null;
        return o;
    }
}

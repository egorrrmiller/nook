namespace Nook.Application.Users;

/// <summary>Deterministic per-user color for cursors and presence.</summary>
public static class UserColor
{
    private static readonly string[] Palette =
    [
        "#E0524D", "#F28C28", "#D9A400", "#3FA34D", "#2A9D8F", "#2F80ED",
        "#6C5CE7", "#B5179E", "#E75480", "#8D6E63", "#00897B", "#5C6BC0",
    ];

    public static string For(Guid userId)
    {
        var bytes = userId.ToByteArray();
        var hash = 0;
        foreach (var b in bytes) hash = unchecked(hash * 31 + b);
        return Palette[Math.Abs(hash % Palette.Length)];
    }
}

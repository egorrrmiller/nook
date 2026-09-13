namespace Nook.Domain.Enums;

/// <summary>How a tag got attached to a node (contracts §9.2): set by hand, or collected from an inline <c>#hashtag</c>.</summary>
public enum TagSource
{
    Manual,
    Inline,
}

public static class TagSourceExtensions
{
    public static string ToWire(this TagSource source) => source == TagSource.Inline ? "inline" : "manual";

    public static TagSource? ParseWire(string? value) => value?.ToLowerInvariant() switch
    {
        "manual" => TagSource.Manual,
        "inline" => TagSource.Inline,
        _ => null,
    };
}

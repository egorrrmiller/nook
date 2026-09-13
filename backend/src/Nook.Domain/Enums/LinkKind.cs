namespace Nook.Domain.Enums;

public enum LinkKind
{
    Mention,
    Wikilink,
    Embed,
    Synced,
    Relation,
    /// <summary>External http(s) (or other non-Nook) href; <c>target_node_id</c> is always null.</summary>
    Url,
}

public static class LinkKindExtensions
{
    public static string ToWire(this LinkKind kind) => kind switch
    {
        LinkKind.Mention => "mention",
        LinkKind.Wikilink => "wikilink",
        LinkKind.Embed => "embed",
        LinkKind.Synced => "synced",
        LinkKind.Relation => "relation",
        LinkKind.Url => "url",
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };

    public static LinkKind? ParseWire(string? value) => value?.ToLowerInvariant() switch
    {
        "mention" => LinkKind.Mention,
        "wikilink" => LinkKind.Wikilink,
        "embed" => LinkKind.Embed,
        "synced" => LinkKind.Synced,
        "relation" => LinkKind.Relation,
        "url" => LinkKind.Url,
        _ => null,
    };
}

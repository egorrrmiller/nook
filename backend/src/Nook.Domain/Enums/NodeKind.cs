namespace Nook.Domain.Enums;

public enum NodeKind
{
    Page,
    Folder,
    Database,
    CollectionRow,
    File,
}

public static class NodeKindExtensions
{
    public static string ToWire(this NodeKind kind) => kind switch
    {
        NodeKind.Page => "page",
        NodeKind.Folder => "folder",
        NodeKind.Database => "database",
        NodeKind.CollectionRow => "collection_row",
        NodeKind.File => "file",
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };

    public static NodeKind? ParseWire(string? value) => value?.ToLowerInvariant() switch
    {
        "page" => NodeKind.Page,
        "folder" => NodeKind.Folder,
        "database" => NodeKind.Database,
        "collection_row" => NodeKind.CollectionRow,
        "file" => NodeKind.File,
        _ => null,
    };
}

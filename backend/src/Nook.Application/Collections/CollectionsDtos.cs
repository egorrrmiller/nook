using System.Text.Json;
using Nook.Application.Contracts;

namespace Nook.Application.Collections;

public static class CollectionPropertyTypes
{
    public const string Title = "title";
    public const string Text = "text";
    public const string Number = "number";
    public const string Select = "select";
    public const string MultiSelect = "multi_select";
    public const string Status = "status";
    public const string Date = "date";
    public const string Checkbox = "checkbox";
    public const string Url = "url";
    public const string Email = "email";
    public const string Phone = "phone";
    public const string Files = "files";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        Title, Text, Number, Select, MultiSelect, Status, Date, Checkbox, Url, Email, Phone, Files,
    };
}

public static class CollectionViewKinds
{
    public const string Table = "table";
    public const string Board = "board";
    public const string List = "list";
    public const string Gallery = "gallery";
    public const string Calendar = "calendar";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        Table, Board, List, Gallery, Calendar,
    };
}

public sealed record CollectionPropertyRequest(
    string? Id,
    string? Name,
    string? Type,
    JsonElement? Config = null);

public sealed record CollectionPropertyDto(
    string Id,
    string Name,
    string Type,
    JsonElement Config,
    int Position);

public sealed record CreateCollectionRequest(
    string Name,
    IReadOnlyList<CollectionPropertyRequest>? Properties = null,
    JsonElement? Templates = null,
    JsonElement? RowLayout = null);

public sealed record PatchCollectionRequest(
    string? Name = null,
    JsonElement? Templates = null,
    JsonElement? RowLayout = null);

public sealed record UpdateCollectionSchemaRequest(IReadOnlyList<CollectionPropertyRequest> Properties);

public sealed record CollectionDto(
    Guid Id,
    Guid WorkspaceId,
    string Name,
    IReadOnlyList<CollectionPropertyDto> Properties,
    JsonElement Templates,
    JsonElement RowLayout,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record CreateDatabaseRequest(Guid? ParentId = null, string? Title = null);

public sealed record DatabaseDto(
    Guid Id,
    Guid CollectionId,
    NodeDto Node,
    IReadOnlyList<CollectionViewDto> Views,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record CreateCollectionViewRequest(
    string? Name = null,
    string? Kind = null,
    JsonElement? Config = null);

public sealed record PatchCollectionViewRequest(
    string? Name = null,
    string? Kind = null,
    JsonElement? Config = null,
    string? Position = null);

public sealed record CollectionViewDto(
    Guid Id,
    Guid DatabaseId,
    Guid CollectionId,
    string Name,
    string Kind,
    JsonElement Config,
    string Position,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record CreateCollectionRowRequest(JsonElement? Properties = null, string? Title = null);

public sealed record PatchCollectionRowRequest(JsonElement? Properties = null, string? Title = null);

public sealed record CollectionRowDto(NodeDto Node, JsonElement Properties);

/// <summary>Recursive filter tree. A group combines its conditions and child groups with the same operator.</summary>
public sealed record CollectionFilterGroup(
    string? Operator = null,
    IReadOnlyList<CollectionFilter>? Conditions = null,
    IReadOnlyList<CollectionFilterGroup>? Groups = null);

public sealed record CollectionFilter(
    string PropertyId,
    string Operator,
    JsonElement? Value = null);

public sealed record CollectionSort(string PropertyId, string Direction = "asc");

public sealed record CollectionGroup(string PropertyId, string Direction = "asc");

/// <summary>
/// Saved view settings. Layout is intentionally open JSON: future view-specific options can be added without changing
/// the endpoint shape. Filters/sorts/groups are also accepted by the query endpoint as an override.
/// </summary>
public sealed record CollectionViewConfig(
    CollectionFilterGroup? Filters = null,
    IReadOnlyList<CollectionSort>? Sorts = null,
    IReadOnlyList<CollectionGroup>? Groups = null,
    IReadOnlyList<string>? VisiblePropertyIds = null,
    JsonElement? Layout = null);

public sealed record CollectionQueryRequest(
    CollectionFilterGroup? Filters = null,
    IReadOnlyList<CollectionSort>? Sorts = null,
    IReadOnlyList<CollectionGroup>? Groups = null,
    int? Offset = null,
    int? Limit = null);

public sealed record CollectionQueryGroupDto(
    string Key,
    string? Label,
    int Count,
    IReadOnlyList<CollectionRowDto> Rows,
    IReadOnlyList<CollectionQueryGroupDto> Children);

public sealed record CollectionQueryResponse(
    IReadOnlyList<CollectionRowDto> Rows,
    IReadOnlyList<CollectionQueryGroupDto> Groups,
    int Total,
    int Offset,
    int Limit);

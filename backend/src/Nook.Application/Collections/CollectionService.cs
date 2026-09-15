using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Domain.Ordering;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Collections;

/// <summary>
/// Wave 2 MVP for collections/databases. Collections are reusable data sources; database nodes own saved views and
/// collection rows remain ordinary nodes so existing page links, shares, files and tree operations keep working.
/// </summary>
public sealed class CollectionService(
    IAppDbContext db,
    IWorkspaceContextAccessor contextAccessor,
    NodeAccess access,
    NodeService nodes,
    IOutbox outbox,
    IRealtimeNotifier realtime,
    IClock clock)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
    };

    private static readonly CollectionViewConfig DefaultViewConfig = new(
        Filters: new CollectionFilterGroup("and", [], []),
        Sorts: [],
        Groups: [],
        VisiblePropertyIds: null,
        Layout: null);

    private static readonly IReadOnlySet<string> FilterOperators = new HashSet<string>(StringComparer.Ordinal)
    {
        "equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "empty", "not_empty",
        "greater_than", "greater_or_equal", "less_than", "less_or_equal", "before", "after", "is_checked",
        "is_not_checked", "in", "not_in",
    };

    private WorkspaceContext Context => contextAccessor.Required;

    public async Task<CollectionDto> CreateCollectionAsync(CreateCollectionRequest request, CancellationToken ct)
    {
        RequireMembershipRole(WorkspaceRole.Editor);
        var name = NormalizeName(request.Name, "Collection");
        var schema = CollectionPropertyValidator.NormalizeSchema(request.Properties);
        var templates = NormalizeJsonObjectOrArray(request.Templates, "templates", expectObject: false);
        var rowLayout = NormalizeJsonObjectOrArray(request.RowLayout, "rowLayout", expectObject: true);
        var now = clock.UtcNow;
        var entity = new Collection
        {
            WorkspaceId = Context.WorkspaceId,
            Name = name,
            PropertySchema = schema.Json,
            Templates = templates,
            RowLayout = rowLayout,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Collections.Add(entity);
        await db.SaveChangesAsync(ct);
        return ToDto(entity, schema.Properties);
    }

    public async Task<CollectionDto> GetCollectionAsync(Guid collectionId, CancellationToken ct)
    {
        var collection = await RequireCollectionAsync(collectionId, WorkspaceRole.Viewer, ct);
        return ToDto(collection);
    }

    public async Task<CollectionDto> PatchCollectionAsync(Guid collectionId, PatchCollectionRequest request, CancellationToken ct)
    {
        var collection = await RequireCollectionAsync(collectionId, WorkspaceRole.Editor, ct, tracking: true);
        if (request.Name is not null) collection.Name = NormalizeName(request.Name, "Collection");
        if (request.Templates is not null) collection.Templates = NormalizeJsonObjectOrArray(request.Templates, "templates", expectObject: false);
        if (request.RowLayout is not null) collection.RowLayout = NormalizeJsonObjectOrArray(request.RowLayout, "rowLayout", expectObject: true);
        collection.UpdatedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return ToDto(collection);
    }

    public async Task<CollectionDto> ReplaceSchemaAsync(Guid collectionId, UpdateCollectionSchemaRequest request, CancellationToken ct)
    {
        var collection = await RequireCollectionAsync(collectionId, WorkspaceRole.Editor, ct, tracking: true);
        var schema = CollectionPropertyValidator.NormalizeSchema(request.Properties);

        // A schema change must not silently make existing rows unreadable. Adding fields is always safe; changing or
        // removing fields with values requires the caller to migrate/clear those values first.
        var rowValues = await db.Nodes.AsNoTracking()
            .Where(n => n.WorkspaceId == Context.WorkspaceId && n.CollectionId == collectionId
                        && n.Kind == NodeKind.CollectionRow && n.DeletedAt == null)
            .Select(n => n.Properties)
            .ToListAsync(ct);
        foreach (var values in rowValues)
        {
            if (values is not null) _ = CollectionPropertyValidator.ValidateValues(values, schema.Properties);
        }

        collection.PropertySchema = schema.Json;
        collection.UpdatedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return ToDto(collection, schema.Properties);
    }

    public async Task<DatabaseDto> CreateDatabaseAsync(Guid collectionId, CreateDatabaseRequest request, CancellationToken ct)
    {
        var collection = await RequireCollectionAsync(collectionId, WorkspaceRole.Editor, ct);
        var title = string.IsNullOrWhiteSpace(request.Title) ? collection.Name : request.Title.Trim();
        if (title.Length > 1000) throw new ValidationException("Database title is too long (max 1000 chars).");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var node = await nodes.CreateAsync(new CreateNodeRequest(request.ParentId, NodeKind.Database.ToWire(), title, null), ct);
        var now = clock.UtcNow;
        var database = new Database
        {
            NodeId = node.Id,
            CollectionId = collectionId,
            CreatedAt = now,
            UpdatedAt = now,
        };
        var view = new CollectionView
        {
            DatabaseId = node.Id,
            CollectionId = collectionId,
            Name = "Table",
            Kind = CollectionViewKinds.Table,
            Config = Serialize(DefaultViewConfig),
            Position = "a0",
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Databases.Add(database);
        db.CollectionViews.Add(view);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        await realtime.NodeChangedAsync(Context.WorkspaceId, node with { EffectiveRole = null }, ct);
        return new DatabaseDto(node.Id, collectionId, node, [ToDto(view)], now, now);
    }

    public async Task<DatabaseDto> GetDatabaseAsync(Guid databaseId, CancellationToken ct)
    {
        var database = await RequireDatabaseAsync(databaseId, WorkspaceRole.Viewer, ct);
        var viewEntities = await db.CollectionViews.AsNoTracking()
            .Where(v => v.DatabaseId == databaseId)
            .OrderBy(v => v.Position).ThenBy(v => v.CreatedAt)
            .ToListAsync(ct);
        var node = await NodeDtoForAsync(database.Node!, ct);
        return new DatabaseDto(database.NodeId, database.CollectionId, node, viewEntities.Select(ToDto).ToList(), database.CreatedAt, database.UpdatedAt);
    }

    public async Task<IReadOnlyList<CollectionViewDto>> ListViewsAsync(Guid databaseId, CancellationToken ct)
    {
        _ = await RequireDatabaseAsync(databaseId, WorkspaceRole.Viewer, ct);
        return await db.CollectionViews.AsNoTracking()
            .Where(v => v.DatabaseId == databaseId)
            .OrderBy(v => v.Position).ThenBy(v => v.CreatedAt)
            .Select(v => new CollectionViewDto(v.Id, v.DatabaseId, v.CollectionId, v.Name, v.Kind, v.Config, v.Position, v.CreatedAt, v.UpdatedAt))
            .ToListAsync(ct);
    }

    public async Task<CollectionViewDto> CreateViewAsync(Guid databaseId, CreateCollectionViewRequest request, CancellationToken ct)
    {
        var database = await RequireDatabaseAsync(databaseId, WorkspaceRole.Editor, ct);
        var collection = await RequireCollectionAsync(database.CollectionId, WorkspaceRole.Editor, ct);
        var kind = NormalizeViewKind(request.Kind);
        var config = NormalizeViewConfig(request.Config, collection, out _);
        var lastPosition = await db.CollectionViews.AsNoTracking()
            .Where(v => v.DatabaseId == databaseId)
            .OrderByDescending(v => v.Position)
            .Select(v => v.Position)
            .FirstOrDefaultAsync(ct);
        var now = clock.UtcNow;
        var view = new CollectionView
        {
            DatabaseId = databaseId,
            CollectionId = database.CollectionId,
            Name = NormalizeName(request.Name, kind switch { CollectionViewKinds.Table => "Table", _ => kind }),
            Kind = kind,
            Config = config,
            Position = FractionalIndex.GenerateKeyBetween(FractionalIndex.IsValid(lastPosition) ? lastPosition : null, null),
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.CollectionViews.Add(view);
        await db.SaveChangesAsync(ct);
        return ToDto(view);
    }

    public async Task<CollectionViewDto> GetViewAsync(Guid viewId, CancellationToken ct)
    {
        var view = await db.CollectionViews.AsNoTracking().FirstOrDefaultAsync(v => v.Id == viewId, ct)
                   ?? throw new NotFoundException("View not found.");
        _ = await RequireDatabaseAsync(view.DatabaseId, WorkspaceRole.Viewer, ct);
        return ToDto(view);
    }

    public async Task<CollectionViewDto> PatchViewAsync(Guid viewId, PatchCollectionViewRequest request, CancellationToken ct)
    {
        var current = await db.CollectionViews.AsNoTracking().FirstOrDefaultAsync(v => v.Id == viewId, ct)
                      ?? throw new NotFoundException("View not found.");
        _ = await RequireDatabaseAsync(current.DatabaseId, WorkspaceRole.Editor, ct);
        var collection = await RequireCollectionAsync(current.CollectionId, WorkspaceRole.Editor, ct);
        var view = await db.CollectionViews.FirstAsync(v => v.Id == viewId, ct);

        if (request.Name is not null) view.Name = NormalizeName(request.Name, "View");
        if (request.Kind is not null) view.Kind = NormalizeViewKind(request.Kind);
        if (request.Config is not null) view.Config = NormalizeViewConfig(request.Config, collection, out _);
        if (request.Position is not null)
        {
            if (!FractionalIndex.IsValid(request.Position)) throw new ValidationException("Invalid view position key.");
            view.Position = request.Position;
        }
        view.UpdatedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return ToDto(view);
    }

    public async Task<CollectionRowDto> CreateRowAsync(Guid databaseId, CreateCollectionRowRequest request, CancellationToken ct)
    {
        var database = await RequireDatabaseAsync(databaseId, WorkspaceRole.Editor, ct);
        var collection = await RequireCollectionAsync(database.CollectionId, WorkspaceRole.Editor, ct);
        var schema = CollectionPropertyValidator.ReadSchema(collection.PropertySchema);
        var values = request.Properties ?? CollectionPropertyValidator.EmptyObject();
        values = EnsureTitle(values, schema, request.Title);
        var normalized = CollectionPropertyValidator.ValidateValues(values, schema);
        var title = CollectionPropertyValidator.GetTitle(normalized, schema);
        var now = clock.UtcNow;
        var position = await NextRowPositionAsync(databaseId, ct);
        var row = new Node
        {
            WorkspaceId = Context.WorkspaceId,
            ParentId = databaseId,
            Kind = NodeKind.CollectionRow,
            CollectionId = collection.Id,
            Title = title,
            Position = position,
            Properties = normalized,
            PageSettings = Nook.Domain.ValueObjects.PageSettings.Default,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Nodes.Add(row);
        outbox.Enqueue(new NodeCreated(Context.WorkspaceId, row.Id, row.ParentId, row.Kind.ToWire(), Context.UserId));
        outbox.Enqueue(new PropertiesChanged(Context.WorkspaceId, row.Id, Context.UserId));
        await db.SaveChangesAsync(ct);
        access.Remember(row);
        var role = await access.EffectiveRoleAsync(row, ct);
        var dto = ToRowDto(row, role);
        await realtime.NodeChangedAsync(Context.WorkspaceId, dto.Node with { EffectiveRole = null }, ct);
        return dto;
    }

    public async Task<CollectionRowDto> PatchRowAsync(Guid rowId, PatchCollectionRowRequest request, CancellationToken ct)
    {
        var row = await db.Nodes.FirstOrDefaultAsync(n => n.Id == rowId && n.WorkspaceId == Context.WorkspaceId
                                                          && n.Kind == NodeKind.CollectionRow && n.DeletedAt == null, ct)
                  ?? throw new NotFoundException("Collection row not found.");
        _ = await access.EffectiveRoleAsync(row, ct) is { } role && role >= WorkspaceRole.Editor
            ? role
            : throw new ForbiddenException("Insufficient role on this collection row.");
        if (row.CollectionId is not Guid collectionId) throw new ValidationException("Collection row has no collection.");
        var collection = await RequireCollectionAsync(collectionId, WorkspaceRole.Editor, ct);
        var schema = CollectionPropertyValidator.ReadSchema(collection.PropertySchema);
        var values = request.Properties is null ? row.Properties ?? CollectionPropertyValidator.EmptyObject() : request.Properties.Value;
        values = EnsureTitle(values, schema, request.Title);
        var normalized = CollectionPropertyValidator.ValidateValues(values, schema);
        var title = CollectionPropertyValidator.GetTitle(normalized, schema);
        var changed = row.Title != title || !JsonEquals(row.Properties, normalized);
        if (!changed) return ToRowDto(row, role);
        row.Title = title;
        row.Properties = normalized;
        row.UpdatedAt = clock.UtcNow;
        outbox.Enqueue(new NodeUpdated(Context.WorkspaceId, row.Id, ["title", "properties"], Context.UserId));
        outbox.Enqueue(new PropertiesChanged(Context.WorkspaceId, row.Id, Context.UserId));
        await db.SaveChangesAsync(ct);
        return ToRowDto(row, role);
    }

    public async Task<CollectionQueryResponse> QueryViewAsync(Guid viewId, CollectionQueryRequest? request, CancellationToken ct)
    {
        var view = await db.CollectionViews.AsNoTracking().FirstOrDefaultAsync(v => v.Id == viewId, ct)
                   ?? throw new NotFoundException("View not found.");
        var database = await RequireDatabaseAsync(view.DatabaseId, WorkspaceRole.Viewer, ct);
        var collection = await RequireCollectionAsync(view.CollectionId, WorkspaceRole.Viewer, ct);
        var schema = CollectionPropertyValidator.ReadSchema(collection.PropertySchema);
        var saved = ReadViewConfig(view.Config, collection, schema);
        var filters = request?.Filters ?? saved.Filters;
        var sorts = request?.Sorts ?? saved.Sorts ?? [];
        var groups = request?.Groups ?? saved.Groups ?? [];
        ValidateQuery(schema, filters, sorts, groups);

        var accessibleDatabaseIds = await AccessibleDatabaseIdsAsync(collection.Id, ct);
        var rows = await db.Nodes.AsNoTracking()
            .Where(n => n.WorkspaceId == Context.WorkspaceId && n.CollectionId == collection.Id
                        && n.Kind == NodeKind.CollectionRow && n.DeletedAt == null
                        && (Context.IsMember || accessibleDatabaseIds.Contains(n.ParentId!.Value)))
            .OrderBy(n => n.Position)
            .ToListAsync(ct);

        var data = new List<RowData>(rows.Count);
        foreach (var row in rows)
        {
            var role = await access.EffectiveRoleAsync(row, ct);
            if (role is null || role < WorkspaceRole.Viewer) continue;
            data.Add(new RowData(row, ToRowDto(row, role)));
        }

        data = data.Where(x => EvaluateGroup(x.Node.Properties, schema, filters)).ToList();
        SortRows(data, sorts, schema);
        var total = data.Count;
        var offset = request?.Offset ?? 0;
        var limit = request?.Limit ?? 100;
        if (offset < 0) throw new ValidationException("offset must be zero or greater.");
        if (limit is < 1 or > 500) throw new ValidationException("limit must be between 1 and 500.");
        var page = data.Skip(offset).Take(limit).ToList();
        var resultRows = page.Select(x => x.Dto).ToList();
        var resultGroups = BuildGroups(page, groups, schema, 0);
        return new CollectionQueryResponse(resultRows, resultGroups, total, offset, limit);
    }

    private async Task<Collection> RequireCollectionAsync(Guid id, WorkspaceRole minimum, CancellationToken ct, bool tracking = false)
    {
        var query = tracking ? db.Collections : db.Collections.AsNoTracking();
        var collection = await query.FirstOrDefaultAsync(c => c.Id == id && c.WorkspaceId == Context.WorkspaceId, ct)
                         ?? throw new NotFoundException("Collection not found.");
        if (Context.MembershipRole is { } memberRole)
        {
            if (memberRole < minimum) throw new ForbiddenException("Insufficient role on this collection.");
            return collection;
        }

        var databases = await db.Databases.AsNoTracking().Include(x => x.Node)
            .Where(x => x.CollectionId == id && x.Node!.WorkspaceId == Context.WorkspaceId && x.Node.DeletedAt == null)
            .ToListAsync(ct);
        foreach (var database in databases)
        {
            if (database.Node is null) continue;
            var role = await access.EffectiveRoleAsync(database.Node, ct);
            if (role is not null && role >= minimum) return collection;
        }
        throw new ForbiddenException("You do not have access to this collection.");
    }

    private async Task<Database> RequireDatabaseAsync(Guid id, WorkspaceRole minimum, CancellationToken ct)
    {
        var database = await db.Databases.AsNoTracking().Include(x => x.Node)
            .FirstOrDefaultAsync(x => x.NodeId == id && x.Node!.WorkspaceId == Context.WorkspaceId && x.Node.DeletedAt == null, ct)
                        ?? throw new NotFoundException("Database not found.");
        if (database.Node is null) throw new NotFoundException("Database node not found.");
        var role = await access.EffectiveRoleAsync(database.Node, ct);
        if (role is null || role < minimum) throw new ForbiddenException("Insufficient role on this database.");
        return database;
    }

    private async Task<HashSet<Guid>> AccessibleDatabaseIdsAsync(Guid collectionId, CancellationToken ct)
    {
        if (Context.IsMember)
        {
            return (await db.Databases.AsNoTracking().Where(x => x.CollectionId == collectionId).Select(x => x.NodeId).ToListAsync(ct)).ToHashSet();
        }

        var databases = await db.Databases.AsNoTracking().Include(x => x.Node)
            .Where(x => x.CollectionId == collectionId && x.Node!.WorkspaceId == Context.WorkspaceId && x.Node.DeletedAt == null)
            .ToListAsync(ct);
        var result = new HashSet<Guid>();
        foreach (var database in databases)
        {
            if (database.Node is not null && await access.EffectiveRoleAsync(database.Node, ct) is { } role && role >= WorkspaceRole.Viewer)
                result.Add(database.NodeId);
        }
        return result;
    }

    private async Task<string> NextRowPositionAsync(Guid databaseId, CancellationToken ct)
    {
        var last = await db.Nodes.AsNoTracking()
            .Where(n => n.ParentId == databaseId && n.DeletedAt == null)
            .OrderByDescending(n => n.Position)
            .Select(n => n.Position)
            .FirstOrDefaultAsync(ct);
        return FractionalIndex.GenerateKeyBetween(FractionalIndex.IsValid(last) ? last : null, null);
    }

    private static JsonElement EnsureTitle(JsonElement values, IReadOnlyList<CollectionPropertyDto> schema, string? requestedTitle)
    {
        var titleId = CollectionPropertyValidator.TitlePropertyId(schema);
        var hasTitle = values.ValueKind == JsonValueKind.Object
                       && values.TryGetProperty(titleId, out var titleValue)
                       && titleValue.ValueKind == JsonValueKind.String
                       && !string.IsNullOrWhiteSpace(titleValue.GetString());
        if (requestedTitle is not null) return CollectionPropertyValidator.WithTitle(values, schema, requestedTitle);
        return hasTitle ? values : CollectionPropertyValidator.WithTitle(values, schema, "Untitled");
    }

    private static CollectionDto ToDto(Collection collection, IReadOnlyList<CollectionPropertyDto>? schema = null)
    {
        var properties = schema ?? CollectionPropertyValidator.ReadSchema(collection.PropertySchema);
        return new CollectionDto(collection.Id, collection.WorkspaceId, collection.Name, properties, collection.Templates,
            collection.RowLayout, collection.CreatedAt, collection.UpdatedAt);
    }

    private static CollectionViewDto ToDto(CollectionView view) =>
        new(view.Id, view.DatabaseId, view.CollectionId, view.Name, view.Kind, view.Config, view.Position, view.CreatedAt, view.UpdatedAt);

    private static CollectionRowDto ToRowDto(Node row, WorkspaceRole? role) =>
        new(NodeDto.From(row, role), row.Properties ?? CollectionPropertyValidator.EmptyObject());

    private async Task<NodeDto> NodeDtoForAsync(Node node, CancellationToken ct)
    {
        var role = await access.EffectiveRoleAsync(node, ct);
        return NodeDto.From(node, role);
    }

    private static string NormalizeName(string? value, string fallback)
    {
        var result = string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
        if (result.Length > 200) throw new ValidationException("Name is too long (max 200 chars).");
        return result;
    }

    private void RequireMembershipRole(WorkspaceRole minimum)
    {
        if (Context.MembershipRole is not { } role || role < minimum)
            throw new ForbiddenException("Only workspace members can manage collections.");
    }

    private static string NormalizeViewKind(string? value)
    {
        var kind = (value ?? CollectionViewKinds.Table).Trim().ToLowerInvariant();
        if (!CollectionViewKinds.All.Contains(kind)) throw new ValidationException($"Unsupported view kind '{kind}'.");
        return kind;
    }

    private static JsonElement NormalizeJsonObjectOrArray(JsonElement? value, string name, bool expectObject)
    {
        if (value is null || value.Value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
            return expectObject ? JsonSerializer.SerializeToElement(new Dictionary<string, object?>(), JsonOptions) : JsonSerializer.SerializeToElement(Array.Empty<object>(), JsonOptions);
        var valid = expectObject ? value.Value.ValueKind == JsonValueKind.Object : value.Value.ValueKind is JsonValueKind.Object or JsonValueKind.Array;
        if (!valid) throw new ValidationException($"{name} must be {(expectObject ? "an object" : "an object or array")}.");
        return value.Value.Clone();
    }

    private static JsonElement Serialize<T>(T value) => JsonSerializer.SerializeToElement(value, JsonOptions);

    private static JsonElement NormalizeViewConfig(JsonElement? value, Collection collection, out CollectionViewConfig config)
    {
        var schema = CollectionPropertyValidator.ReadSchema(collection.PropertySchema);
        config = value is null || value.Value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null
            ? DefaultViewConfig
            : JsonSerializer.Deserialize<CollectionViewConfig>(value.Value.GetRawText(), JsonOptions) ?? DefaultViewConfig;
        ValidateViewConfig(schema, config);
        return Serialize(config);
    }

    private static CollectionViewConfig ReadViewConfig(JsonElement value, Collection collection, IReadOnlyList<CollectionPropertyDto> schema)
    {
        var config = JsonSerializer.Deserialize<CollectionViewConfig>(value.GetRawText(), JsonOptions) ?? DefaultViewConfig;
        ValidateViewConfig(schema, config);
        return config;
    }

    private static void ValidateViewConfig(IReadOnlyList<CollectionPropertyDto> schema, CollectionViewConfig config)
    {
        var ids = schema.Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
        if (config.VisiblePropertyIds is not null && config.VisiblePropertyIds.Any(id => !ids.Contains(id)))
            throw new ValidationException("visiblePropertyIds contains an unknown property id.");
        ValidateQuery(schema, config.Filters, config.Sorts ?? [], config.Groups ?? []);
        if (config.Layout is { } layout && layout.ValueKind is not (JsonValueKind.Object or JsonValueKind.Null))
            throw new ValidationException("view layout must be an object.");
    }

    private static void ValidateQuery(
        IReadOnlyList<CollectionPropertyDto> schema,
        CollectionFilterGroup? filters,
        IReadOnlyList<CollectionSort> sorts,
        IReadOnlyList<CollectionGroup> groups)
    {
        var ids = schema.Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
        ValidateFilterGroup(filters, ids, 0);
        if (sorts.Count > 20) throw new ValidationException("At most 20 sorts are allowed.");
        foreach (var sort in sorts)
        {
            if (!ids.Contains(sort.PropertyId)) throw new ValidationException($"Unknown sort property '{sort.PropertyId}'.");
            if (sort.Direction is not ("asc" or "desc")) throw new ValidationException("Sort direction must be asc or desc.");
        }
        if (groups.Count > 3) throw new ValidationException("At most 3 group levels are supported in the collections MVP.");
        foreach (var group in groups)
        {
            if (!ids.Contains(group.PropertyId)) throw new ValidationException($"Unknown group property '{group.PropertyId}'.");
            if (group.Direction is not ("asc" or "desc")) throw new ValidationException("Group direction must be asc or desc.");
        }
    }

    private static void ValidateFilterGroup(CollectionFilterGroup? group, IReadOnlySet<string> ids, int depth)
    {
        if (group is null) return;
        if (depth > 8) throw new ValidationException("Filter nesting is too deep.");
        var op = (group.Operator ?? "and").ToLowerInvariant();
        if (op is not ("and" or "or")) throw new ValidationException("Filter group operator must be and or or.");
        if ((group.Conditions?.Count ?? 0) + (group.Groups?.Count ?? 0) > 50)
            throw new ValidationException("A filter group can contain at most 50 entries.");
        foreach (var condition in group.Conditions ?? [])
        {
            if (!ids.Contains(condition.PropertyId)) throw new ValidationException($"Unknown filter property '{condition.PropertyId}'.");
            var conditionOp = condition.Operator.Trim().ToLowerInvariant();
            if (!FilterOperators.Contains(conditionOp)) throw new ValidationException($"Unsupported filter operator '{condition.Operator}'.");
            if (conditionOp is not ("empty" or "not_empty" or "is_checked" or "is_not_checked") && condition.Value is null)
                throw new ValidationException($"Filter '{conditionOp}' requires a value.");
        }
        foreach (var child in group.Groups ?? []) ValidateFilterGroup(child, ids, depth + 1);
    }

    private static bool EvaluateGroup(JsonElement? values, IReadOnlyList<CollectionPropertyDto> schema, CollectionFilterGroup? group)
    {
        if (group is null) return true;
        var checks = new List<bool>();
        foreach (var condition in group.Conditions ?? []) checks.Add(EvaluateCondition(values, condition));
        foreach (var child in group.Groups ?? []) checks.Add(EvaluateGroup(values, schema, child));
        if (checks.Count == 0) return true;
        return string.Equals(group.Operator, "or", StringComparison.OrdinalIgnoreCase) ? checks.Any(x => x) : checks.All(x => x);
    }

    private static bool EvaluateCondition(JsonElement? values, CollectionFilter condition)
    {
        var current = TryValue(values, condition.PropertyId);
        var op = condition.Operator.Trim().ToLowerInvariant();
        var empty = current is null || current.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined
                    || current.Value.ValueKind == JsonValueKind.String && string.IsNullOrWhiteSpace(current.Value.GetString())
                    || current.Value.ValueKind == JsonValueKind.Array && current.Value.GetArrayLength() == 0;
        if (op == "empty") return empty;
        if (op == "not_empty") return !empty;
        if (op == "is_checked") return current is { ValueKind: JsonValueKind.True };
        if (op == "is_not_checked") return current is not { ValueKind: JsonValueKind.True };
        if (current is null) return op is "not_equals" or "not_in";
        var expected = condition.Value!.Value;
        return op switch
        {
            "equals" => JsonValueEquals(current.Value, expected),
            "not_equals" => !JsonValueEquals(current.Value, expected),
            "contains" => Contains(current.Value, expected),
            "not_contains" => !Contains(current.Value, expected),
            "starts_with" => StringValue(current.Value).StartsWith(StringValue(expected), StringComparison.OrdinalIgnoreCase),
            "ends_with" => StringValue(current.Value).EndsWith(StringValue(expected), StringComparison.OrdinalIgnoreCase),
            "greater_than" or "after" => CompareValues(current.Value, expected) > 0,
            "greater_or_equal" => CompareValues(current.Value, expected) >= 0,
            "less_than" or "before" => CompareValues(current.Value, expected) < 0,
            "less_or_equal" => CompareValues(current.Value, expected) <= 0,
            "in" => expected.ValueKind == JsonValueKind.Array && expected.EnumerateArray().Any(item => JsonValueEquals(current.Value, item)),
            "not_in" => expected.ValueKind != JsonValueKind.Array || expected.EnumerateArray().All(item => !JsonValueEquals(current.Value, item)),
            _ => false,
        };
    }

    private static void SortRows(List<RowData> rows, IReadOnlyList<CollectionSort> sorts, IReadOnlyList<CollectionPropertyDto> schema)
    {
        rows.Sort((left, right) =>
        {
            foreach (var sort in sorts)
            {
                var compared = CompareValues(TryValue(left.Node.Properties, sort.PropertyId), TryValue(right.Node.Properties, sort.PropertyId));
                if (compared != 0) return sort.Direction == "desc" ? -compared : compared;
            }
            var title = string.Compare(left.Node.Title, right.Node.Title, StringComparison.OrdinalIgnoreCase);
            return title != 0 ? title : left.Node.Id.CompareTo(right.Node.Id);
        });
    }

    private static IReadOnlyList<CollectionQueryGroupDto> BuildGroups(
        IReadOnlyList<RowData> rows,
        IReadOnlyList<CollectionGroup> groups,
        IReadOnlyList<CollectionPropertyDto> schema,
        int level)
    {
        if (level >= groups.Count) return [];
        var spec = groups[level];
        var grouped = rows.GroupBy(row => GroupKey(TryValue(row.Node.Properties, spec.PropertyId)), StringComparer.Ordinal).ToList();
        if (spec.Direction == "desc") grouped.Reverse();
        return grouped.Select(group => new CollectionQueryGroupDto(
            group.Key,
            group.Key == "" ? null : group.Key,
            group.Count(),
            level == groups.Count - 1 ? group.Select(x => x.Dto).ToList() : [],
            BuildGroups(group.ToList(), groups, schema, level + 1))).ToList();
    }

    private static string GroupKey(JsonElement? value)
    {
        if (value is null || value.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined) return "";
        if (value.Value.ValueKind == JsonValueKind.Array) return string.Join(", ", value.Value.EnumerateArray().Select(StringValue));
        return StringValue(value.Value);
    }

    private static JsonElement? TryValue(JsonElement? values, string propertyId)
    {
        if (values is { ValueKind: JsonValueKind.Object } && values.Value.TryGetProperty(propertyId, out var value)) return value;
        return null;
    }

    private static bool Contains(JsonElement current, JsonElement expected)
    {
        if (current.ValueKind == JsonValueKind.Array) return current.EnumerateArray().Any(item => JsonValueEquals(item, expected));
        return StringValue(current).Contains(StringValue(expected), StringComparison.OrdinalIgnoreCase);
    }

    private static bool JsonValueEquals(JsonElement left, JsonElement right)
    {
        if (left.ValueKind == JsonValueKind.String && right.ValueKind == JsonValueKind.String)
            return string.Equals(left.GetString(), right.GetString(), StringComparison.OrdinalIgnoreCase);
        if (left.ValueKind == JsonValueKind.Number && right.ValueKind == JsonValueKind.Number
            && left.TryGetDecimal(out var ld) && right.TryGetDecimal(out var rd)) return ld == rd;
        return left.GetRawText() == right.GetRawText();
    }

    private static int CompareValues(JsonElement? left, JsonElement? right)
    {
        if (left is null || left.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined) return right is null || right.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ? 0 : 1;
        if (right is null || right.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined) return -1;
        if (left.Value.ValueKind == JsonValueKind.Number && right.Value.ValueKind == JsonValueKind.Number
            && left.Value.TryGetDecimal(out var ld) && right.Value.TryGetDecimal(out var rd)) return ld.CompareTo(rd);
        if (left.Value.ValueKind is JsonValueKind.True or JsonValueKind.False && right.Value.ValueKind is JsonValueKind.True or JsonValueKind.False)
            return left.Value.GetBoolean().CompareTo(right.Value.GetBoolean());
        return string.Compare(StringValue(left.Value), StringValue(right.Value), StringComparison.OrdinalIgnoreCase);
    }

    private static string StringValue(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object && value.TryGetProperty("start", out var start)) return StringValue(start);
        if (value.ValueKind == JsonValueKind.String) return value.GetString() ?? "";
        if (value.ValueKind == JsonValueKind.True) return "true";
        if (value.ValueKind == JsonValueKind.False) return "false";
        return value.ToString();
    }

    private static bool JsonEquals(JsonElement? left, JsonElement right) =>
        left is not null && left.Value.GetRawText() == right.GetRawText();

    private sealed record RowData(Node Node, CollectionRowDto Dto);
}

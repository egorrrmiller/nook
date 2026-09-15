using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Auth;
using Nook.Application.Collections;
using Nook.Application.Common;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Domain.ValueObjects;

namespace Nook.Application.Integrations.Notion;

public sealed record NotionSearchRequest(
    string? Query,
    JsonElement? Filter,
    JsonElement? Sort,
    string? StartCursor,
    int? PageSize);

public sealed record NotionQueryRequest(
    JsonElement? Filter,
    JsonElement? Sorts,
    string? StartCursor,
    int? PageSize,
    string[]? FilterProperties);

/// <summary>Read-only compatibility adapter. It deliberately never calls the collab service or mutates projections.</summary>
public sealed class NotionCompatibilityService(
    IAppDbContext db,
    INotionTokenResolver tokenResolver,
    INotionGrantPolicy grants,
    INotionCapabilityPolicy capabilities,
    INotionCursorCodec cursors)
{
    private const int MaxPageSize = 100;
    private const int MaxQueryRows = 10_000;

    public async Task<NotionPrincipal> AuthenticateAsync(string? authorization, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(authorization) || !authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            throw new NotionApiException(401, "unauthorized", "The bearer token is missing or invalid.");
        var raw = authorization[7..].Trim();
        if (raw.Length == 0) throw new NotionApiException(401, "unauthorized", "The bearer token is missing or invalid.");
        var principal = await tokenResolver.ResolveAsync(raw, ct);
        return principal ?? throw new NotionApiException(401, "unauthorized", "The bearer token is invalid.");
    }

    public async Task<JsonObject> GetMeAsync(NotionPrincipal principal, NotionVersionProfile profile, CancellationToken ct)
    {
        var user = principal.BotUserId is Guid botId
            ? await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == botId, ct)
            : principal.OwnerUserId is Guid ownerId
                ? await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == ownerId, ct)
                : null;
        if (user is null)
        {
            return UserJson(principal.BotUserId ?? principal.OwnerUserId ?? principal.InstallationId,
                principal.IntegrationName, null, "bot", principal, profile, isMe: true);
        }
        return UserJson(user.Id, user.DisplayName, user.AvatarUrl, principal.BotUserId is not null ? "bot" : "person", principal, profile, isMe: true, user.Email);
    }

    public async Task<NotionListResponse<JsonObject>> ListUsersAsync(NotionPrincipal principal, NotionVersionProfile profile,
        string? startCursor, int? pageSize, CancellationToken ct)
    {
        if (principal.TokenKind == InstallationTokenKind.PersonalAccessToken)
            throw new NotionApiException(403, "restricted_resource", "Personal access tokens can retrieve only the current user.");
        if (principal.Capabilities.UserInfoLevel == NotionUserInfoLevel.None)
            throw new NotionApiException(403, "restricted_resource", "This connection does not have user information capabilities.");
        var page = Pagination(pageSize);
        var users = await db.WorkspaceMembers.AsNoTracking()
            .Where(x => x.WorkspaceId == principal.WorkspaceId)
            .OrderBy(x => x.UserId)
            .Select(x => x.User!)
            .Take(MaxQueryRows + 1)
            .ToListAsync(ct);
        var fingerprint = Fingerprint($"users|{principal.Capabilities.UserInfoLevel}");
        var offset = DecodeOffset(principal, fingerprint, startCursor);
        return List(users.Select(x => UserJson(x.Id, x.DisplayName, x.AvatarUrl, "person", principal, profile, false, x.Email)),
            "user", offset, page, principal, fingerprint);
    }

    public async Task<NotionListResponse<JsonObject>> SearchAsync(NotionPrincipal principal, NotionVersionProfile profile,
        NotionSearchRequest request, CancellationToken ct)
    {
        Require(principal, NotionCapability.ReadContent);
        var page = Pagination(request.PageSize);
        var visible = await grants.VisibleNodeIdsAsync(principal, ct);
        var query = db.Nodes.AsNoTracking().Where(x => x.WorkspaceId == principal.WorkspaceId && x.DeletedAt == null
            && (x.Kind == NodeKind.Page || x.Kind == NodeKind.Database || x.Kind == NodeKind.CollectionRow));
        if (visible is not null) query = query.Where(x => visible.Contains(x.Id));
        var needle = request.Query?.Trim();
        if (!string.IsNullOrEmpty(needle))
        {
            var lowered = needle.ToLowerInvariant();
            query = query.Where(x => x.Title.ToLower().Contains(lowered));
        }
        var objectFilter = ObjectFilter(request.Filter);
        if (objectFilter is "page") query = query.Where(x => x.Kind != NodeKind.Database);
        if (objectFilter is "database") query = query.Where(x => x.Kind == NodeKind.Database);
        var nodes = await query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id).Take(MaxQueryRows + 1).ToListAsync(ct);
        if (nodes.Count > MaxQueryRows) throw new NotionApiException(400, "row_limit_exceeded", "Search returned too many results.");
        var fingerprint = Fingerprint($"search|{needle}|{objectFilter}|{request.Sort?.GetRawText() ?? ""}");
        var offset = DecodeOffset(principal, fingerprint, request.StartCursor);
        var result = new List<JsonObject>(nodes.Count);
        foreach (var node in nodes.Skip(offset).Take(page)) result.Add(node.Kind == NodeKind.Database
            ? await DatabaseJsonAsync(node, principal, profile, ct)
            : await PageJsonAsync(node, principal, profile, ct));
        return Page(result, "page_or_database", offset, page, nodes.Count, principal, fingerprint);
    }

    public async Task<JsonObject> RetrievePageAsync(Guid id, NotionPrincipal principal, NotionVersionProfile profile, CancellationToken ct)
    {
        Require(principal, NotionCapability.ReadContent);
        var node = await GetVisibleNodeAsync(id, principal, ct) ?? throw NotFound("Could not find the requested page.");
        if (node.Kind == NodeKind.Folder || node.Kind == NodeKind.File) throw NotFound("Could not find the requested page.");
        return await PageJsonAsync(node, principal, profile, ct);
    }

    public async Task<JsonObject> RetrieveBlockAsync(Guid id, NotionPrincipal principal, NotionVersionProfile profile, CancellationToken ct)
    {
        Require(principal, NotionCapability.ReadContent);
        var node = await GetVisibleNodeAsync(id, principal, ct);
        if (node is not null && node.Kind is not (NodeKind.Folder or NodeKind.File))
            return PageBlockJson(node, profile);

        var block = await db.Blocks.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (block is null || !await IsVisibleAsync(block.NodeId, principal, ct)) throw NotFound("Could not find the requested block.");
        var hasChildren = await db.Blocks.AsNoTracking().AnyAsync(x => x.NodeId == block.NodeId && x.ParentBlockId == block.Id, ct);
        return BlockJson(block, profile, hasChildren);
    }

    public async Task<NotionListResponse<JsonObject>> RetrieveChildrenAsync(Guid id, NotionPrincipal principal,
        NotionVersionProfile profile, string? startCursor, int? pageSize, CancellationToken ct)
    {
        Require(principal, NotionCapability.ReadContent);
        var node = await GetVisibleNodeAsync(id, principal, ct);
        Guid nodeId;
        Guid? parentBlockId;
        if (node is not null && node.Kind is not (NodeKind.Folder or NodeKind.File))
        {
            nodeId = node.Id;
            parentBlockId = null;
        }
        else
        {
            var block = await db.Blocks.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
            if (block is null || !await IsVisibleAsync(block.NodeId, principal, ct)) throw NotFound("Could not find the requested block.");
            nodeId = block.NodeId;
            parentBlockId = block.Id;
        }

        var page = Pagination(pageSize);
        var blocks = await db.Blocks.AsNoTracking().Where(x => x.NodeId == nodeId && x.ParentBlockId == parentBlockId)
            .OrderBy(x => x.Position).ThenBy(x => x.Id).Take(MaxQueryRows + 1).ToListAsync(ct);
        if (blocks.Count > MaxQueryRows) throw new NotionApiException(400, "row_limit_exceeded", "The block contains too many children.");
        var blockIds = blocks.Select(x => x.Id).ToArray();
        var blocksWithChildren = blockIds.Length == 0
            ? new HashSet<Guid>()
            : await db.Blocks.AsNoTracking()
                .Where(x => x.NodeId == nodeId && x.ParentBlockId.HasValue && blockIds.Contains(x.ParentBlockId.Value))
                .Select(x => x.ParentBlockId!.Value)
                .Distinct()
                .ToHashSetAsync(ct);
        var fingerprint = Fingerprint($"children|{id}");
        var offset = DecodeOffset(principal, fingerprint, startCursor);
        var result = new List<JsonObject>(Math.Min(page, blocks.Count));
        foreach (var block in blocks.Skip(offset).Take(page))
            result.Add(BlockJson(block, profile, blocksWithChildren.Contains(block.Id)));
        return Page(result, "block", offset, page, blocks.Count, principal, fingerprint);
    }

    public async Task<JsonObject> RetrieveDatabaseAsync(Guid id, NotionPrincipal principal, NotionVersionProfile profile, CancellationToken ct)
    {
        Require(principal, NotionCapability.ReadContent);
        var database = await db.Databases.AsNoTracking().Include(x => x.Node).Include(x => x.Collection)
            .FirstOrDefaultAsync(x => x.NodeId == id && x.Node!.WorkspaceId == principal.WorkspaceId && x.Node.DeletedAt == null, ct);
        if (database?.Node is null || !await IsVisibleAsync(id, principal, ct)) throw NotFound("Could not find the requested database.");
        return await DatabaseJsonAsync(database.Node, principal, profile, ct, database.Collection);
    }

    public async Task<JsonObject> RetrieveDataSourceAsync(Guid id, NotionPrincipal principal, NotionVersionProfile profile, CancellationToken ct)
    {
        Require(principal, NotionCapability.ReadContent);
        if (!profile.SupportsDatabaseDataSourceSplit) throw new NotionApiException(400, "invalid_request", "Data sources are unavailable in this API version.");
        var collection = await db.Collections.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.WorkspaceId == principal.WorkspaceId, ct);
        if (collection is null) throw NotFound("Could not find the requested data source.");
        var databaseIds = await db.Databases.AsNoTracking().Where(x => x.CollectionId == id && x.Node!.DeletedAt == null).Select(x => x.NodeId).ToListAsync(ct);
        if (databaseIds.Count == 0 || !await AnyVisibleAsync(databaseIds, principal, ct)) throw NotFound("Could not find the requested data source.");
        return DataSourceJson(collection, profile);
    }

    public async Task<NotionListResponse<JsonObject>> QueryDataSourceAsync(Guid id, NotionPrincipal principal,
        NotionVersionProfile profile, NotionQueryRequest request, CancellationToken ct, bool legacyDatabase = false)
    {
        Require(principal, NotionCapability.ReadContent);
        if (legacyDatabase && profile.SupportsDatabaseDataSourceSplit)
            throw new NotionApiException(400, "invalid_request", "Use the data source query endpoint for this API version.");
        if (!legacyDatabase && !profile.SupportsDatabaseDataSourceSplit)
            throw new NotionApiException(400, "invalid_request", "Use the database query endpoint for this API version.");

        Collection? collection;
        if (legacyDatabase)
        {
            var database = await db.Databases.AsNoTracking().FirstOrDefaultAsync(x => x.NodeId == id && x.Node!.WorkspaceId == principal.WorkspaceId && x.Node.DeletedAt == null, ct);
            if (database is null || !await IsVisibleAsync(id, principal, ct)) throw NotFound("Could not find the requested database.");
            collection = await db.Collections.AsNoTracking().FirstOrDefaultAsync(x => x.Id == database.CollectionId && x.WorkspaceId == principal.WorkspaceId, ct);
        }
        else
        {
            collection = await db.Collections.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.WorkspaceId == principal.WorkspaceId, ct);
            var databaseIds = await db.Databases.AsNoTracking().Where(x => x.CollectionId == id && x.Node!.DeletedAt == null).Select(x => x.NodeId).ToListAsync(ct);
            if (collection is null || databaseIds.Count == 0 || !await AnyVisibleAsync(databaseIds, principal, ct)) throw NotFound("Could not find the requested data source.");
        }
        if (collection is null) throw NotFound("Could not find the requested data source.");

        var schema = CollectionPropertyValidator.ReadSchema(collection.PropertySchema);
        var visible = await grants.VisibleNodeIdsAsync(principal, ct);
        var rowsQuery = db.Nodes.AsNoTracking().Where(x => x.WorkspaceId == principal.WorkspaceId && x.CollectionId == collection.Id
            && x.Kind == NodeKind.CollectionRow && x.DeletedAt == null);
        if (visible is not null) rowsQuery = rowsQuery.Where(x => visible.Contains(x.Id));
        var rows = await rowsQuery.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id).Take(MaxQueryRows + 1).ToListAsync(ct);
        if (rows.Count > MaxQueryRows) throw new NotionApiException(400, "row_limit_exceeded", "The data source contains too many matching rows.");
        rows = rows.Where(x => MatchesFilter(x, schema, request.Filter)).ToList();
        ApplySorts(rows, schema, request.Sorts);
        var fingerprint = Fingerprint($"query|{id}|{request.Filter?.GetRawText() ?? ""}|{request.Sorts?.GetRawText() ?? ""}|{string.Join(',', request.FilterProperties ?? [])}");
        var page = Pagination(request.PageSize);
        var offset = DecodeOffset(principal, fingerprint, request.StartCursor);
        var result = new List<JsonObject>(Math.Min(page, Math.Max(0, rows.Count - offset)));
        foreach (var row in rows.Skip(offset).Take(page)) result.Add(await PageJsonAsync(row, principal, profile, ct, schema));
        return Page(result, "page", offset, page, rows.Count, principal, fingerprint);
    }

    private async Task<Node?> GetVisibleNodeAsync(Guid id, NotionPrincipal principal, CancellationToken ct)
    {
        var node = await db.Nodes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.WorkspaceId == principal.WorkspaceId && x.DeletedAt == null, ct);
        return node is not null && await IsVisibleAsync(node.Id, principal, ct) ? node : null;
    }

    private async Task<bool> IsVisibleAsync(Guid nodeId, NotionPrincipal principal, CancellationToken ct) =>
        (await grants.EvaluateAsync(principal, nodeId, ct)).IsAllowed;

    private async Task<bool> AnyVisibleAsync(IReadOnlyCollection<Guid> ids, NotionPrincipal principal, CancellationToken ct)
    {
        var visible = await grants.VisibleNodeIdsAsync(principal, ct);
        return visible is null || ids.Any(visible.Contains);
    }

    private async Task<JsonObject> PageJsonAsync(Node node, NotionPrincipal principal, NotionVersionProfile profile, CancellationToken ct,
        IReadOnlyList<CollectionPropertyDto>? knownSchema = null)
    {
        IReadOnlyList<CollectionPropertyDto>? schema = knownSchema;
        if (schema is null && node.CollectionId is Guid collectionId)
        {
            var collection = await db.Collections.AsNoTracking().FirstOrDefaultAsync(x => x.Id == collectionId && x.WorkspaceId == node.WorkspaceId, ct);
            if (collection is not null) schema = CollectionPropertyValidator.ReadSchema(collection.PropertySchema);
        }
        var properties = schema is null ? PageProperties(node) : CollectionProperties(node, schema);
        var parent = await ParentJsonAsync(node, ct);
        var result = new JsonObject
        {
            ["object"] = "page",
            ["id"] = node.Id.ToString(),
            ["created_time"] = node.CreatedAt,
            ["last_edited_time"] = node.UpdatedAt,
            ["parent"] = parent,
            ["properties"] = properties,
            [profile.UsesInTrash ? "in_trash" : "archived"] = node.DeletedAt is not null || node.ArchivedAt is not null,
            ["url"] = null,
            ["public_url"] = null,
        };
        var icon = IconJson(node.Icon);
        if (icon is not null) result["icon"] = icon;
        var cover = CoverJson(node.Cover);
        if (cover is not null) result["cover"] = cover;
        return result;
    }

    private async Task<JsonObject> DatabaseJsonAsync(Node node, NotionPrincipal principal, NotionVersionProfile profile, CancellationToken ct, Collection? loaded = null)
    {
        var collection = loaded ?? await db.Collections.AsNoTracking().FirstOrDefaultAsync(x => x.Id == node.CollectionId && x.WorkspaceId == node.WorkspaceId, ct);
        if (collection is null) throw NotFound("Could not find the requested database.");
        var result = new JsonObject
        {
            ["object"] = "database",
            ["id"] = node.Id.ToString(),
            ["created_time"] = node.CreatedAt,
            ["last_edited_time"] = node.UpdatedAt,
            ["title"] = RichText(node.Title),
            ["description"] = new JsonArray(),
            ["parent"] = await ParentJsonAsync(node, ct),
            ["is_inline"] = false,
            [profile.UsesInTrash ? "in_trash" : "archived"] = node.DeletedAt is not null || node.ArchivedAt is not null,
            ["url"] = null,
            ["public_url"] = null,
        };
        if (profile.SupportsDatabaseDataSourceSplit)
        {
            result["data_sources"] = new JsonArray(new JsonObject { ["id"] = collection.Id.ToString(), ["name"] = collection.Name });
        }
        else
        {
            result["properties"] = SchemaJson(collection);
        }
        var icon = IconJson(node.Icon);
        if (icon is not null) result["icon"] = icon;
        var cover = CoverJson(node.Cover);
        if (cover is not null) result["cover"] = cover;
        return result;
    }

    private static JsonObject DataSourceJson(Collection collection, NotionVersionProfile profile) => new()
    {
        ["object"] = "data_source",
        ["id"] = collection.Id.ToString(),
        ["properties"] = SchemaJson(collection),
    };

    private async Task<JsonObject> ParentJsonAsync(Node node, CancellationToken ct)
    {
        if (node.ParentId is not Guid parentId) return new JsonObject { ["type"] = "workspace", ["workspace"] = true };
        var parent = await db.Nodes.AsNoTracking().Where(x => x.Id == parentId && x.WorkspaceId == node.WorkspaceId).Select(x => new { x.Id, x.Kind }).FirstOrDefaultAsync(ct);
        return parent?.Kind == NodeKind.Database
            ? new JsonObject { ["type"] = "database_id", ["database_id"] = parent.Id.ToString() }
            : new JsonObject { ["type"] = "page_id", ["page_id"] = parent?.Id.ToString() ?? parentId.ToString() };
    }

    private static JsonObject PageBlockJson(Node node, NotionVersionProfile profile) => new()
    {
        ["object"] = "block",
        ["id"] = node.Id.ToString(),
        ["parent"] = node.ParentId is Guid p ? new JsonObject { ["type"] = "page_id", ["page_id"] = p.ToString() } : new JsonObject { ["type"] = "workspace", ["workspace"] = true },
        ["type"] = node.Kind == NodeKind.Database ? "child_database" : "child_page",
        [node.Kind == NodeKind.Database ? "child_database" : "child_page"] = new JsonObject { ["title"] = node.Title },
        ["has_children"] = true,
        [profile.UsesInTrash ? "in_trash" : "archived"] = node.DeletedAt is not null || node.ArchivedAt is not null,
    };

    private static JsonObject BlockJson(Block block, NotionVersionProfile profile, bool hasChildren)
    {
        var wireType = WireBlockType(block.Type, block.Props);
        var result = new JsonObject
        {
            ["object"] = "block",
            ["id"] = block.Id.ToString(),
            ["created_time"] = block.UpdatedAt,
            ["last_edited_time"] = block.UpdatedAt,
            ["parent"] = block.ParentBlockId is Guid parent
                ? new JsonObject { ["type"] = "block_id", ["block_id"] = parent.ToString() }
                : new JsonObject { ["type"] = "page_id", ["page_id"] = block.NodeId.ToString() },
            ["type"] = wireType,
            ["has_children"] = hasChildren,
            [profile.UsesInTrash ? "in_trash" : "archived"] = false,
        };
        result[wireType] = BlockPayload(block, wireType, profile);
        return result;
    }

    private static JsonNode BlockPayload(Block block, string wireType, NotionVersionProfile profile)
    {
        if (wireType == "unsupported")
        {
            return new JsonObject
            {
                ["raw_type"] = block.Type,
                ["raw_props"] = NodeFrom(block.Props),
                ["raw_content"] = block.Content is { } c ? NodeFrom(c) : null,
            };
        }
        var payload = new JsonObject();
        if (wireType is "paragraph" or "heading_1" or "heading_2" or "heading_3" or "heading_4" or "bulleted_list_item" or "numbered_list_item" or "to_do" or "toggle" or "quote" or "code")
            payload[wireType == "code" ? "rich_text" : "rich_text"] = RichTextFromContent(block.Content);
        if (wireType == "code" && block.Props.ValueKind == JsonValueKind.Object && block.Props.TryGetProperty("language", out var language))
            payload["language"] = NodeFrom(language);
        if (wireType == "image" || wireType == "video" || wireType == "audio" || wireType == "file" || wireType == "bookmark" || wireType == "embed")
        {
            var url = StringProp(block.Props, "url") ?? StringProp(block.Props, "src");
            if (url is not null) payload["url"] = url;
        }
        return payload;
    }

    private static string WireBlockType(string type, JsonElement props) => type switch
    {
        "paragraph" => "paragraph",
        "heading" => HeadingType(props),
        "bulletListItem" or "bulleted_list_item" => "bulleted_list_item",
        "numberedListItem" or "numbered_list_item" => "numbered_list_item",
        "checkListItem" or "to_do" => "to_do",
        "toggleListItem" or "toggle" => "toggle",
        "quote" => "quote",
        "codeBlock" or "code" => "code",
        "divider" => "divider",
        "image" => "image",
        "video" => "video",
        "audio" => "audio",
        "file" => "file",
        "bookmark" => "bookmark",
        "embed" => "embed",
        "table" => "table",
        _ => "unsupported",
    };

    private static string HeadingType(JsonElement props)
    {
        var level = props.ValueKind == JsonValueKind.Object && props.TryGetProperty("level", out var value) && value.TryGetInt32(out var n) ? n : 1;
        return $"heading_{Math.Clamp(level, 1, 4)}";
    }

    private static JsonObject PageProperties(Node node)
    {
        var result = new JsonObject { ["title"] = PropertyJson("title", "title", JsonValue.Create(node.Title)) };
        if (node.Properties is not { ValueKind: JsonValueKind.Object } raw) return result;
        foreach (var property in raw.EnumerateObject())
        {
            if (property.NameEquals("title")) continue;
            if (property.Value.ValueKind == JsonValueKind.Object && property.Value.TryGetProperty("type", out var type)
                && type.ValueKind == JsonValueKind.String && property.Value.TryGetProperty("value", out var value))
                result[property.Name] = PropertyJson(property.Name, type.GetString()!, value);
            else result[property.Name] = PropertyJson(property.Name, "text", property.Value);
        }
        return result;
    }

    private static JsonObject CollectionProperties(Node node, IReadOnlyList<CollectionPropertyDto> schema)
    {
        var result = new JsonObject();
        foreach (var property in schema)
        {
            var value = property.Type == CollectionPropertyTypes.Title
                ? JsonValue.Create(node.Title)
                : RawValue(node.Properties, property.Id);
            result[property.Id] = PropertyJson(property.Id, property.Type, value);
        }
        return result;
    }

    private static JsonObject SchemaJson(Collection collection)
    {
        var result = new JsonObject();
        foreach (var property in CollectionPropertyValidator.ReadSchema(collection.PropertySchema))
        {
            var wire = property.Type == "text" ? "rich_text" : property.Type;
            var definition = new JsonObject { ["id"] = property.Id, ["name"] = property.Name, ["type"] = wire };
            definition[wire] = property.Config.ValueKind == JsonValueKind.Object ? NodeFrom(property.Config) : new JsonObject();
            result[property.Name] = definition;
        }
        return result;
    }

    private static JsonObject PropertyJson(string id, string type, JsonNode? value)
    {
        var wire = type == "text" ? "rich_text" : type;
        var result = new JsonObject { ["id"] = id, ["type"] = wire };
        if (wire is "title" or "rich_text") result[wire] = value is null ? new JsonArray() : RichText(value);
        else if (wire is "select" or "status") result[wire] = value is null ? null : new JsonObject { ["name"] = value };
        else if (wire == "multi_select")
        {
            var array = new JsonArray();
            if (value is JsonArray values) foreach (var item in values) array.Add(new JsonObject { ["name"] = item?.DeepClone() });
            result[wire] = array;
        }
        else if (wire == "date") result[wire] = value is null ? null : DateJson(value);
        else result[wire] = value?.DeepClone();
        return result;
    }

    private static JsonObject PropertyJson(string id, string type, JsonElement value) => PropertyJson(id, type, NodeFrom(value));

    private static JsonNode? RawValue(JsonElement? properties, string key)
    {
        if (properties is not { ValueKind: JsonValueKind.Object } value || !value.TryGetProperty(key, out var property)) return null;
        if (property.ValueKind == JsonValueKind.Object && property.TryGetProperty("value", out var wrapped)) return NodeFrom(wrapped);
        return NodeFrom(property);
    }

    private static JsonObject DateJson(JsonNode value) => value is JsonObject obj && obj["start"] is not null
        ? new JsonObject { ["start"] = obj["start"]!.DeepClone(), ["end"] = obj["end"]?.DeepClone(), ["time_zone"] = null }
        : new JsonObject { ["start"] = value.DeepClone(), ["end"] = null, ["time_zone"] = null };

    private static JsonNode RichText(JsonNode value)
    {
        var text = value.ToString();
        return new JsonArray(new JsonObject
        {
            ["type"] = "text",
            ["text"] = new JsonObject { ["content"] = text, ["link"] = null },
            ["annotations"] = new JsonObject { ["bold"] = false, ["italic"] = false, ["strikethrough"] = false, ["underline"] = false, ["code"] = false, ["color"] = "default" },
            ["plain_text"] = text,
            ["href"] = null,
        });
    }

    private static JsonArray RichText(string value) => (JsonArray)RichText(JsonValue.Create(value)!);

    private static JsonArray RichTextFromContent(JsonElement? content)
    {
        var result = new JsonArray();
        if (content is not { ValueKind: JsonValueKind.Array }) return result;
        foreach (var item in content.Value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            var type = item.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
            var text = item.TryGetProperty("text", out var textValue) && textValue.ValueKind == JsonValueKind.String ? textValue.GetString() : null;
            if (text is null && item.TryGetProperty("content", out var nested) && nested.ValueKind == JsonValueKind.String) text = nested.GetString();
            text ??= "";
            var href = type == "link" && item.TryGetProperty("href", out var hrefValue) ? hrefValue.GetString() : null;
            result.Add(new JsonObject
            {
                ["type"] = "text",
                ["text"] = new JsonObject { ["content"] = text, ["link"] = href is null ? null : new JsonObject { ["url"] = href } },
                ["annotations"] = new JsonObject { ["bold"] = false, ["italic"] = false, ["strikethrough"] = false, ["underline"] = false, ["code"] = false, ["color"] = "default" },
                ["plain_text"] = text,
                ["href"] = href,
            });
        }
        return result;
    }

    private static JsonObject? IconJson(NodeIcon? icon) => icon is null ? null : icon.Type switch
    {
        "emoji" => new JsonObject { ["type"] = "emoji", ["emoji"] = icon.Value },
        "url" or "upload" => new JsonObject { ["type"] = "external", ["external"] = new JsonObject { ["url"] = icon.Value } },
        _ => new JsonObject { ["type"] = "external", ["external"] = new JsonObject { ["url"] = icon.Value } },
    };

    private static JsonObject? CoverJson(NodeCover? cover) => cover is null ? null : new JsonObject
    {
        ["type"] = "external",
        ["external"] = new JsonObject { ["url"] = cover.Value },
    };

    private static JsonObject UserJson(Guid id, string? name, string? avatarUrl, string type,
        NotionPrincipal principal, NotionVersionProfile profile, bool isMe, string? email = null)
    {
        _ = profile;
        var canShareBasic = isMe || principal.Capabilities.UserInfoLevel >= NotionUserInfoLevel.Basic;
        var result = new JsonObject
        {
            ["object"] = "user",
            ["id"] = id.ToString(),
            ["type"] = type,
            ["name"] = canShareBasic ? name : null,
            ["avatar_url"] = canShareBasic ? avatarUrl : null,
        };
        if (type == "person")
        {
            result["person"] = principal.Capabilities.UserInfoLevel >= NotionUserInfoLevel.Email && email is not null
                ? new JsonObject { ["email"] = email }
                : new JsonObject();
        }
        else
        {
            result["bot"] = new JsonObject
            {
                ["owner"] = principal.OwnerUserId is Guid ? new JsonObject { ["type"] = "user" } : new JsonObject { ["type"] = "workspace", ["workspace"] = true },
                ["workspace_name"] = null,
            };
        }
        return result;
    }

    private static JsonNode NodeFrom(JsonElement value) => JsonNode.Parse(value.GetRawText()) ?? new JsonObject();
    private static string? StringProp(JsonElement props, string name) => props.ValueKind == JsonValueKind.Object && props.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    private void Require(NotionPrincipal principal, NotionCapability capability)
    {
        if (!capabilities.Evaluate(principal, capability).IsAllowed)
            throw new NotionApiException(403, "restricted_resource", "This connection does not have the required capability.");
    }

    private static NotionApiException NotFound(string message) => new(404, "object_not_found", message);
    private static int Pagination(int? requested) => requested is null ? 100 : requested.Value is < 1 or > MaxPageSize
        ? throw new NotionApiException(400, "validation_error", $"page_size must be between 1 and {MaxPageSize}.") : requested.Value;

    private int DecodeOffset(NotionPrincipal principal, string fingerprint, string? cursor) => string.IsNullOrWhiteSpace(cursor)
        ? 0
        : cursors.Decode(principal.WorkspaceId, principal.InstallationId, fingerprint, cursor).Offset;

    private static string Fingerprint(string value) => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(value)));

    private NotionListResponse<JsonObject> List(IEnumerable<JsonObject> all, string type, int offset, int pageSize, NotionPrincipal principal, string fingerprint)
    {
        var data = all.ToList();
        return Page(data.Skip(offset).Take(pageSize).ToList(), type, offset, pageSize, data.Count, principal, fingerprint);
    }

    private NotionListResponse<JsonObject> Page(IReadOnlyList<JsonObject> results, string type, int offset, int pageSize, int total,
        NotionPrincipal principal, string fingerprint)
    {
        var hasMore = offset + results.Count < total;
        return new NotionListResponse<JsonObject>
        {
            Type = type,
            Results = results,
            HasMore = hasMore,
            NextCursor = hasMore ? cursors.Encode(principal.WorkspaceId, principal.InstallationId, fingerprint, offset + results.Count) : null,
        };
    }

    private static string? ObjectFilter(JsonElement? filter)
    {
        if (filter is not { ValueKind: JsonValueKind.Object } value) return null;
        return value.TryGetProperty("value", out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    }

    private static bool MatchesFilter(Node row, IReadOnlyList<CollectionPropertyDto> schema, JsonElement? filter)
    {
        if (filter is not { ValueKind: JsonValueKind.Object } value || value.GetPropertyCount() == 0) return true;
        if (value.TryGetProperty("and", out var and) && and.ValueKind == JsonValueKind.Array) return and.EnumerateArray().All(x => MatchesFilter(row, schema, x));
        if (value.TryGetProperty("or", out var or) && or.ValueKind == JsonValueKind.Array) return or.EnumerateArray().Any(x => MatchesFilter(row, schema, x));
        if (!value.TryGetProperty("property", out var property) || property.ValueKind != JsonValueKind.String) throw new NotionApiException(400, "validation_error", "Filter property is required.");
        var definition = schema.FirstOrDefault(x => x.Id == property.GetString() || x.Name.Equals(property.GetString(), StringComparison.OrdinalIgnoreCase));
        if (definition is null) throw new NotionApiException(400, "validation_error", "Unknown filter property.");
        var condition = value.EnumerateObject().FirstOrDefault(x => x.Name != "property");
        if (condition.Name is null || condition.Value.ValueKind != JsonValueKind.Object) throw new NotionApiException(400, "validation_error", "Invalid property filter.");
        var operation = condition.Value.EnumerateObject().FirstOrDefault();
        if (operation.Name is null) throw new NotionApiException(400, "validation_error", "Invalid property filter operation.");
        var actual = definition.Type == CollectionPropertyTypes.Title ? JsonValue.Create(row.Title) : RawValue(row.Properties, definition.Id);
        return CompareFilter(actual, operation.Name, operation.Value);
    }

    private static bool CompareFilter(JsonNode? actual, string op, JsonElement expected)
    {
        var value = expected.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ? null : NodeFrom(expected);
        var empty = actual is null || actual.ToString() is "" or "null" || actual is JsonArray array && array.Count == 0;
        if (op is "is_empty" or "empty") return empty;
        if (op is "is_not_empty" or "not_empty") return !empty;
        if (op is "does_not_equal" or "not_equals") return !CompareScalar(actual, value);
        if (op == "contains") return ContainsValue(actual, value);
        if (op == "does_not_contain") return !ContainsValue(actual, value);
        if (op is "equals" or "equal") return CompareScalar(actual, value);
        if (op is "greater_than" or "greater_than_or_equal_to" or "less_than" or "less_than_or_equal_to")
        {
            if (!double.TryParse(actual?.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var left) || !double.TryParse(value?.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var right)) return false;
            return op switch { "greater_than" => left > right, "greater_than_or_equal_to" => left >= right, "less_than" => left < right, _ => left <= right };
        }
        throw new NotionApiException(400, "validation_error", $"Unsupported filter operator '{op}'.");
    }

    private static bool ContainsValue(JsonNode? actual, JsonNode? expected) => actual is JsonArray array
        ? array.Any(x => string.Equals(x?.ToString(), expected?.ToString(), StringComparison.OrdinalIgnoreCase))
        : actual?.ToString().Contains(expected?.ToString() ?? "", StringComparison.OrdinalIgnoreCase) == true;

    private static bool CompareScalar(JsonNode? left, JsonNode? right) => string.Equals(left?.ToString(), right?.ToString(), StringComparison.OrdinalIgnoreCase);

    private static void ApplySorts(List<Node> rows, IReadOnlyList<CollectionPropertyDto> schema, JsonElement? sorts)
    {
        if (sorts is not { ValueKind: JsonValueKind.Array }) return;
        IOrderedEnumerable<Node>? ordered = null;
        foreach (var sort in sorts.Value.EnumerateArray().Reverse())
        {
            if (!sort.TryGetProperty("property", out var property) || property.ValueKind != JsonValueKind.String) throw new NotionApiException(400, "validation_error", "Sort property is required.");
            var definition = schema.FirstOrDefault(x => x.Id == property.GetString() || x.Name.Equals(property.GetString(), StringComparison.OrdinalIgnoreCase)) ?? throw new NotionApiException(400, "validation_error", "Unknown sort property.");
            var descending = sort.TryGetProperty("direction", out var direction) && direction.GetString() == "descending";
            Func<Node, string> key = row => (definition.Type == CollectionPropertyTypes.Title ? row.Title : RawValue(row.Properties, definition.Id)?.ToString()) ?? "";
            ordered = ordered is null ? (descending ? rows.OrderByDescending(key) : rows.OrderBy(key)) : (descending ? ordered.ThenByDescending(key) : ordered.ThenBy(key));
        }
        if (ordered is not null) rows.Clear();
        if (ordered is not null) rows.AddRange(ordered);
    }
}

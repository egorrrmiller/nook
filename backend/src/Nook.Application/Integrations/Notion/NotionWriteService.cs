using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Collab;
using Nook.Application.Collections;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Domain.Ordering;
using Nook.Domain.ValueObjects;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Integrations.Notion;

/// <summary>
/// Mutating part of the compatibility facade. It converts only the stable Notion block/property subset to Nook's
/// BlockNote shape and keeps unsupported payloads in an explicit raw block instead of silently dropping them.
/// </summary>
public sealed class NotionWriteService(
    IAppDbContext db,
    ICollabClient collab,
    INotionGrantPolicy grants,
    INotionCapabilityPolicy capabilities,
    IClock clock,
    IOutbox outbox,
    IRealtimeNotifier realtime,
    NotionCompatibilityService readApi)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<JsonObject> CreatePageAsync(NotionPrincipal principal, NotionVersionProfile profile, JsonElement request, CancellationToken ct)
    {
        Require(principal, NotionCapability.InsertContent);
        var parent = RequireObject(request, "parent");
        var (parentId, collectionId) = await ResolveParentAsync(parent, principal, ct);
        var collection = collectionId is Guid cid
            ? await db.Collections.AsNoTracking().FirstOrDefaultAsync(x => x.Id == cid && x.WorkspaceId == principal.WorkspaceId, ct)
            : null;
        var schema = collection is null ? null : CollectionPropertyValidator.ReadSchema(collection.PropertySchema);
        var properties = request.TryGetProperty("properties", out var rawProperties) ? rawProperties : EmptyObject();
        var title = ExtractTitle(properties);
        var storedProperties = schema is null
            ? ToStoredPageProperties(properties, title)
            : CollectionPropertyValidator.ValidateValues(ToCollectionValues(properties, schema), schema);
        title = schema is null ? title : CollectionPropertyValidator.GetTitle(storedProperties, schema);

        if (schema is not null) Require(principal, NotionCapability.InsertProperty);
        var now = clock.UtcNow;
        var node = new Node
        {
            WorkspaceId = principal.WorkspaceId,
            ParentId = parentId,
            Kind = schema is null ? NodeKind.Page : NodeKind.CollectionRow,
            CollectionId = collectionId,
            Title = title,
            Position = await NextPositionAsync(parentId, ct),
            Properties = storedProperties,
            PageSettings = Domain.ValueObjects.PageSettings.Default,
            Icon = ParseIcon(request, "icon"),
            Cover = ParseCover(request, "cover"),
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Nodes.Add(node);
        outbox.Enqueue(new NodeCreated(node.WorkspaceId, node.Id, node.ParentId, node.Kind.ToWire(), PrincipalUser(principal)));
        await db.SaveChangesAsync(ct);

        if (request.TryGetProperty("children", out var children) && children.ValueKind == JsonValueKind.Array)
            await collab.ImportAsync(node.Id, title, ConvertChildren(children), PrincipalUser(principal), ct);

        await realtime.NodeChangedAsync(node.WorkspaceId, NodeDto.From(node, null), ct);
        if (node.DeletedAt is not null)
            return DeletedPageJson(node, profile);
        return await readApi.RetrievePageAsync(node.Id, principal, profile, ct);
    }

    public async Task<JsonObject> UpdatePageAsync(Guid pageId, NotionPrincipal principal, NotionVersionProfile profile, JsonElement request, CancellationToken ct)
    {
        Require(principal, NotionCapability.UpdateContent);
        var node = await VisibleNodeAsync(pageId, principal, ct) ?? throw NotFound("Could not find the requested page.");
        if (node.Kind is NodeKind.Folder or NodeKind.File) throw NotFound("Could not find the requested page.");
        var changed = new List<string>();
        if (request.TryGetProperty("properties", out var properties))
        {
            Require(principal, NotionCapability.UpdateProperty);
            var collection = node.CollectionId is Guid cid
                ? await db.Collections.AsNoTracking().FirstOrDefaultAsync(x => x.Id == cid && x.WorkspaceId == node.WorkspaceId, ct)
                : null;
            if (collection is not null)
            {
                var schema = CollectionPropertyValidator.ReadSchema(collection.PropertySchema);
                var incoming = ToCollectionValues(properties, schema);
                var merged = MergeObjects(node.Properties ?? EmptyObject(), incoming);
                var values = CollectionPropertyValidator.ValidateValues(merged, schema);
                node.Properties = values;
                node.Title = CollectionPropertyValidator.GetTitle(values, schema);
            }
            else
            {
                var title = ExtractTitleOrNull(properties);
                node.Properties = MergeObjects(node.Properties ?? EmptyObject(), ToStoredPageProperties(properties, title ?? node.Title));
                if (title is { Length: > 0 }) node.Title = title;
            }
            changed.Add("properties");
        }
        if (request.TryGetProperty("icon", out var icon)) { node.Icon = ParseIconValue(icon); changed.Add("icon"); }
        if (request.TryGetProperty("cover", out var cover)) { node.Cover = ParseCoverValue(cover); changed.Add("cover"); }
        ApplyArchiveState(node, profile, request, changed);
        node.UpdatedAt = clock.UtcNow;
        outbox.Enqueue(new NodeUpdated(node.WorkspaceId, node.Id, changed.Distinct().ToArray(), PrincipalUser(principal)));
        await db.SaveChangesAsync(ct);

        if (changed.Contains("properties") && node.Kind is NodeKind.Page or NodeKind.CollectionRow)
        {
            var current = await collab.GetBlocksAsync(node.Id, ct);
            await collab.ImportAsync(node.Id, node.Title, current.Blocks, PrincipalUser(principal), ct);
        }
        await realtime.NodeChangedAsync(node.WorkspaceId, NodeDto.From(node, null), ct);
        return await readApi.RetrievePageAsync(node.Id, principal, profile, ct);
    }

    public async Task<NotionListResponse<JsonObject>> AppendChildrenAsync(Guid parentId, NotionPrincipal principal, NotionVersionProfile profile, JsonElement request, CancellationToken ct)
    {
        Require(principal, NotionCapability.InsertContent);
        var parent = await VisibleNodeAsync(parentId, principal, ct);
        var blockOwner = parent is null ? await OwnerBlockAsync(parentId, principal, ct) : null;
        if (parent is null && blockOwner is null) throw NotFound("Could not find the requested block or page.");
        var children = RequireArray(request, "children");
        var ownerId = parent?.Id ?? blockOwner!.NodeId;
        var current = await collab.GetBlocksAsync(ownerId, ct);
        var document = ParseArray(current.Blocks);
        var additions = ParseArray(ConvertChildren(children));
        if (parent is not null) AppendToRoot(document, additions);
        else if (!AppendToBlock(document, parentId, additions)) throw NotFound("Could not find the requested block.");
        await collab.ImportAsync(ownerId, current.Title, ToElement(document), PrincipalUser(principal), ct);
        return await BlocksResponseAsync(additions, principal, profile, ownerId, ct);
    }

    public async Task<JsonObject> UpdateBlockAsync(Guid blockId, NotionPrincipal principal, NotionVersionProfile profile, JsonElement request, CancellationToken ct)
    {
        Require(principal, NotionCapability.UpdateContent);
        var owner = await OwnerBlockAsync(blockId, principal, ct) ?? throw NotFound("Could not find the requested block.");
        var current = await collab.GetBlocksAsync(owner.NodeId, ct);
        var update = ConvertSingleBlock(request, blockId);
        var document = ParseArray(current.Blocks);
        if (!ReplaceBlock(document, blockId, update)) throw NotFound("Could not find the requested block.");
        await collab.ImportAsync(owner.NodeId, current.Title, ToElement(document), PrincipalUser(principal), ct);
        return await readApi.RetrieveBlockAsync(blockId, principal, profile, ct);
    }

    public async Task DeleteBlockAsync(Guid blockId, NotionPrincipal principal, CancellationToken ct)
    {
        Require(principal, NotionCapability.UpdateContent);
        var owner = await OwnerBlockAsync(blockId, principal, ct) ?? throw NotFound("Could not find the requested block.");
        var current = await collab.GetBlocksAsync(owner.NodeId, ct);
        var document = ParseArray(current.Blocks);
        if (!RemoveBlock(document, blockId)) throw NotFound("Could not find the requested block.");
        await collab.ImportAsync(owner.NodeId, current.Title, ToElement(document), PrincipalUser(principal), ct);
    }

    private async Task<(Guid? ParentId, Guid? CollectionId)> ResolveParentAsync(JsonElement parent, NotionPrincipal principal, CancellationToken ct)
    {
        var type = String(parent, "type");
        if (type == "workspace")
        {
            if (principal.TokenKind != InstallationTokenKind.PersonalAccessToken || principal.OwnerUserId is not Guid owner
                || !await db.WorkspaceMembers.AnyAsync(x => x.WorkspaceId == principal.WorkspaceId && x.UserId == owner, ct))
                throw new NotionApiException(403, "restricted_resource", "This connection cannot create workspace-root pages.");
            return (null, null);
        }
        var idText = type switch
        {
            "page_id" => String(parent, "page_id"),
            "database_id" => String(parent, "database_id"),
            "data_source_id" => String(parent, "data_source_id"),
            _ => throw new NotionApiException(400, "validation_error", "parent must be page_id, database_id, data_source_id, or workspace."),
        };
        if (!Guid.TryParse(idText, out var id)) throw new NotionApiException(400, "validation_error", "parent id must be a UUID.");
        if (type == "data_source_id")
        {
            var collection = await db.Collections.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.WorkspaceId == principal.WorkspaceId, ct)
                ?? throw NotFound("Could not find the requested data source.");
            var databaseId = await db.Databases.AsNoTracking().Where(x => x.CollectionId == collection.Id && x.Node!.DeletedAt == null)
                .Select(x => (Guid?)x.NodeId).FirstOrDefaultAsync(ct);
            if (databaseId is null) throw NotFound("The data source has no database parent.");
            id = databaseId.Value;
            type = "database_id";
        }
        var node = await VisibleNodeAsync(id, principal, ct) ?? throw NotFound("Could not find the requested parent.");
        if (type == "database_id")
        {
            if (node.Kind != NodeKind.Database) throw new NotionApiException(400, "validation_error", "database_id must refer to a database.");
            var collectionId = await db.Databases.AsNoTracking().Where(x => x.NodeId == node.Id).Select(x => (Guid?)x.CollectionId).FirstOrDefaultAsync(ct);
            return (node.Id, collectionId);
        }
        if (node.Kind is NodeKind.Database or NodeKind.CollectionRow) throw new NotionApiException(400, "validation_error", "page_id must refer to a page.");
        return (node.Id, null);
    }

    private async Task<Node?> VisibleNodeAsync(Guid id, NotionPrincipal principal, CancellationToken ct)
    {
        var node = await db.Nodes.FirstOrDefaultAsync(x => x.Id == id && x.WorkspaceId == principal.WorkspaceId && x.DeletedAt == null, ct);
        if (node is null) return null;
        var visible = await grants.VisibleNodeIdsAsync(principal, ct);
        return visible is null || visible.Contains(id) ? node : null;
    }

    private async Task<Block?> OwnerBlockAsync(Guid id, NotionPrincipal principal, CancellationToken ct)
    {
        var block = await db.Blocks.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (block is null || await VisibleNodeAsync(block.NodeId, principal, ct) is null) return null;
        return block;
    }

    private async Task<string> NextPositionAsync(Guid? parentId, CancellationToken ct)
    {
        var last = await db.Nodes.AsNoTracking().Where(x => x.ParentId == parentId && x.DeletedAt == null)
            .OrderByDescending(x => x.Position).Select(x => x.Position).FirstOrDefaultAsync(ct);
        return FractionalIndex.GenerateKeyBetween(last, null);
    }

    private async Task<NotionListResponse<JsonObject>> BlocksResponseAsync(JsonArray additions, NotionPrincipal principal,
        NotionVersionProfile profile, Guid ownerId, CancellationToken ct)
    {
        var result = new List<JsonObject>();
        foreach (var item in additions)
            if (item?["id"]?.GetValue<string>() is { } id && Guid.TryParse(id, out var blockId))
                result.Add(await readApi.RetrieveBlockAsync(blockId, principal, profile, ct));
        return new NotionListResponse<JsonObject> { Type = "block", Results = result, HasMore = false };
    }

    private static void AppendToRoot(JsonArray current, JsonArray additions)
    {
        foreach (var child in additions) current.Add(child?.DeepClone());
    }

    private static bool AppendToBlock(JsonArray current, Guid id, JsonArray additions)
    {
        foreach (var item in current.OfType<JsonObject>())
        {
            if (item["id"]?.GetValue<string>() == id.ToString())
            {
                var children = item["children"] as JsonArray ?? [];
                foreach (var child in additions) children.Add(child?.DeepClone());
                item["children"] = children;
                return true;
            }
            if (item["children"] is JsonArray nested && AppendToBlock(nested, id, additions)) return true;
        }
        return false;
    }

    private static bool ReplaceBlock(JsonArray current, Guid id, JsonElement replacement)
    {
        foreach (var item in current.OfType<JsonObject>())
        {
            if (item["id"]?.GetValue<string>() == id.ToString())
            {
                var updated = JsonNode.Parse(replacement.GetRawText())!.AsObject();
                item.Clear();
                foreach (var property in updated) item[property.Key] = property.Value?.DeepClone();
                return true;
            }
            if (item["children"] is JsonArray nested && ReplaceBlock(nested, id, replacement)) return true;
        }
        return false;
    }

    private static bool RemoveBlock(JsonArray current, Guid id)
    {
        for (var i = 0; i < current.Count; i++)
        {
            if (current[i]?["id"]?.GetValue<string>() == id.ToString()) { current.RemoveAt(i); return true; }
            if (current[i] is JsonObject item && item["children"] is JsonArray children && RemoveBlock(children, id)) return true;
        }
        return false;
    }

    private static JsonArray ParseArray(JsonElement value) => value.ValueKind == JsonValueKind.Array
        ? JsonNode.Parse(value.GetRawText())!.AsArray()
        : [];

    private static JsonElement ConvertChildren(JsonElement children) => JsonSerializer.SerializeToElement(children.EnumerateArray().Select(ConvertBlock).ToArray(), Json);

    private static JsonElement ConvertSingleBlock(JsonElement request, Guid id)
    {
        var payload = request.TryGetProperty("block", out var block) && block.ValueKind == JsonValueKind.Object ? block : request;
        var converted = ConvertBlock(payload);
        var obj = JsonNode.Parse(converted.GetRawText())!.AsObject();
        obj["id"] = id.ToString();
        return ToElement(obj);
    }

    private static JsonElement ConvertBlock(JsonElement input)
    {
        if (input.ValueKind != JsonValueKind.Object) throw new NotionApiException(400, "validation_error", "Each child block must be an object.");
        var wireType = String(input, "type");
        if (wireType.Length == 0)
        {
            var known = new[] { "paragraph", "heading_1", "heading_2", "heading_3", "heading_4", "bulleted_list_item", "numbered_list_item", "to_do", "toggle", "quote", "code", "divider", "image", "video", "audio", "file", "bookmark", "embed", "table" };
            wireType = known.FirstOrDefault(name => input.TryGetProperty(name, out _)) ?? "unsupported";
        }
        var type = wireType switch
        {
            "heading_1" or "heading_2" or "heading_3" or "heading_4" => "heading",
            "bulleted_list_item" => "bulletListItem",
            "numbered_list_item" => "numberedListItem",
            "to_do" => "checkListItem",
            "toggle" => "toggleListItem",
            "code" => "codeBlock",
            "paragraph" or "quote" or "divider" or "image" or "video" or "audio" or "file" or "bookmark" or "embed" or "table" => wireType,
            _ => "unsupported",
        };
        var payload = input.TryGetProperty(wireType, out var rawPayload) ? rawPayload : input;
        var props = new JsonObject();
        if (type == "heading") props["level"] = int.Parse(wireType[^1..]);
        if (type == "codeBlock" && payload.TryGetProperty("language", out var lang)) props["language"] = JsonNode.Parse(lang.GetRawText());
        if (type is "image" or "video" or "audio" or "file" or "bookmark" or "embed")
        {
            if (payload.TryGetProperty("external", out var external) && external.TryGetProperty("url", out var url)) props["url"] = url.GetString();
            else if (payload.TryGetProperty("url", out var direct)) props["url"] = direct.GetString();
        }
        if (type == "unsupported") { props["raw_type"] = wireType; props["raw_payload"] = JsonNode.Parse(payload.GetRawText()); }
        var result = new JsonObject { ["id"] = input.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String && Guid.TryParse(id.GetString(), out _) ? id.GetString() : Guid.NewGuid().ToString(), ["type"] = type, ["props"] = props, ["content"] = RichTextToBlockContent(payload), ["children"] = new JsonArray() };
        if (input.TryGetProperty("children", out var children) && children.ValueKind == JsonValueKind.Array)
            result["children"] = new JsonArray(children.EnumerateArray().Select(x => JsonNode.Parse(ConvertBlock(x).GetRawText())).ToArray());
        return ToElement(result);
    }

    private static JsonArray RichTextToBlockContent(JsonElement payload)
    {
        var result = new JsonArray();
        var richContent = payload.TryGetProperty("rich_text", out var richText) ? richText : payload.TryGetProperty("title", out var title) ? title : default;
        if (richContent.ValueKind != JsonValueKind.Array) return result;
        foreach (var item in richContent.EnumerateArray())
        {
            if (item.TryGetProperty("text", out var text) && text.TryGetProperty("content", out var textContent))
                result.Add(new JsonObject { ["type"] = "text", ["text"] = textContent.GetString() ?? "", ["styles"] = new JsonObject() });
            else if (item.TryGetProperty("plain_text", out var plain)) result.Add(new JsonObject { ["type"] = "text", ["text"] = plain.GetString() ?? "", ["styles"] = new JsonObject() });
        }
        return result;
    }

    private static JsonElement ToCollectionValues(JsonElement properties, IReadOnlyList<CollectionPropertyDto> schema)
    {
        var result = new JsonObject();
        if (properties.ValueKind != JsonValueKind.Object) return ToElement(result);
        foreach (var property in properties.EnumerateObject())
        {
            var definition = schema.FirstOrDefault(x => x.Id == property.Name || x.Name.Equals(property.Name, StringComparison.OrdinalIgnoreCase));
            if (definition is null) continue;
            var value = property.Value;
            var wire = value.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String ? type.GetString() : definition.Type;
            var payload = value.TryGetProperty(wire ?? "", out var raw) ? raw : value;
            result[definition.Id] = PropertyValue(payload, definition.Type);
        }
        return ToElement(result);
    }

    private static JsonNode? PropertyValue(JsonElement value, string type)
    {
        if (value.ValueKind == JsonValueKind.Null) return null;
        if (type is "title" or "text") return JsonValue.Create(PlainText(value));
        if (type is "select" or "status") return value.TryGetProperty("name", out var name) ? JsonValue.Create(name.GetString()) : JsonValue.Create(PlainText(value));
        if (type == "multi_select") return new JsonArray(value.ValueKind == JsonValueKind.Array ? value.EnumerateArray().Select(x => (JsonNode?)JsonValue.Create(x.TryGetProperty("name", out var n) ? n.GetString() : PlainText(x))).ToArray() : []);
        if (type == "date" && value.ValueKind == JsonValueKind.Object) return JsonNode.Parse(value.GetRawText());
        return JsonNode.Parse(value.GetRawText());
    }

    private static string ExtractTitle(JsonElement properties)
        => ExtractTitleOrNull(properties) ?? "Untitled";

    private static string? ExtractTitleOrNull(JsonElement properties)
    {
        if (properties.ValueKind != JsonValueKind.Object) return null;
        foreach (var property in properties.EnumerateObject())
        {
            if (property.Name.Equals("title", StringComparison.OrdinalIgnoreCase) || property.Value.TryGetProperty("type", out var type) && type.GetString() == "title")
                return PlainText(property.Value.TryGetProperty("title", out var title) ? title : property.Value).Trim() is { Length: > 0 } text ? text[..Math.Min(1000, text.Length)] : null;
        }
        return null;
    }

    private static JsonElement ToStoredPageProperties(JsonElement properties, string title)
    {
        var result = new JsonObject { ["title"] = new JsonObject { ["type"] = "title", ["value"] = title } };
        if (properties.ValueKind == JsonValueKind.Object)
            foreach (var item in properties.EnumerateObject())
            {
                if (item.Name.Equals("title", StringComparison.OrdinalIgnoreCase)) continue;
                var type = item.Value.TryGetProperty("type", out var typeValue) && typeValue.ValueKind == JsonValueKind.String ? typeValue.GetString()! : "text";
                var payload = item.Value.TryGetProperty(type, out var typed) ? typed : item.Value;
                result[item.Name] = new JsonObject { ["type"] = type == "rich_text" ? "text" : type, ["value"] = JsonNode.Parse(PropertyValue(payload, type == "rich_text" ? "text" : type)?.ToJsonString() ?? "null") };
            }
        return ToElement(result);
    }

    private static string PlainText(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.String) return value.GetString() ?? "";
        if (value.ValueKind == JsonValueKind.Array) return string.Concat(value.EnumerateArray().Select(PlainText));
        if (value.ValueKind == JsonValueKind.Object)
        {
            if (value.TryGetProperty("plain_text", out var plain)) return PlainText(plain);
            if (value.TryGetProperty("text", out var text)) return PlainText(text);
            if (value.TryGetProperty("content", out var content)) return PlainText(content);
            if (value.TryGetProperty("name", out var name)) return PlainText(name);
        }
        return value.ToString();
    }

    private static JsonElement MergeObjects(JsonElement original, JsonElement patch)
    {
        var result = original.ValueKind == JsonValueKind.Object ? JsonNode.Parse(original.GetRawText())!.AsObject() : new JsonObject();
        if (patch.ValueKind == JsonValueKind.Object)
            foreach (var property in patch.EnumerateObject()) result[property.Name] = JsonNode.Parse(property.Value.GetRawText());
        return ToElement(result);
    }

    private static void ApplyArchiveState(Node node, NotionVersionProfile profile, JsonElement request, List<string> changed)
    {
        var property = profile.UsesInTrash ? "in_trash" : "archived";
        if (!request.TryGetProperty(property, out var value) || value.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return;
        var enabled = value.GetBoolean();
        if (profile.UsesInTrash) node.DeletedAt = enabled ? DateTimeOffset.UtcNow : null;
        else node.ArchivedAt = enabled ? DateTimeOffset.UtcNow : null;
        changed.Add(property);
    }

    private static NodeIcon? ParseIcon(JsonElement request, string name) => request.TryGetProperty(name, out var value) ? ParseIconValue(value) : null;
    private static NodeIcon? ParseIconValue(JsonElement value) => value.ValueKind == JsonValueKind.Null ? null : value.ValueKind == JsonValueKind.Object
        ? value.TryGetProperty("emoji", out var emoji) ? new NodeIcon("emoji", emoji.GetString() ?? "") : value.TryGetProperty("external", out var external) && external.TryGetProperty("url", out var url) ? new NodeIcon("url", url.GetString() ?? "") : null
        : null;
    private static NodeCover? ParseCover(JsonElement request, string name) => request.TryGetProperty(name, out var value) ? ParseCoverValue(value) : null;
    private static NodeCover? ParseCoverValue(JsonElement value) => value.ValueKind == JsonValueKind.Null ? null : value.ValueKind == JsonValueKind.Object && value.TryGetProperty("external", out var external) && external.TryGetProperty("url", out var url) ? new NodeCover("external", url.GetString() ?? "") : null;

    private static JsonObject DeletedPageJson(Node node, NotionVersionProfile profile) => new()
    {
        ["object"] = "page",
        ["id"] = node.Id.ToString(),
        ["created_time"] = node.CreatedAt,
        ["last_edited_time"] = node.UpdatedAt,
        [profile.UsesInTrash ? "in_trash" : "archived"] = node.DeletedAt is not null || node.ArchivedAt is not null,
        ["properties"] = new JsonObject { ["title"] = new JsonObject { ["id"] = "title", ["type"] = "title", ["title"] = new JsonArray() } },
    };

    private static JsonElement RequireObject(JsonElement value, string name) => value.TryGetProperty(name, out var result) && result.ValueKind == JsonValueKind.Object ? result : throw new NotionApiException(400, "validation_error", $"{name} must be an object.");
    private static JsonElement RequireArray(JsonElement value, string name) => value.TryGetProperty(name, out var result) && result.ValueKind == JsonValueKind.Array ? result : throw new NotionApiException(400, "validation_error", $"{name} must be an array.");
    private static JsonElement EmptyObject() => JsonSerializer.SerializeToElement(new { }, Json);
    private static JsonElement EmptyArray() => JsonSerializer.SerializeToElement(Array.Empty<object>(), Json);
    private static string String(JsonElement value, string name) => value.TryGetProperty(name, out var result) && result.ValueKind == JsonValueKind.String ? result.GetString() ?? "" : "";
    private static Guid? PrincipalUser(NotionPrincipal principal) => principal.OwnerUserId ?? principal.BotUserId;
    private void Require(NotionPrincipal principal, NotionCapability capability) { if (!capabilities.Evaluate(principal, capability).IsAllowed) throw new NotionApiException(403, "restricted_resource", "This connection does not have the required capability."); }
    private static NotionApiException NotFound(string message) => new(404, "object_not_found", message);
    private static JsonElement ToElement(JsonNode node) => JsonSerializer.SerializeToElement(node, Json);
}

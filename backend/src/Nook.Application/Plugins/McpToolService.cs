using System.Text.Json;
using Nook.Application.Collab;
using Nook.Application.Common;
using Nook.Application.Nodes;
using Nook.Application.Properties;
using Nook.Application.Search;
using Nook.Application.Workspaces;

namespace Nook.Application.Plugins;

public sealed record McpToolDescriptor(string Name, string Description, JsonElement InputSchema, bool RequiresWrite);

public sealed record McpToolCallResult(bool IsError, object? Value, string? Error = null);

/// <summary>Application facade for the small built-in MCP surface. It delegates to existing application services.</summary>
public sealed class McpToolService(
    NodeService nodes,
    SearchService search,
    PropertyService properties,
    ICollabClient collab,
    ICollectionQueryPort collections,
    IWorkspaceContextAccessor contextAccessor)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static IReadOnlyList<McpToolDescriptor> Tools { get; } =
    [
        Tool("search", "Search page titles, aliases and block text.", """{"type":"object","required":["query"],"properties":{"workspace_id":{"type":"string"},"query":{"type":"string"},"limit":{"type":"integer"}}}""", false),
        Tool("get_page", "Read a page and its current collaborative blocks.", """{"type":"object","required":["page_id"],"properties":{"workspace_id":{"type":"string"},"page_id":{"type":"string"}}}""", false),
        Tool("append_blocks", "Append BlockNote blocks to a page.", """{"type":"object","required":["page_id","blocks"],"properties":{"workspace_id":{"type":"string"},"page_id":{"type":"string"},"blocks":{"type":"array"}}}""", true),
        Tool("update_properties", "Merge page properties.", """{"type":"object","required":["page_id","properties"],"properties":{"workspace_id":{"type":"string"},"page_id":{"type":"string"},"properties":{"type":"object"}}}""", true),
        Tool("query_collection", "Query a collection through its default database view.", """{"type":"object","required":["collection_id","query"],"properties":{"workspace_id":{"type":"string"},"collection_id":{"type":"string"},"view_id":{"type":"string"},"query":{"type":"object"}}}""", false),
    ];

    public static bool RequiresWrite(string name) => Tools.FirstOrDefault(t => t.Name == name)?.RequiresWrite == true;

    public async Task<McpToolCallResult> CallAsync(string name, JsonElement arguments, CancellationToken ct)
    {
        if (Tools.All(t => t.Name != name)) return new McpToolCallResult(true, null, $"Unknown MCP tool '{name}'.");
        try
        {
            return name switch
            {
                "search" => await SearchAsync(arguments, ct),
                "get_page" => await GetPageAsync(arguments, ct),
                "append_blocks" => await AppendBlocksAsync(arguments, ct),
                "update_properties" => await UpdatePropertiesAsync(arguments, ct),
                "query_collection" => await QueryCollectionAsync(arguments, ct),
                _ => new McpToolCallResult(true, null, $"Unknown MCP tool '{name}'."),
            };
        }
        catch (NookException e)
        {
            return new McpToolCallResult(true, null, e.Message);
        }
    }

    private async Task<McpToolCallResult> SearchAsync(JsonElement args, CancellationToken ct)
    {
        var query = RequiredString(args, "query");
        var limit = OptionalInt(args, "limit");
        var result = await search.SearchAsync(new SearchRequest(query, null, null, "relevance", limit, null), ct);
        return Ok(result);
    }

    private async Task<McpToolCallResult> GetPageAsync(JsonElement args, CancellationToken ct)
    {
        var pageId = RequiredGuid(args, "page_id");
        var node = await nodes.GetAsync(pageId, ct);
        var (title, blocks) = await collab.GetBlocksAsync(pageId, ct);
        return Ok(new { page = node, title, blocks });
    }

    private async Task<McpToolCallResult> AppendBlocksAsync(JsonElement args, CancellationToken ct)
    {
        var pageId = RequiredGuid(args, "page_id");
        var blocks = Required(args, "blocks", JsonValueKind.Array);
        if (blocks.GetArrayLength() is < 1 or > 100) throw new ValidationException("blocks must contain 1–100 items.");
        foreach (var block in blocks.EnumerateArray())
        {
            if (block.ValueKind != JsonValueKind.Object || !block.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String)
                throw new ValidationException("Every appended block must be an object with a type.");
        }
        await nodes.RequireAsync(pageId, Domain.Enums.WorkspaceRole.Editor, ct);
        var operation = JsonSerializer.SerializeToElement(new
        {
            op = "insert",
            blocks = blocks.EnumerateArray().Select(b => b.Clone()).ToArray(),
            placement = "end",
        }, Json);
        var operations = JsonSerializer.SerializeToElement(new[] { operation }, Json);
        var applied = await collab.ApplyOpsAsync(pageId, operations, contextAccessor.Required.UserId, ct);
        return Ok(new { pageId, applied });
    }

    private async Task<McpToolCallResult> UpdatePropertiesAsync(JsonElement args, CancellationToken ct)
    {
        var pageId = RequiredGuid(args, "page_id");
        var patch = Required(args, "properties", JsonValueKind.Object);
        var result = await properties.MergeAsync(pageId, patch, ct);
        return Ok(new { pageId, properties = result });
    }

    private async Task<McpToolCallResult> QueryCollectionAsync(JsonElement args, CancellationToken ct)
    {
        var collectionId = OptionalGuid(args, "collection_id");
        var query = Required(args, "query", JsonValueKind.Object);
        var result = await collections.QueryAsync(contextAccessor.Required.WorkspaceId, collectionId, query, ct);
        return result.Supported ? Ok(new { rows = result.Rows }) : new McpToolCallResult(true, null, result.Message);
    }

    private static McpToolCallResult Ok(object value) => new(false, value);

    private static McpToolDescriptor Tool(string name, string description, string schema, bool requiresWrite) =>
        new(name, description, JsonDocument.Parse(schema).RootElement.Clone(), requiresWrite);

    private static string RequiredString(JsonElement args, string name)
    {
        var value = Required(args, name, JsonValueKind.String).GetString()?.Trim() ?? "";
        if (value.Length == 0 || value.Length > 10_000) throw new ValidationException($"{name} must contain 1–10000 characters.");
        return value;
    }

    private static Guid RequiredGuid(JsonElement args, string name) =>
        OptionalGuid(args, name) ?? throw new ValidationException($"{name} must be a UUID.");

    private static Guid? OptionalGuid(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var value)) return null;
        if (value.ValueKind != JsonValueKind.String || !Guid.TryParse(value.GetString(), out var id)) throw new ValidationException($"{name} must be a UUID.");
        return id;
    }

    private static int? OptionalInt(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var value)) return null;
        if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt32(out var result)) throw new ValidationException($"{name} must be an integer.");
        return result;
    }

    private static JsonElement Required(JsonElement args, string name, JsonValueKind kind)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var value) || value.ValueKind != kind)
            throw new ValidationException($"{name} is required and must be a {kind.ToString().ToLowerInvariant()}.");
        return value.Clone();
    }
}

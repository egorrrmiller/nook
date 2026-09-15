using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Collections;
using Nook.Application.Common;
using Nook.Application.Workspaces;

namespace Nook.Application.Plugins;

/// <summary>
/// Integration point for Wave 3 collections. The plugin/MCP layer depends on this port instead of copying collection
/// query logic into the automation core.
/// </summary>
public interface ICollectionQueryPort
{
    Task<CollectionQueryResult> QueryAsync(Guid workspaceId, Guid? collectionId, JsonElement query, CancellationToken cancellationToken);
}

public sealed record CollectionQueryResult(bool Supported, IReadOnlyList<JsonElement> Rows, string? Message = null);

public sealed class CollectionsQueryPort(
    IAppDbContext db,
    CollectionService collections,
    IWorkspaceContextAccessor contextAccessor) : ICollectionQueryPort
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<CollectionQueryResult> QueryAsync(Guid workspaceId, Guid? collectionId, JsonElement query, CancellationToken cancellationToken)
    {
        if (collectionId is null)
            return new CollectionQueryResult(false, [], "collection_id is required.");
        if (contextAccessor.Required.WorkspaceId != workspaceId)
            return new CollectionQueryResult(false, [], "The requested workspace is not active.");

        var viewId = ReadViewId(query);
        var view = viewId is Guid requestedView
            ? await db.CollectionViews.AsNoTracking().FirstOrDefaultAsync(x => x.Id == requestedView && x.CollectionId == collectionId, cancellationToken)
            : await db.CollectionViews.AsNoTracking().Where(x => x.CollectionId == collectionId).OrderBy(x => x.Position).FirstOrDefaultAsync(cancellationToken);
        if (view is null)
            return new CollectionQueryResult(false, [], "No database view exists for this collection.");

        CollectionQueryRequest? request = null;
        if (query.ValueKind == JsonValueKind.Object)
        {
            try
            {
                request = JsonSerializer.Deserialize<CollectionQueryRequest>(query.GetRawText(), Json);
            }
            catch (JsonException e)
            {
                return new CollectionQueryResult(false, [], $"Invalid collection query: {e.Message}");
            }
        }

        var result = await collections.QueryViewAsync(view.Id, request, cancellationToken);
        var rows = result.Rows.Select(row => JsonSerializer.SerializeToElement(row, Json)).ToArray();
        return new CollectionQueryResult(true, rows);
    }

    private static Guid? ReadViewId(JsonElement query)
    {
        if (query.ValueKind != JsonValueKind.Object || !query.TryGetProperty("view_id", out var value)
            || value.ValueKind != JsonValueKind.String || !Guid.TryParse(value.GetString(), out var id)) return null;
        return id;
    }
}

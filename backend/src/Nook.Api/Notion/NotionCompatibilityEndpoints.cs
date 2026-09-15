using System.Text.Json;
using System.Text.Json.Nodes;
using Nook.Application.Integrations.Notion;

namespace Nook.Api.Notion;

public static class NotionCompatibilityEndpoints
{
    public static IEndpointRouteBuilder MapNotionCompatibilityEndpoints(this IEndpointRouteBuilder app)
    {
        var v1 = app.MapGroup("/v1");
        v1.MapGet("/users/me", (Func<HttpContext, Task<IResult>>)(async http => await ExecuteAsync(http, (api, principal, profile, ct) => api.GetMeAsync(principal, profile, ct))));
        v1.MapGet("/users", (Func<HttpContext, Task<IResult>>)(async http => await ExecuteAsync(http, (api, principal, profile, ct) =>
        {
            var pagination = ReadPagination(http.Request.Query["start_cursor"], http.Request.Query["page_size"]);
            return api.ListUsersAsync(principal, profile, pagination.StartCursor, pagination.PageSize, ct);
        })));
        v1.MapPost("/search", async (HttpContext http) =>
        {
            return await ExecuteAsync(http, async (api, principal, profile, ct) =>
            {
                var request = await ReadBodyAsync<NotionSearchRequest>(http, new HashSet<string>(["query", "filter", "sort", "start_cursor", "page_size"]));
                return await api.SearchAsync(principal, profile, request, ct);
            });
        });
        v1.MapGet("/pages/{pageId:guid}", (HttpContext http, Guid pageId) => ExecuteAsync(http, (api, principal, profile, ct) => api.RetrievePageAsync(pageId, principal, profile, ct)));
        v1.MapGet("/blocks/{blockId:guid}", (HttpContext http, Guid blockId) => ExecuteAsync(http, (api, principal, profile, ct) => api.RetrieveBlockAsync(blockId, principal, profile, ct)));
        v1.MapGet("/blocks/{blockId:guid}/children", (HttpContext http, Guid blockId) => ExecuteAsync(http, (api, principal, profile, ct) =>
        {
            var pagination = ReadPagination(http.Request.Query["start_cursor"], http.Request.Query["page_size"]);
            return api.RetrieveChildrenAsync(blockId, principal, profile, pagination.StartCursor, pagination.PageSize, ct);
        }));
        v1.MapGet("/databases/{databaseId:guid}", (HttpContext http, Guid databaseId) => ExecuteAsync(http, (api, principal, profile, ct) => api.RetrieveDatabaseAsync(databaseId, principal, profile, ct)));
        v1.MapGet("/data_sources/{dataSourceId:guid}", (HttpContext http, Guid dataSourceId) => ExecuteAsync(http, (api, principal, profile, ct) => api.RetrieveDataSourceAsync(dataSourceId, principal, profile, ct)));
        v1.MapPost("/data_sources/{dataSourceId:guid}/query", (HttpContext http, Guid dataSourceId) => ExecuteAsync(http, async (api, principal, profile, ct) =>
        {
            var request = await ReadBodyAsync<NotionQueryRequest>(http, new HashSet<string>(["filter", "sorts", "start_cursor", "page_size", "filter_properties"]));
            return await api.QueryDataSourceAsync(dataSourceId, principal, profile, request, ct);
        }));
        // Legacy 2022-06-28 clients use the database query route.
        v1.MapPost("/databases/{databaseId:guid}/query", (HttpContext http, Guid databaseId) => ExecuteAsync(http, async (api, principal, profile, ct) =>
        {
            var request = await ReadBodyAsync<NotionQueryRequest>(http, new HashSet<string>(["filter", "sorts", "start_cursor", "page_size", "filter_properties"]));
            return await api.QueryDataSourceAsync(databaseId, principal, profile, request, ct, legacyDatabase: true);
        }));
        return app;
    }

    private static async Task<IResult> ExecuteAsync<T>(HttpContext http, Func<NotionCompatibilityService, NotionPrincipal, NotionVersionProfile, CancellationToken, Task<T>> action)
    {
        try
        {
            var api = http.RequestServices.GetRequiredService<NotionCompatibilityService>();
            var principal = await api.AuthenticateAsync(http.Request.Headers.Authorization.FirstOrDefault(), http.RequestAborted);
            var profile = NotionVersionMiddleware.Profile(http);
            var result = await action(api, principal, profile, http.RequestAborted);
            return Results.Json(result);
        }
        catch (NotionApiException error)
        {
            return Error(error.Status, error.Code, error.Message, http.TraceIdentifier);
        }
        catch (JsonException)
        {
            return Error(400, "invalid_json", "Invalid JSON body.", http.TraceIdentifier);
        }
        catch (Nook.Application.Common.NookException error)
        {
            var code = error.Status switch { 401 => "unauthorized", 403 => "restricted_resource", 404 => "object_not_found", _ => "internal_server_error" };
            return Error(error.Status, code, error.Message, http.TraceIdentifier);
        }
        catch (Exception)
        {
            return Error(500, "internal_server_error", "An unexpected error occurred.", http.TraceIdentifier);
        }
    }

    private static IResult Error(int status, string code, string message, string requestId) => Results.Json(new NotionErrorResponse
    {
        Status = status,
        Code = code,
        Message = message,
        RequestId = requestId,
    }, statusCode: status);

    private static async Task<T> ReadBodyAsync<T>(HttpContext http, IReadOnlySet<string> allowed)
    {
        using var document = await JsonDocument.ParseAsync(http.Request.Body, cancellationToken: http.RequestAborted);
        if (document.RootElement.ValueKind != JsonValueKind.Object) throw new NotionApiException(400, "invalid_json", "Request body must be a JSON object.");
        foreach (var property in document.RootElement.EnumerateObject())
            if (!allowed.Contains(property.Name)) throw new NotionApiException(400, "invalid_request", $"Unknown request field '{property.Name}'.");
        return document.RootElement.Deserialize<T>(new JsonSerializerOptions(JsonSerializerDefaults.Web) { PropertyNameCaseInsensitive = true })
            ?? throw new NotionApiException(400, "invalid_json", "Request body is empty.");
    }

    private static (string? StartCursor, int? PageSize) ReadPagination(string? cursor, string? pageSize)
    {
        if (string.IsNullOrWhiteSpace(pageSize)) return (cursor, null);
        if (!int.TryParse(pageSize, out var parsed)) throw new NotionApiException(400, "validation_error", "page_size must be an integer.");
        return (cursor, parsed);
    }
}

using System.Text.Json;
using System.Text.Json.Nodes;
using Nook.Application.Integrations.Notion;

namespace Nook.Api.Notion;

/// <summary>Mutating routes for the Notion-compatible facade. Read routes remain in NotionCompatibilityEndpoints.</summary>
public static class NotionWriteEndpoints
{
    private static readonly IReadOnlySet<string> PageCreateFields = new HashSet<string>(StringComparer.Ordinal)
        { "parent", "properties", "icon", "cover", "children" };
    private static readonly IReadOnlySet<string> PagePatchFields = new HashSet<string>(StringComparer.Ordinal)
        { "properties", "icon", "cover", "archived", "in_trash" };
    private static readonly IReadOnlySet<string> ChildrenFields = new HashSet<string>(StringComparer.Ordinal) { "children" };
    private static readonly IReadOnlySet<string> BlockFields = new HashSet<string>(StringComparer.Ordinal)
        { "type", "paragraph", "heading_1", "heading_2", "heading_3", "heading_4", "bulleted_list_item", "numbered_list_item", "to_do", "toggle", "quote", "code", "divider", "image", "video", "audio", "file", "bookmark", "embed", "table", "block" };

    public static IEndpointRouteBuilder MapNotionWriteEndpoints(this IEndpointRouteBuilder app)
    {
        var v1 = app.MapGroup("/v1");
        v1.MapPost("/pages", (Func<HttpContext, Task<IResult>>)(http => ExecuteAsync(http, PageCreateFields,
            (write, principal, profile, body, ct) => write.CreatePageAsync(principal, profile, body, ct))));
        v1.MapPatch("/pages/{pageId:guid}", (Func<HttpContext, Task<IResult>>)(http =>
            ExecuteRouteAsync(http, "pageId", PagePatchFields, (write, principal, profile, body, id, ct) => write.UpdatePageAsync(id, principal, profile, body, ct))));
        v1.MapPost("/blocks/{blockId:guid}/children", (Func<HttpContext, Task<IResult>>)(http =>
            ExecuteRouteAsync(http, "blockId", ChildrenFields, (write, principal, profile, body, id, ct) => write.AppendChildrenAsync(id, principal, profile, body, ct))));
        v1.MapPatch("/blocks/{blockId:guid}", (Func<HttpContext, Task<IResult>>)(http =>
            ExecuteRouteAsync(http, "blockId", BlockFields, (write, principal, profile, body, id, ct) => write.UpdateBlockAsync(id, principal, profile, body, ct))));
        v1.MapDelete("/blocks/{blockId:guid}", async (HttpContext http, Guid blockId) =>
        {
            try
            {
                var compatibility = http.RequestServices.GetRequiredService<NotionCompatibilityService>();
                var write = http.RequestServices.GetRequiredService<NotionWriteService>();
                var principal = await compatibility.AuthenticateAsync(http.Request.Headers.Authorization.FirstOrDefault(), http.RequestAborted);
                await write.DeleteBlockAsync(blockId, principal, http.RequestAborted);
                return Results.Json(new { @object = "block", id = blockId.ToString(), archived = true, in_trash = true });
            }
            catch (NotionApiException error) { return Error(error.Status, error.Code, error.Message, http.TraceIdentifier); }
            catch (Nook.Application.Common.NookException error) { return Error(error.Status, "internal_server_error", error.Message, http.TraceIdentifier); }
            catch (Exception) { return Error(500, "internal_server_error", "An unexpected error occurred.", http.TraceIdentifier); }
        });
        return app;
    }

    private static async Task<IResult> ExecuteAsync<T>(
        HttpContext http,
        IReadOnlySet<string> allowed,
        Func<NotionWriteService, NotionPrincipal, NotionVersionProfile, JsonElement, CancellationToken, Task<T>> action)
    {
        try
        {
            var compatibility = http.RequestServices.GetRequiredService<NotionCompatibilityService>();
            var write = http.RequestServices.GetRequiredService<NotionWriteService>();
            var principal = await compatibility.AuthenticateAsync(http.Request.Headers.Authorization.FirstOrDefault(), http.RequestAborted);
            var body = await ReadBodyAsync(http, allowed);
            var result = await action(write, principal, NotionVersionMiddleware.Profile(http), body, http.RequestAborted);
            return Results.Json(result);
        }
        catch (NotionApiException error) { return Error(error.Status, error.Code, error.Message, http.TraceIdentifier); }
        catch (JsonException) { return Error(400, "invalid_json", "Invalid JSON body.", http.TraceIdentifier); }
        catch (Nook.Application.Common.NookException error)
        {
            var code = error.Status switch { 403 => "restricted_resource", 404 => "object_not_found", 409 => "conflict_error", _ => "internal_server_error" };
            return Error(error.Status, code, error.Message, http.TraceIdentifier);
        }
        catch (Exception) { return Error(500, "internal_server_error", "An unexpected error occurred.", http.TraceIdentifier); }
    }

    private static async Task<IResult> ExecuteRouteAsync<T>(HttpContext http, string routeKey, IReadOnlySet<string> allowed,
        Func<NotionWriteService, NotionPrincipal, NotionVersionProfile, JsonElement, Guid, CancellationToken, Task<T>> action)
    {
        if (!Guid.TryParse(http.Request.RouteValues[routeKey]?.ToString(), out var id))
            return Error(400, "validation_error", "The route id must be a UUID.", http.TraceIdentifier);
        return await ExecuteAsync(http, allowed, (write, principal, profile, body, ct) => action(write, principal, profile, body, id, ct));
    }

    private static async Task<JsonElement> ReadBodyAsync(HttpContext http, IReadOnlySet<string> allowed)
    {
        using var document = await JsonDocument.ParseAsync(http.Request.Body, cancellationToken: http.RequestAborted);
        if (document.RootElement.ValueKind != JsonValueKind.Object) throw new NotionApiException(400, "invalid_json", "Request body must be a JSON object.");
        foreach (var property in document.RootElement.EnumerateObject())
            if (!allowed.Contains(property.Name)) throw new NotionApiException(400, "invalid_request", $"Unknown request field '{property.Name}'.");
        return document.RootElement.Clone();
    }

    private static IResult Error(int status, string code, string message, string requestId) => Results.Json(new NotionErrorResponse
    {
        Status = status,
        Code = code,
        Message = message,
        RequestId = requestId,
    }, statusCode: status);
}

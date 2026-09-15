using System.Security.Claims;
using System.Text.Json;
using Nook.Api.Auth;
using Nook.Application.Common;
using Nook.Application.Plugins;
using Nook.Application.Workspaces;
using Nook.Infrastructure.Auth;

namespace Nook.Api.Endpoints;

/// <summary>Small JSON-RPC MCP endpoint for self-hosted external agents.</summary>
public static class McpEndpoints
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static IEndpointRouteBuilder MapMcpEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/mcp", HandleAsync)
            .RequireAuthorization()
            .WithTags("MCP")
            .WithName("Mcp");
        return app;
    }

    private static async Task<IResult> HandleAsync(
        HttpContext http,
        JsonElement request,
        McpToolService tools,
        ICurrentUser currentUser,
        WorkspaceContextResolver resolver,
        IWorkspaceContextAccessor contextAccessor,
        CancellationToken ct)
    {
        if (!McpAuthPolicy.IsAllowed(http.User))
            return Results.StatusCode(StatusCodes.Status403Forbidden);
        if (request.ValueKind != JsonValueKind.Object || !request.TryGetProperty("method", out var methodValue)
            || methodValue.ValueKind != JsonValueKind.String)
            return Error(null, -32600, "Invalid JSON-RPC request.");

        var method = methodValue.GetString()!;
        var id = request.TryGetProperty("id", out var rawId) ? rawId.Clone() : JsonSerializer.SerializeToElement<object?>(null, Json);
        var parameters = request.TryGetProperty("params", out var rawParams) ? rawParams.Clone() : EmptyObject();

        if (method == "ping")
            return Response(id, new { });
        if (method == "initialize")
            return Response(id, new
            {
                protocolVersion = "2025-03-26",
                capabilities = new { tools = new { } },
                serverInfo = new { name = "nook", version = "wave2" },
            });
        if (method == "notifications/initialized")
            return Results.NoContent();
        if (method == "tools/list")
        {
            if (!McpAuthPolicy.HasRead(http.User)) return Results.StatusCode(StatusCodes.Status403Forbidden);
            return Response(id, new { tools = McpToolService.Tools.Select(t => new { name = t.Name, description = t.Description, inputSchema = t.InputSchema }) });
        }
        if (method != "tools/call")
            return Error(id, -32601, $"Unknown MCP method '{method}'.");
        if (parameters.ValueKind != JsonValueKind.Object || !parameters.TryGetProperty("name", out var nameValue)
            || nameValue.ValueKind != JsonValueKind.String)
            return Error(id, -32602, "tools/call requires params.name.");

        var name = nameValue.GetString()!;
        if (!McpAuthPolicy.HasRead(http.User)) return Results.StatusCode(StatusCodes.Status403Forbidden);
        if (McpToolService.RequiresWrite(name) && !McpAuthPolicy.HasWrite(http.User))
            return Results.StatusCode(StatusCodes.Status403Forbidden);

        var arguments = parameters.TryGetProperty("arguments", out var rawArguments) ? rawArguments.Clone() : EmptyObject();
        var workspaceId = WorkspaceId(http, arguments);
        if (workspaceId is null) return Error(id, -32602, "workspace_id or X-Workspace-Id is required.");
        contextAccessor.Current = await resolver.ResolveAsync(currentUser.UserId, workspaceId.Value, ct);

        var result = await tools.CallAsync(name, arguments, ct);
        var content = new[]
        {
            new
            {
                type = "text",
                text = result.IsError ? result.Error ?? "Tool failed." : JsonSerializer.Serialize(result.Value, Json),
            },
        };
        return Response(id, new { content, isError = result.IsError });
    }

    public static class McpAuthPolicy
    {
        public static bool IsAllowed(ClaimsPrincipal principal) =>
            principal.Identity?.IsAuthenticated == true
            && principal.FindFirst(NookClaims.AuthType)?.Value == NookClaims.AuthTypeApiToken;

        public static bool HasRead(ClaimsPrincipal principal) =>
            HasScope(principal, "read") || HasScope(principal, "write") || HasScope(principal, "admin");

        public static bool HasWrite(ClaimsPrincipal principal) =>
            HasScope(principal, "write") || HasScope(principal, "admin");

        private static bool HasScope(ClaimsPrincipal principal, string scope) =>
            principal.FindAll(NookClaims.Scope).Any(c => c.Value == scope);
    }

    private static Guid? WorkspaceId(HttpContext http, JsonElement arguments)
    {
        if (Guid.TryParse(http.Request.Headers["X-Workspace-Id"].ToString(), out var headerId)) return headerId;
        if (arguments.ValueKind == JsonValueKind.Object && arguments.TryGetProperty("workspace_id", out var value)
            && value.ValueKind == JsonValueKind.String && Guid.TryParse(value.GetString(), out var argumentId)) return argumentId;
        return null;
    }

    private static IResult Response(JsonElement id, object result) =>
        Results.Json(new { jsonrpc = "2.0", id, result }, Json);

    private static IResult Error(JsonElement? id, int code, string message) =>
        Results.Json(new { jsonrpc = "2.0", id, error = new { code, message } }, Json, statusCode: StatusCodes.Status200OK);

    private static JsonElement EmptyObject() => JsonSerializer.SerializeToElement(new { }, Json);
}

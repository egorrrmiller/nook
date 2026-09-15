using System.Text.Json;
using Nook.Application.Integrations.Notion;

namespace Nook.Api.Notion;

public sealed class NotionVersionMiddleware(RequestDelegate next, INotionVersionProfileResolver versions)
{
    public const string ItemKey = "nook.notion.version-profile";

    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments("/v1"))
        {
            await next(context);
            return;
        }

        var resolution = versions.Resolve(context.Request.Headers["Notion-Version"].FirstOrDefault());
        if (!resolution.IsValid)
        {
            await WriteErrorAsync(context, resolution.ErrorCode == "missing_version" ? 400 : 400,
                resolution.ErrorCode ?? "invalid_request",
                resolution.ErrorCode == "missing_version" ? "Notion-Version header is required." : "The Notion-Version header is not supported.");
            return;
        }

        context.Items[ItemKey] = resolution.Profile!;
        await next(context);
    }

    public static NotionVersionProfile Profile(HttpContext context) =>
        context.Items.TryGetValue(ItemKey, out var profile) && profile is NotionVersionProfile value
            ? value
            : throw new InvalidOperationException("Notion-Version profile was not initialized.");

    internal static async Task WriteErrorAsync(HttpContext context, int status, string code, string message)
    {
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json";
        var body = new NotionErrorResponse
        {
            Status = status,
            Code = code,
            Message = message,
            RequestId = context.TraceIdentifier,
        };
        await JsonSerializer.SerializeAsync(context.Response.Body, body, cancellationToken: context.RequestAborted);
    }
}

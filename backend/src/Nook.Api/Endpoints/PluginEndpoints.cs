using System.Text.Json;
using Nook.Api.Auth;
using Nook.Application.Plugins;
using Nook.Plugins.Sdk;
using Nook.Plugins.Sdk.Hosting;

namespace Nook.Api.Endpoints;

/// <summary>Authenticated plugin catalog, settings and automation endpoints.</summary>
public static class PluginEndpoints
{
    public static RouteGroupBuilder MapPluginEndpoints(this RouteGroupBuilder api)
    {
        var plugins = api.MapGroup("/plugins").WithTags("Plugins");

        plugins.MapGet("/", (PluginSettingsService service) => Results.Ok(service.ListPlugins()))
            .WithName("ListPlugins")
            .WithDescription("Lists optional SDK extensions compiled into this distribution and their settings schemas.");

        plugins.MapGet("/actions", (IAutomationActionRegistry registry) => Results.Ok(registry.Descriptors))
            .WithName("ListAutomationActions");

        plugins.MapGet("/triggers", () => Results.Ok(AutomationService.Triggers))
            .WithName("ListAutomationTriggers");

        var settings = plugins.MapGroup("/{id}/settings").AddEndpointFilter<WorkspaceContextFilter>();
        settings.MapGet("/schema", (string id, PluginSettingsService service) => Results.Ok(service.GetSchema(id)))
            .WithName("GetPluginSettingsSchema");
        settings.MapGet("/", async (string id, PluginSettingsService service, CancellationToken ct) =>
                Results.Ok(await service.GetAsync(id, ct)))
            .WithName("GetPluginSettings");
        settings.MapPut("/", async (string id, JsonElement value, PluginSettingsService service, CancellationToken ct) =>
            {
                await service.PutAsync(id, value, ct);
                return Results.Ok(value);
            })
            .WithName("PutPluginSettings");

        var automations = plugins.MapGroup("/automations").AddEndpointFilter<WorkspaceContextFilter>();
        automations.MapGet("/", async (AutomationService service, CancellationToken ct) =>
                Results.Ok(await service.ListAsync(ct)))
            .WithName("ListAutomations");
        automations.MapGet("/{id:guid}", async (Guid id, AutomationService service, CancellationToken ct) =>
                Results.Ok(await service.GetAsync(id, ct)))
            .WithName("GetAutomation");
        automations.MapPost("/", async (CreateAutomationRequest request, AutomationService service, CancellationToken ct) =>
                Results.Created("/api/plugins/automations", await service.CreateAsync(request, ct)))
            .WithName("CreateAutomation");
        automations.MapPatch("/{id:guid}", async (Guid id, UpdateAutomationRequest request, AutomationService service, CancellationToken ct) =>
                Results.Ok(await service.UpdateAsync(id, request, ct)))
            .WithName("UpdateAutomation");
        automations.MapDelete("/{id:guid}", async (Guid id, AutomationService service, CancellationToken ct) =>
            {
                await service.DeleteAsync(id, ct);
                return Results.NoContent();
            })
            .WithName("DeleteAutomation");
        automations.MapPost("/{id:guid}/run", async (Guid id, ExecuteAutomationRequest? request, AutomationService service, CancellationToken ct) =>
                Results.Ok(await service.RunAsync(id, request ?? new ExecuteAutomationRequest(null, EmptyObject(), null), ct)))
            .WithName("RunAutomation")
            .WithDescription("Button blocks use this endpoint after the workspace context has been resolved.");

        return api;
    }

    /// <summary>Secret-authenticated inbound webhook. It intentionally sits outside the authenticated API group.</summary>
    public static IEndpointRouteBuilder MapPluginWebhookEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/plugins/webhooks/{workspaceId:guid}/{automationId:guid}",
                async (Guid workspaceId, Guid automationId, HttpContext http, JsonElement payload, AutomationService service, CancellationToken ct) =>
                {
                    if (http.Request.ContentLength > AutomationConstants.MaxWebhookBodyBytes)
                        return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
                    var secret = http.Request.Headers["X-Nook-Webhook-Secret"].ToString();
                    var idempotency = http.Request.Headers["Idempotency-Key"].ToString();
                    var run = await service.RunWebhookAsync(workspaceId, automationId, secret, payload, idempotency, ct);
                    return Results.Ok(run);
                })
            .AllowAnonymous()
            .WithTags("Plugins")
            .WithName("InvokeAutomationWebhook")
            .WithDescription("Requires X-Nook-Webhook-Secret. The secret is never persisted in plaintext.");
        return app;
    }

    private static JsonElement EmptyObject() => JsonSerializer.SerializeToElement(new { });
}

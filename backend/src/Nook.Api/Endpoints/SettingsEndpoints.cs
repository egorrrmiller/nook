using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Application.Settings;

namespace Nook.Api.Endpoints;

/// <summary>Contracts §7.5: per-user (<c>/me/settings</c>) and per-workspace (<c>/workspaces/{id}/settings</c>) JSON settings.</summary>
public static class SettingsEndpoints
{
    public static RouteGroupBuilder MapSettingsEndpoints(this RouteGroupBuilder api)
    {
        var me = api.MapGroup("/me/settings").WithTags("Settings");

        me.MapGet("/", async Task<Ok<Dictionary<string, JsonElement>>> (SettingsService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetUserSettingsAsync(ct)))
            .WithName("GetUserSettings");

        me.MapPut("/{key}", async Task<NoContent> (string key, PutSettingRequest request, SettingsService service, CancellationToken ct) =>
            {
                await service.PutUserSettingAsync(key, request.Value, ct);
                return TypedResults.NoContent();
            })
            .WithName("PutUserSetting")
            .WithDescription("`value` is any JSON (≤ 16 KB).");

        var ws = api.MapGroup("/workspaces/{id:guid}/settings").WithTags("Settings");

        ws.MapGet("/", async Task<Ok<Dictionary<string, JsonElement>>> (Guid id, SettingsService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetWorkspaceSettingsAsync(id, ct)))
            .WithName("GetWorkspaceSettings")
            .WithDescription("Members read.");

        ws.MapPut("/{key}", async Task<NoContent> (Guid id, string key, PutSettingRequest request, SettingsService service, CancellationToken ct) =>
            {
                await service.PutWorkspaceSettingAsync(id, key, request.Value, ct);
                return TypedResults.NoContent();
            })
            .WithName("PutWorkspaceSetting")
            .WithDescription("Owner writes. `trash.retentionDays` (integer 1..3650, default 30) drives the hourly `trash-purge` job.");

        return api;
    }
}

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Nook.Application.Common;
using Nook.Plugins.Sdk;

namespace Nook.Plugin.Ai;

/// <summary>
/// Self-hosted AI writing vertical slice. It exposes preview generation only; the editor applies the returned full
/// block snapshots through its own collaboration transaction, so the plugin never overwrites the document blindly.
/// </summary>
public sealed class AiPlugin : IPlugin
{
    public string Id => AiPluginConstants.PluginId;
    public string Name => "AI writing";

    public void ConfigureServices(IServiceCollection services, IConfiguration configuration)
    {
        // Providers are external adapters. This package owns the provider-neutral workflow, not a provider catalog.
        services.AddSingleton<IAiProviderRegistry, AiProviderRegistry>();
        services.AddSingleton<AiRateLimiter>();
        services.AddScoped<IAiSettingsStore, PluginStateAiSettingsStore>();
        services.AddScoped<IAiSecretStore, PluginStateAiSecretStore>();
        services.AddScoped<AiConfigurationService>();
        services.AddScoped<IAiConfigurationReader>(sp => sp.GetRequiredService<AiConfigurationService>());
        services.AddScoped<AiProviderSelector>();
        services.AddScoped<AiWritingService>();
    }

    public void MapEndpoints(RouteGroupBuilder group)
    {
        group.MapGet("/settings", async (AiConfigurationService config, ICurrentUser user, CancellationToken ct) =>
        {
            RequireOwner(user);
            return Results.Ok(await config.GetAsync(ct));
        }).WithName("AiGetSettings");

        group.MapPut("/settings", async (AiSettingsRequest request, AiConfigurationService config, ICurrentUser user, CancellationToken ct) =>
        {
            RequireOwner(user);
            await config.SaveAsync(request, ct);
            return Results.Ok(await config.GetAsync(ct));
        }).WithName("AiSaveSettings");

        group.MapPost("/preview", async (AiPreviewRequest request, AiWritingService service, CancellationToken ct) =>
            Results.Ok(await service.PreviewAsync(request, ct)))
            .WithName("AiPreview");
    }

    public PluginSettingsSchema? SettingsSchema => new("""
        {"type":"object","properties":{"provider":{"type":"string","description":"Free-form id of an externally installed provider adapter"},"model":{"type":"string"},"endpoint":{"type":"string","description":"Optional provider endpoint, interpreted by the adapter"},"apiKey":{"type":"string","writeOnly":true}},"additionalProperties":false}
        """);

    private static void RequireOwner(ICurrentUser user)
    {
        if (!user.IsInstanceOwner) throw new ForbiddenException("Only the instance owner can change AI provider settings.");
    }
}

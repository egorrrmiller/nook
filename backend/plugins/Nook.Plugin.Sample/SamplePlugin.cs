using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Nook.Plugins.Sdk;
using Nook.Plugins.Sdk.Events;

namespace Nook.Plugin.Sample;

/// <summary>Proves the plugin wiring: one endpoint, one block type, one event handler, one recurring job.</summary>
public sealed class SamplePlugin : IPlugin
{
    public string Id => "sample";
    public string Name => "Sample plugin";

    public void ConfigureServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<IBlockTypeDefinition, CalloutBlockDefinition>();
        services.AddScoped<IEventHandler<DocumentChanged>, LogDocumentChangedHandler>();
    }

    public void MapEndpoints(RouteGroupBuilder group)
    {
        group.MapGet("/ping", () => Results.Ok(new { pong = true, plugin = Id, at = DateTimeOffset.UtcNow }))
            .WithName("SamplePing");
    }

    public void RegisterJobs(IPluginJobRegistry jobs) =>
        jobs.AddRecurring("heartbeat", "0 * * * *", (sp, _) =>
        {
            sp.GetRequiredService<ILoggerFactory>().CreateLogger("Nook.Plugin.Sample").LogInformation("Sample plugin heartbeat");
            return Task.CompletedTask;
        });

    public PluginSettingsSchema? SettingsSchema => new("""{"type":"object","properties":{"greeting":{"type":"string","default":"hi"}}}""");
}

/// <summary>Custom block "callout": text lives in <c>props.text</c> instead of <c>content</c>.</summary>
public sealed class CalloutBlockDefinition : IBlockTypeDefinition
{
    public string TypeName => "callout";

    public string ExtractText(JsonElement block)
    {
        if (block.TryGetProperty("props", out var props) && props.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String)
            return t.GetString() ?? "";
        return "";
    }
}

public sealed class LogDocumentChangedHandler(ILogger<LogDocumentChangedHandler> logger) : IEventHandler<DocumentChanged>
{
    public Task HandleAsync(DocumentChanged @event, CancellationToken cancellationToken)
    {
        logger.LogDebug("Sample plugin saw DocumentChanged for node {NodeId} v{Version}", @event.NodeId, @event.Version);
        return Task.CompletedTask;
    }
}

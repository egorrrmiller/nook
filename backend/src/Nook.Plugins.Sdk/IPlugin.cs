using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Nook.Plugins.Sdk;

/// <summary>
/// Optional backend extension for a custom Nook distribution. The base self-hosted application does not discover or
/// load implementations at runtime; external integrations communicate through the public HTTP/MCP contracts instead.
/// </summary>
public interface IPlugin
{
    /// <summary>Stable identifier, url-safe (<c>[a-z0-9-]+</c>). Endpoints are mounted at <c>/api/plugins/{Id}</c>.</summary>
    string Id { get; }

    string Name { get; }

    /// <summary>Register services, block/property type definitions, event handlers, importers, etc.</summary>
    void ConfigureServices(IServiceCollection services, IConfiguration configuration);

    /// <summary>Map Minimal-API endpoints. <paramref name="group"/> is already prefixed with <c>/api/plugins/{Id}</c> and requires authentication.</summary>
    void MapEndpoints(RouteGroupBuilder group);

    /// <summary>Register recurring background jobs; the host schedules them through Hangfire (queue <c>plugins</c>).</summary>
    void RegisterJobs(IPluginJobRegistry jobs)
    {
    }

    /// <summary>Optional settings schema; the frontend renders a settings form from it.</summary>
    PluginSettingsSchema? SettingsSchema => null;
}

/// <summary>A recurring job. <see cref="Cron"/> uses standard 5-field cron syntax (UTC).</summary>
public sealed record PluginJob(string Id, string Cron, Func<IServiceProvider, CancellationToken, Task> Run);

/// <summary>Collects the recurring jobs a plugin wants scheduled (see <see cref="IPlugin.RegisterJobs"/>).</summary>
public interface IPluginJobRegistry
{
    /// <summary>Schedules <paramref name="run"/> on <paramref name="cron"/>. <paramref name="id"/> must be unique within the plugin.</summary>
    void AddRecurring(string id, string cron, Func<IServiceProvider, CancellationToken, Task> run);
}

/// <summary>JSON Schema (draft 2020-12) describing the plugin's settings object.</summary>
public sealed record PluginSettingsSchema(string JsonSchema);

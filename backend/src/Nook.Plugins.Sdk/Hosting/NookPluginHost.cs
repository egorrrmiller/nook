using System.Reflection;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Nook.Plugins.Sdk.Hosting;

/// <summary>Host-side helpers that discover and wire <see cref="IPlugin"/> implementations.</summary>
public static class NookPluginHost
{
    /// <summary>
    /// Discovers every public, non-abstract <see cref="IPlugin"/> in <paramref name="assemblies"/>, registers it as a singleton
    /// and calls <see cref="IPlugin.ConfigureServices"/>.
    /// </summary>
    public static IServiceCollection AddNookPlugins(this IServiceCollection services, IConfiguration configuration, params Assembly[] assemblies)
    {
        var plugins = new List<IPlugin>();
        foreach (var assembly in assemblies.Distinct())
        {
            Type[] types;
            try
            {
                types = assembly.GetExportedTypes();
            }
            catch (ReflectionTypeLoadException e)
            {
                types = e.Types.Where(t => t is not null).Cast<Type>().ToArray();
            }

            foreach (var type in types)
            {
                if (type.IsAbstract || type.IsInterface || !typeof(IPlugin).IsAssignableFrom(type)) continue;
                if (type.GetConstructor(Type.EmptyTypes) is null)
                    throw new InvalidOperationException($"Plugin {type.FullName} must have a public parameterless constructor.");
                plugins.Add((IPlugin)Activator.CreateInstance(type)!);
            }
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var plugin in plugins.OrderBy(p => p.Id, StringComparer.Ordinal))
        {
            if (!IsValidId(plugin.Id))
                throw new InvalidOperationException($"Plugin {plugin.GetType().FullName} has invalid Id '{plugin.Id}' (expected [a-z0-9-]+).");
            if (!seen.Add(plugin.Id))
                throw new InvalidOperationException($"Duplicate plugin id '{plugin.Id}'.");

            services.AddSingleton(plugin);
            plugin.ConfigureServices(services, configuration);
        }

        services.TryAddSingleton<PluginRegistry>(sp => new PluginRegistry(sp.GetServices<IPlugin>().ToArray()));
        return services;
    }

    /// <summary>Maps every plugin's endpoints under <paramref name="apiGroup"/><c>/plugins/{id}</c>.</summary>
    public static IEndpointRouteBuilder MapNookPlugins(this RouteGroupBuilder apiGroup, IServiceProvider services)
    {
        var registry = services.GetRequiredService<PluginRegistry>();
        foreach (var plugin in registry.Plugins)
        {
            var group = apiGroup.MapGroup($"/plugins/{plugin.Id}").WithTags($"plugin:{plugin.Id}");
            plugin.MapEndpoints(group);
        }
        return apiGroup;
    }

    private static bool IsValidId(string id) =>
        !string.IsNullOrEmpty(id) && id.All(c => c is >= 'a' and <= 'z' or >= '0' and <= '9' or '-');
}

/// <summary>All registered plugins, in registration order, plus the recurring jobs they registered.</summary>
public sealed class PluginRegistry
{
    private readonly Dictionary<string, IReadOnlyList<PluginJob>> _jobs = new(StringComparer.OrdinalIgnoreCase);

    public PluginRegistry(IReadOnlyList<IPlugin> plugins)
    {
        Plugins = plugins;
        foreach (var plugin in plugins)
        {
            var collector = new JobCollector(plugin.Id);
            plugin.RegisterJobs(collector);
            _jobs[plugin.Id] = collector.Jobs;
        }
    }

    public IReadOnlyList<IPlugin> Plugins { get; }

    public IPlugin? Find(string id) => Plugins.FirstOrDefault(p => string.Equals(p.Id, id, StringComparison.OrdinalIgnoreCase));

    /// <summary>Jobs registered by the plugin with <paramref name="pluginId"/> (empty when unknown).</summary>
    public IReadOnlyList<PluginJob> JobsOf(string pluginId) => _jobs.GetValueOrDefault(pluginId) ?? [];

    private sealed class JobCollector(string pluginId) : IPluginJobRegistry
    {
        private readonly List<PluginJob> _jobs = [];
        public IReadOnlyList<PluginJob> Jobs => _jobs;

        public void AddRecurring(string id, string cron, Func<IServiceProvider, CancellationToken, Task> run)
        {
            if (string.IsNullOrWhiteSpace(id)) throw new ArgumentException("Job id is required.", nameof(id));
            if (string.IsNullOrWhiteSpace(cron)) throw new ArgumentException("Cron expression is required.", nameof(cron));
            if (_jobs.Any(j => string.Equals(j.Id, id, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException($"Plugin '{pluginId}' registered job '{id}' twice.");
            _jobs.Add(new PluginJob(id, cron, run));
        }
    }
}

using Hangfire;
using Hangfire.Dashboard;
using Hangfire.PostgreSql;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Nook.Infrastructure.Auth;
using Nook.Infrastructure.Persistence;
using Nook.Plugins.Sdk.Hosting;

namespace Nook.Infrastructure.Jobs;

public static class HangfireSetup
{
    public const string SchemaName = "hangfire";

    public static IServiceCollection AddNookHangfire(this IServiceCollection services, string connectionString)
    {
        services.AddHangfire(cfg => cfg
            .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(
                o => o.UseNpgsqlConnection(connectionString),
                new PostgreSqlStorageOptions { SchemaName = SchemaName, PrepareSchemaIfNecessary = true }));
        services.AddHangfireServer(o =>
        {
            o.WorkerCount = Math.Max(2, Environment.ProcessorCount / 2);
            o.Queues = ["default", "plugins", "imports", "files"];
        });
        services.AddScoped<PluginJobRunner>();
        services.AddScoped<MaintenanceJobs>();
        services.AddSingleton<ImportJobRunner>();
        return services;
    }

    /// <summary>Registers recurring jobs: outbox cleanup and every plugin's <c>Jobs</c>.</summary>
    public static void RegisterRecurringJobs(IServiceProvider services)
    {
        var recurring = services.GetRequiredService<IRecurringJobManager>();
        recurring.AddOrUpdate<MaintenanceJobs>("outbox-cleanup", j => j.CleanupOutboxAsync(CancellationToken.None), Cron.Daily());

        var registry = services.GetRequiredService<PluginRegistry>();
        foreach (var plugin in registry.Plugins)
        {
            foreach (var job in registry.JobsOf(plugin.Id))
            {
                recurring.AddOrUpdate<PluginJobRunner>(
                    $"plugin:{plugin.Id}:{job.Id}",
                    r => r.RunAsync(plugin.Id, job.Id, CancellationToken.None),
                    job.Cron,
                    new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
            }
        }
    }
}

/// <summary>Only the instance owner may open <c>/hangfire</c>.</summary>
public sealed class OwnerOnlyDashboardFilter : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context)
    {
        var http = context.GetHttpContext();
        return http.User.Identity?.IsAuthenticated == true && NookClaims.IsInstanceOwner(http.User);
    }
}

public sealed class PluginJobRunner(PluginRegistry registry, IServiceProvider services, ILogger<PluginJobRunner> logger)
{
    [Queue("plugins")]
    public async Task RunAsync(string pluginId, string jobId, CancellationToken ct)
    {
        var plugin = registry.Find(pluginId);
        var job = registry.JobsOf(pluginId).FirstOrDefault(j => j.Id == jobId);
        if (plugin is null || job is null)
        {
            logger.LogWarning("Plugin job {PluginId}/{JobId} not found; skipping", pluginId, jobId);
            return;
        }
        await job.Run(services, ct);
    }
}

public sealed class MaintenanceJobs(AppDbContext db)
{
    public Task<int> CleanupOutboxAsync(CancellationToken ct)
    {
        var cutoff = DateTimeOffset.UtcNow.AddDays(-7);
        return db.EventsOutbox.Where(e => e.DispatchedAt != null && e.DispatchedAt < cutoff).ExecuteDeleteAsync(ct);
    }
}

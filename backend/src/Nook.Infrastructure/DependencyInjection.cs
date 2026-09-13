using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Nook.Application.Collab;
using Nook.Application.Common;
using Nook.Infrastructure.Auth;
using Nook.Infrastructure.Collab;
using Nook.Infrastructure.Jobs;
using Nook.Infrastructure.Persistence;
using Nook.Infrastructure.Realtime;

namespace Nook.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddNookInfrastructure(
        this IServiceCollection services,
        string connectionString,
        bool enableBackgroundJobs,
        IEnumerable<Assembly> pluginAssemblies,
        CollabClientOptions? collab = null)
    {
        services.AddDbContext<AppDbContext>(o => DbContextConfiguration.Configure(o, connectionString));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddSingleton<IPasswordHasher, PasswordHasherAdapter>();

        services.AddSingleton<PresenceTracker>();
        services.AddSingleton<IRealtimeNotifier, SignalRRealtimeNotifier>();

        services.AddSingleton(new EventTypeRegistry(pluginAssemblies));
        services.AddSingleton<OutboxDispatcher>();
        if (enableBackgroundJobs)
        {
            services.AddHostedService<OutboxPollingService>();
            services.AddNookHangfire(connectionString);
        }

        services.AddCollabClient(collab ?? new CollabClientOptions(CollabClientOptions.DefaultBaseUrl, InternalToken: ""));
        return services;
    }

    /// <summary>
    /// Registers <see cref="ICollabClient"/> (contracts §3 "Server-side edits") as <see cref="CollabHttpClient"/> on the
    /// named <see cref="IHttpClientFactory"/> client <see cref="CollabHttpClient.ClientName"/>: base URL from
    /// <see cref="CollabClientOptions.BaseUrl"/>, <c>X-Internal-Token</c> preset, 30 s timeout by default.
    /// </summary>
    public static IServiceCollection AddCollabClient(this IServiceCollection services, CollabClientOptions options)
    {
        services.AddSingleton(options);
        services.AddHttpClient(CollabHttpClient.ClientName, client =>
        {
            client.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/", UriKind.Absolute);
            client.Timeout = options.Timeout ?? CollabClientOptions.DefaultTimeout;
            if (!string.IsNullOrEmpty(options.InternalToken))
                client.DefaultRequestHeaders.Add(CollabHttpClient.TokenHeader, options.InternalToken);
        });
        services.AddScoped<ICollabClient, CollabHttpClient>();
        return services;
    }
}

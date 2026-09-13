using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Nook.Application.Common;
using Nook.Infrastructure.Auth;
using Nook.Infrastructure.Jobs;
using Nook.Infrastructure.Persistence;
using Nook.Infrastructure.Realtime;

namespace Nook.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddNookInfrastructure(this IServiceCollection services, string connectionString, bool enableBackgroundJobs, IEnumerable<Assembly> pluginAssemblies)
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
        return services;
    }
}

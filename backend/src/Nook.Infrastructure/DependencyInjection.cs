using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Nook.Application.Common;
using Nook.Application.Files;
using Nook.Infrastructure.Auth;
using Nook.Infrastructure.Files;
using Nook.Infrastructure.Files.Extractors;
using Nook.Infrastructure.Http;
using Nook.Infrastructure.Jobs;
using Nook.Infrastructure.Persistence;
using Nook.Infrastructure.Realtime;
using Nook.Plugins.Sdk;

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

    /// <summary>Blob store, image processing, text extractors and the SSRF-guarded HTTP client (contracts §8).</summary>
    public static IServiceCollection AddNookFiles(this IServiceCollection services, string dataDir, long maxUploadBytes)
    {
        services.AddSingleton(new FilesOptions(maxUploadBytes));
        services.AddSingleton<DiskBlobStore>(_ => new DiskBlobStore(dataDir));
        services.AddSingleton<IBlobStore>(sp => sp.GetRequiredService<DiskBlobStore>());
        services.AddSingleton<IImageProcessor, NetVipsImageProcessor>();
        services.AddSingleton<IFileTextExtractor, PdfTextExtractor>();
        services.AddSingleton<IFileTextExtractor, DocxTextExtractor>();
        services.AddSingleton<IFileTextExtractor, PlainTextExtractor>();
        services.AddSafeHttpClient();
        return services;
    }
}

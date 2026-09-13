using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Nook.Application.Auth;
using Nook.Application.Collab;
using Nook.Application.Common;
using Nook.Application.Documents;
using Nook.Application.Files;
using Nook.Application.Favorites;
using Nook.Application.Nodes;
using Nook.Application.Recents;
using Nook.Application.Search;
using Nook.Application.Settings;
using Nook.Application.Trash;
using Nook.Application.Workspaces;

namespace Nook.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddNookApplication(this IServiceCollection services)
    {
        services.TryAddSingleton<IClock, SystemClock>();
        services.TryAddSingleton<IRealtimeNotifier, NullRealtimeNotifier>();
        services.AddScoped<IOutbox, OutboxWriter>();
        services.AddScoped<IWorkspaceContextAccessor, WorkspaceContextAccessor>();
        services.AddScoped<WorkspaceContextResolver>();
        services.AddScoped<WorkspaceService>();
        services.AddScoped<AuthService>();
        services.AddScoped<NodeAccess>();
        services.AddScoped<NodeService>();
        services.AddScoped<CollabTokenService>();
        services.AddScoped<DocumentStoreService>();
        services.AddScoped<FileService>();
        services.AddScoped<LinkPreviewService>();
        services.TryAddSingleton<IFileJobs, NullFileJobs>();
        // --- wave1: tree ---
        services.AddScoped<TreeQueries>();
        services.AddScoped<NodeDuplicateService>();
        services.AddScoped<TrashService>();
        services.AddScoped<TrashRetentionService>();
        services.AddScoped<FavoriteService>();
        services.AddScoped<RecentService>();
        services.AddScoped<QuickFindService>();
        services.AddScoped<SettingsService>();
        return services;
    }
}

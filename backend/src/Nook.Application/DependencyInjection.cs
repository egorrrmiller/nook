using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.DependencyInjection;
using Nook.Application.Auth;
using Nook.Application.Collab;
using Nook.Application.Collections;
using Nook.Application.Common;
using Nook.Application.Documents;
using Nook.Application.Export;
using Nook.Application.Favorites;
using Nook.Application.Files;
using Nook.Application.Graph;
using Nook.Application.History;
using Nook.Application.Import;
using Nook.Application.Integrations.Notion;
using Nook.Application.Knowledge;
using Nook.Application.Links;
using Nook.Application.Nodes;
using Nook.Application.Plugins;
using Nook.Application.Properties;
using Nook.Application.Recents;
using Nook.Application.Search;
using Nook.Application.Settings;
using Nook.Application.Tags;
using Nook.Application.Trash;
using Nook.Application.Workspaces;
using Nook.Plugins.Sdk;

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
        services.AddScoped<CollectionService>();
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

        // --- wave1: knowledge (contracts §9) ---
        services.TryAddSingleton<DataDirectory>();
        services.AddScoped<NodeVisibility>();
        services.AddScoped<BreadcrumbService>();
        services.AddScoped<LinkService>();
        services.AddScoped<TagService>();
        services.AddScoped<PropertyService>();
        services.AddScoped<AliasService>();
        services.AddScoped<SearchService>();
        services.AddScoped<GraphService>();
        services.AddScoped<HistoryService>();
        services.AddScoped<BlobReader>();
        services.AddScoped<ZipExportWriter>();
        services.AddScoped<ExportService>();
        services.AddScoped<ImportWriter>();
        services.AddScoped<ImportService>();
        // Notion-compatible read-only facade. Native /api authentication and workspace context stay separate.
        services.AddScoped<INotionTokenResolver, NotionTokenResolver>();
        services.AddScoped<INotionGrantPolicy, NotionGrantPolicy>();
        services.AddScoped<NotionCompatibilityService>();
        services.AddScoped<NotionWriteService>();
        services.AddSingleton<INotionCapabilityPolicy, NotionCapabilityPolicy>();
        services.AddSingleton<INotionCursorCodec, NotionCursorCodec>();
        services.AddSingleton<INotionVersionProfileResolver, NotionVersionProfileResolver>();
        // --- wave2: plugins / automation core --------------------------------------------------------------------
        services.AddScoped<AutomationService>();
        services.AddScoped<PluginSettingsService>();
        services.AddScoped<McpToolService>();
        services.TryAddScoped<ICollectionQueryPort, CollectionsQueryPort>();
        services.AddSingleton<IAutomationAction, UpdatePropertiesAutomationAction>();
        services.AddSingleton<IAutomationAction, AddPageAutomationAction>();
        services.AddSingleton<IAutomationAction, InsertBlocksAutomationAction>();
        services.AddSingleton<IExporter, MarkdownExporter>();
        services.AddSingleton<IExporter, HtmlExporter>();
        services.AddSingleton<IImporter, MarkdownImporter>();
        services.AddSingleton<IImporter, HtmlImporter>();
        services.AddSingleton<IImporter, CsvImporter>();
        services.AddSingleton<IImporter, ZipImporter>();
        return services;
    }
}

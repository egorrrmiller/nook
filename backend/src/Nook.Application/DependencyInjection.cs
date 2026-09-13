using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Nook.Application.Auth;
using Nook.Application.Collab;
using Nook.Application.Common;
using Nook.Application.Documents;
using Nook.Application.Export;
using Nook.Application.Graph;
using Nook.Application.History;
using Nook.Application.Import;
using Nook.Application.Knowledge;
using Nook.Application.Links;
using Nook.Application.Nodes;
using Nook.Application.Properties;
using Nook.Application.Search;
using Nook.Application.Tags;
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
        services.AddScoped<CollabTokenService>();
        services.AddScoped<DocumentStoreService>();

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
        services.AddSingleton<IExporter, MarkdownExporter>();
        services.AddSingleton<IExporter, HtmlExporter>();
        services.AddSingleton<IImporter, MarkdownImporter>();
        services.AddSingleton<IImporter, HtmlImporter>();
        services.AddSingleton<IImporter, CsvImporter>();
        services.AddSingleton<IImporter, ZipImporter>();
        return services;
    }
}

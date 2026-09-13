using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Nook.Infrastructure.Persistence;

/// <summary>Design-time factory for <c>dotnet ef</c>. Reads <c>NOOK_DB</c> from the environment or a <c>.env</c> file up the tree.</summary>
public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public const string DefaultConnectionString = "Host=127.0.0.1;Port=5432;Database=nook;Username=postgres;Password=123";

    public AppDbContext CreateDbContext(string[] args)
    {
        EnvFile.LoadFromAncestors(Directory.GetCurrentDirectory());
        var connectionString = Environment.GetEnvironmentVariable("NOOK_DB") ?? DefaultConnectionString;
        var options = new DbContextOptionsBuilder<AppDbContext>();
        DbContextConfiguration.Configure(options, connectionString);
        return new AppDbContext(options.Options);
    }
}

public static class DbContextConfiguration
{
    public static void Configure(DbContextOptionsBuilder options, string connectionString)
    {
        options.UseNpgsql(connectionString, npgsql =>
        {
            npgsql.MapEnum<Domain.Enums.WorkspaceRole>("workspace_role");
            npgsql.MapEnum<Domain.Enums.NodeKind>("node_kind");
            npgsql.MapEnum<Domain.Enums.LinkKind>("link_kind");
            npgsql.MigrationsAssembly(typeof(AppDbContext).Assembly.GetName().Name);
            npgsql.MigrationsHistoryTable("__ef_migrations_history");
        });
        options.UseSnakeCaseNamingConvention();
    }
}

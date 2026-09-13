using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Nook.Application.Collab;
using Npgsql;

namespace Nook.IntegrationTests;

/// <summary>
/// One API host per test class, backed by a freshly created database <c>nook_test_&lt;id&gt;</c>
/// (created through the <c>postgres</c> maintenance DB, migrated on startup, dropped on dispose).
/// </summary>
public sealed class NookApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string OwnerEmail = "owner@test.local";
    public const string OwnerPassword = "owner-pass-123";
    public const string InternalToken = "test-internal-token";
    public const string CollabJwtSecret = "test-collab-secret-0123456789";

    /// <summary>In-memory stand-in for the collab internal API; inspect it to assert on server-side edits.</summary>
    public FakeCollabClient CollabClient { get; } = new();

    public string DatabaseName { get; } = "nook_test_" + Guid.NewGuid().ToString("N")[..12];
    public string ConnectionString { get; }
    private readonly string _maintenanceConnectionString;
    private readonly string _dataDir = Path.Combine(Path.GetTempPath(), "nook-tests", Guid.NewGuid().ToString("N"));

    public NookApiFactory()
    {
        var baseConn = Environment.GetEnvironmentVariable("NOOK_TEST_DB")
                       ?? "Host=127.0.0.1;Port=5432;Database=nook_test;Username=postgres;Password=123";
        var b = new NpgsqlConnectionStringBuilder(baseConn) { Pooling = false };
        b.Database = "postgres";
        _maintenanceConnectionString = b.ConnectionString;
        b.Database = DatabaseName;
        b.Pooling = true;
        ConnectionString = b.ConnectionString;
    }

    public async Task InitializeAsync()
    {
        await using var conn = new NpgsqlConnection(_maintenanceConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand($"CREATE DATABASE \"{DatabaseName}\"", conn);
        await cmd.ExecuteNonQueryAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        // UseSetting values reach WebApplication.CreateBuilder as startup arguments, so Program.cs sees them
        // immediately (ConfigureAppConfiguration would only apply at Build(), after NookOptions are read).
        var settings = new Dictionary<string, string?>
        {
            ["NOOK_DB"] = ConnectionString,
            ["NOOK_AUTO_MIGRATE"] = "true",
            ["NOOK_BACKGROUND_JOBS"] = "false",
            ["NOOK_OWNER_EMAIL"] = OwnerEmail,
            ["NOOK_OWNER_PASSWORD"] = OwnerPassword,
            ["NOOK_INTERNAL_TOKEN"] = InternalToken,
            ["NOOK_COLLAB_JWT_SECRET"] = CollabJwtSecret,
            ["NOOK_DATA_DIR"] = _dataDir,
            ["NOOK_COLLAB_INTERNAL_URL"] = "http://127.0.0.1:1", // never reached: ICollabClient is replaced below
            ["Serilog:MinimumLevel:Default"] = "Warning",
        };
        foreach (var (key, value) in settings) builder.UseSetting(key, value);

        // No live collab service in tests: swap the HTTP client for the in-memory fake.
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<ICollabClient>();
            services.AddSingleton<ICollabClient>(CollabClient);
        });
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        NpgsqlConnection.ClearAllPools();
        try
        {
            await using var conn = new NpgsqlConnection(_maintenanceConnectionString);
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{DatabaseName}\" WITH (FORCE)", conn);
            await cmd.ExecuteNonQueryAsync();
        }
        catch (Exception)
        {
            // best effort: leaking a test database is annoying but must not fail the run
        }
        try { Directory.Delete(_dataDir, recursive: true); } catch (Exception) { }
    }

    public IServiceScope CreateScope() => Services.CreateScope();
}

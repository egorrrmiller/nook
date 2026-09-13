using Nook.Application.Collab;
using Nook.Infrastructure.Persistence;

namespace Nook.Api.Infrastructure;

/// <summary>Runtime configuration, read from <c>NOOK_*</c> environment variables (see <c>.env.example</c>) or <c>appsettings.json</c> (<c>Nook:*</c>).</summary>
public sealed record NookOptions(
    string Db,
    string DataDir,
    string? OwnerEmail,
    string? OwnerPassword,
    string CollabJwtSecret,
    string CollabWsUrl,
    string CollabInternalUrl,
    string InternalToken,
    string? PublicUrl,
    bool AutoMigrate,
    bool BackgroundJobs,
    string CookieName)
{
    public static NookOptions Load(IConfiguration config, IHostEnvironment env)
    {
        string? Get(string envKey, string settingsKey) => config[envKey] ?? config[$"Nook:{settingsKey}"];

        var db = Get("NOOK_DB", "Db") ?? config.GetConnectionString("Nook") ?? AppDbContextFactory.DefaultConnectionString;
        var autoMigrate = ParseBool(Get("NOOK_AUTO_MIGRATE", "AutoMigrate")) ?? env.IsDevelopment();
        var jobs = ParseBool(Get("NOOK_BACKGROUND_JOBS", "BackgroundJobs")) ?? true;
        return new NookOptions(
            Db: db,
            DataDir: Get("NOOK_DATA_DIR", "DataDir") ?? "./data",
            OwnerEmail: Get("NOOK_OWNER_EMAIL", "OwnerEmail"),
            OwnerPassword: Get("NOOK_OWNER_PASSWORD", "OwnerPassword"),
            CollabJwtSecret: Get("NOOK_COLLAB_JWT_SECRET", "CollabJwtSecret") ?? "",
            CollabWsUrl: Get("NOOK_COLLAB_WS_URL", "CollabWsUrl") ?? "/collab",
            CollabInternalUrl: Get("NOOK_COLLAB_INTERNAL_URL", "CollabInternalUrl") ?? CollabClientOptions.DefaultBaseUrl,
            InternalToken: Get("NOOK_INTERNAL_TOKEN", "InternalToken") ?? "",
            PublicUrl: Get("NOOK_PUBLIC_URL", "PublicUrl"),
            AutoMigrate: autoMigrate,
            BackgroundJobs: jobs,
            CookieName: "nook_session");
    }

    private static bool? ParseBool(string? value) => value?.ToLowerInvariant() switch
    {
        "1" or "true" or "yes" or "on" => true,
        "0" or "false" or "no" or "off" => false,
        _ => null,
    };
}

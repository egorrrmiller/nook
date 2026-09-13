using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Nook.Application.Auth;
using Nook.Infrastructure.Persistence;

namespace Nook.Infrastructure.Startup;

public static class DatabaseInitializer
{
    /// <summary>Applies pending migrations (when enabled) and seeds the instance owner if the users table is empty.</summary>
    public static async Task InitializeAsync(IServiceProvider services, bool migrate, string? ownerEmail, string? ownerPassword, CancellationToken ct = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Nook.Startup");

        if (migrate)
        {
            var pending = (await db.Database.GetPendingMigrationsAsync(ct)).ToList();
            if (pending.Count > 0)
            {
                logger.LogInformation("Applying {Count} pending migration(s): {Migrations}", pending.Count, string.Join(", ", pending));
                await db.Database.MigrateAsync(ct);
            }
        }

        if (await db.Users.AnyAsync(ct)) return;
        if (string.IsNullOrWhiteSpace(ownerEmail) || string.IsNullOrWhiteSpace(ownerPassword))
        {
            logger.LogWarning("No users exist and NOOK_OWNER_EMAIL / NOOK_OWNER_PASSWORD are not set; nobody can log in.");
            return;
        }
        if (ownerPassword.Length < AuthService.MinPasswordLength)
        {
            logger.LogError("NOOK_OWNER_PASSWORD must be at least {Min} characters; owner not seeded.", AuthService.MinPasswordLength);
            return;
        }

        var auth = scope.ServiceProvider.GetRequiredService<AuthService>();
        var displayName = ownerEmail.Split('@')[0];
        await auth.CreateUserWithPersonalWorkspaceAsync(ownerEmail, ownerPassword, displayName, isInstanceOwner: true, ct);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded instance owner {Email}", ownerEmail.ToLowerInvariant());
    }
}

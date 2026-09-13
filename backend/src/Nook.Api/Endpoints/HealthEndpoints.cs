using Microsoft.EntityFrameworkCore;
using Nook.Infrastructure.Persistence;

namespace Nook.Api.Endpoints;

public sealed record HealthResponse(string Status, string Version, bool Database, DateTimeOffset Time);

public static class HealthEndpoints
{
    public static RouteGroupBuilder MapHealthEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/health", async (AppDbContext db, CancellationToken ct) =>
            {
                var dbOk = false;
                try
                {
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    timeout.CancelAfter(TimeSpan.FromSeconds(3));
                    dbOk = await db.Database.CanConnectAsync(timeout.Token);
                }
                catch (Exception)
                {
                    dbOk = false;
                }
                var version = typeof(HealthEndpoints).Assembly.GetName().Version?.ToString(3) ?? "0.0.0";
                var body = new HealthResponse(dbOk ? "ok" : "degraded", version, dbOk, DateTimeOffset.UtcNow);
                return dbOk ? Results.Ok(body) : Results.Json(body, statusCode: StatusCodes.Status503ServiceUnavailable);
            })
            .AllowAnonymous()
            .WithTags("Health")
            .WithName("Health")
            .Produces<HealthResponse>()
            .Produces<HealthResponse>(StatusCodes.Status503ServiceUnavailable);
        return api;
    }
}

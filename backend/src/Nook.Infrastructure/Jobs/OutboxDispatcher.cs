using System.Reflection;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Nook.Application.Common;
using Nook.Application.Plugins;
using Nook.Domain.Entities;
using Nook.Infrastructure.Persistence;
using Nook.Plugins.Sdk.Events;

namespace Nook.Infrastructure.Jobs;

/// <summary>
/// Pulls undispatched rows from <c>events_outbox</c> (FOR UPDATE SKIP LOCKED) and invokes every registered
/// <see cref="IEventHandler{TEvent}"/>. Runs from a polling hosted service every few seconds and can also be
/// triggered by Hangfire.
/// </summary>
public sealed class OutboxDispatcher(
    IServiceScopeFactory scopeFactory,
    EventTypeRegistry registry,
    IAutomationEventDispatcher automations,
    ILogger<OutboxDispatcher> logger)
{
    public const int BatchSize = 100;
    public const int MaxAttempts = 5;

    /// <summary>Dispatches one batch; returns the number of rows processed.</summary>
    public async Task<int> DispatchOnceAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var clock = scope.ServiceProvider.GetRequiredService<IClock>();

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var batch = await db.EventsOutbox
            .FromSqlRaw($"SELECT * FROM events_outbox WHERE dispatched_at IS NULL AND attempts < {MaxAttempts} ORDER BY id LIMIT {BatchSize} FOR UPDATE SKIP LOCKED")
            .ToListAsync(ct);
        if (batch.Count == 0) return 0;

        foreach (var row in batch)
        {
            try
            {
                await DispatchRowAsync(scope.ServiceProvider, row, ct);
                row.DispatchedAt = clock.UtcNow;
                row.LastError = null;
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                row.Attempts += 1;
                row.LastError = e.ToString().Length > 4000 ? e.ToString()[..4000] : e.ToString();
                logger.LogWarning(e, "Outbox event {Id} ({Type}) failed (attempt {Attempts})", row.Id, row.Type, row.Attempts);
                if (row.Attempts >= MaxAttempts)
                {
                    row.DispatchedAt = clock.UtcNow; // give up; keep the error for inspection
                    logger.LogError("Outbox event {Id} ({Type}) dropped after {Attempts} attempts", row.Id, row.Type, row.Attempts);
                }
            }
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return batch.Count;
    }

    private async Task DispatchRowAsync(IServiceProvider services, OutboxEvent row, CancellationToken ct)
    {
        var eventType = registry.Resolve(row.Type);
        if (eventType is null)
        {
            logger.LogDebug("No CLR type for outbox event {Type}; skipping", row.Type);
            await automations.DispatchAsync(row.Id, row.Type, row.Payload, ct);
            return;
        }

        var @event = row.Payload.Deserialize(eventType, OutboxWriter.JsonOptions);
        if (@event is null) return;

        var handlerType = typeof(IEventHandler<>).MakeGenericType(eventType);
        var method = handlerType.GetMethod(nameof(IEventHandler<INookEvent>.HandleAsync), BindingFlags.Public | BindingFlags.Instance)!;
        foreach (var handler in services.GetServices(handlerType))
        {
            if (handler is null) continue;
            await (Task)method.Invoke(handler, [@event, ct])!;
        }
        await automations.DispatchAsync(row.Id, row.Type, row.Payload, ct);
    }
}

/// <summary>Polls the outbox every <see cref="Interval"/>.</summary>
public sealed class OutboxPollingService(OutboxDispatcher dispatcher, ILogger<OutboxPollingService> logger) : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(2);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken).ContinueWith(_ => { }, TaskScheduler.Default);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                int processed;
                do
                {
                    processed = await dispatcher.DispatchOnceAsync(stoppingToken);
                }
                while (processed == OutboxDispatcher.BatchSize && !stoppingToken.IsCancellationRequested);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception e)
            {
                logger.LogError(e, "Outbox polling iteration failed");
            }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}

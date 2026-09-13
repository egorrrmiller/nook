using System.Text.Json;
using Nook.Domain.Entities;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Common;

/// <summary>Writes domain events into <c>events_outbox</c> inside the current unit of work.</summary>
public interface IOutbox
{
    void Enqueue<TEvent>(TEvent @event) where TEvent : INookEvent;
}

public sealed class OutboxWriter(IAppDbContext db, IClock clock) : IOutbox
{
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public void Enqueue<TEvent>(TEvent @event) where TEvent : INookEvent
    {
        var payload = JsonSerializer.SerializeToElement(@event, @event.GetType(), JsonOptions);
        db.EventsOutbox.Add(new OutboxEvent
        {
            Type = @event.GetType().Name,
            Payload = payload,
            OccurredAt = clock.UtcNow,
        });
    }
}

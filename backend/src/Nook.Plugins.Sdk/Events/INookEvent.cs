namespace Nook.Plugins.Sdk.Events;

/// <summary>Marker for events that flow through the outbox to <see cref="IEventHandler{TEvent}"/> implementations.</summary>
public interface INookEvent
{
    Guid WorkspaceId { get; }
}

/// <summary>Handles one event type. Register in <c>IPlugin.ConfigureServices</c> as scoped or singleton.</summary>
public interface IEventHandler<in TEvent> where TEvent : INookEvent
{
    Task HandleAsync(TEvent @event, CancellationToken cancellationToken);
}

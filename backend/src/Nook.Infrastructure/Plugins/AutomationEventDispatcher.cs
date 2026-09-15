using System.Text.Json;
using Nook.Application.Plugins;

namespace Nook.Infrastructure.Plugins;

public sealed class AutomationEventDispatcher(AutomationService automations) : IAutomationEventDispatcher
{
    public Task DispatchAsync(long deliveryId, string eventType, JsonElement payload, CancellationToken cancellationToken) =>
        automations.DispatchEventAsync(deliveryId, eventType, payload, cancellationToken);
}

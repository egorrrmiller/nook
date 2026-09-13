using System.Text.Json;

namespace Nook.Plugins.Sdk;

/// <summary>Context passed to automation actions and event handlers.</summary>
public sealed record AutomationContext(Guid WorkspaceId, Guid? UserId, Guid? NodeId, IServiceProvider Services);

/// <summary>
/// An action usable from Button blocks, database automations and bots
/// (e.g. <c>EditProperty</c>, <c>AddPage</c>, <c>SendWebhook</c>).
/// </summary>
public interface IAutomationAction
{
    /// <summary>Stable identifier, e.g. <c>"sample.log"</c>.</summary>
    string Id { get; }

    string DisplayName { get; }

    /// <summary>JSON Schema of <c>parameters</c>. Used to render the configuration UI.</summary>
    string ParametersSchema => "{}";

    Task ExecuteAsync(AutomationContext context, JsonElement parameters, CancellationToken cancellationToken);
}

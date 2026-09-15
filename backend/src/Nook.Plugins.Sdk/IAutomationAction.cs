using System.Text.Json;

namespace Nook.Plugins.Sdk;

/// <summary>Context passed to automation actions and event handlers.</summary>
[Flags]
public enum AutomationActionCapabilities
{
    None = 0,
    Read = 1,
    Write = 2,
    Network = 4,
}

/// <summary>Context passed to an action. <see cref="Input"/> is the webhook/event payload, when one exists.</summary>
public sealed record AutomationContext(
    Guid WorkspaceId,
    Guid? UserId,
    Guid? NodeId,
    IServiceProvider Services,
    JsonElement Input = default,
    string? InvocationId = null);

/// <summary>
/// An action usable from Button blocks, database automations and bots
/// (e.g. <c>EditProperty</c>, <c>AddPage</c>, <c>SendWebhook</c>).
/// </summary>
public interface IAutomationAction
{
    /// <summary>Stable identifier, e.g. <c>"sample.log"</c>.</summary>
    string Id { get; }

    string DisplayName { get; }

    /// <summary>Capabilities used by the action. Network actions are disabled unless an automation explicitly opts in.</summary>
    AutomationActionCapabilities Capabilities => AutomationActionCapabilities.Write;

    /// <summary>JSON Schema of <c>parameters</c>. Used to render the configuration UI.</summary>
    string ParametersSchema => "{}";

    Task ExecuteAsync(AutomationContext context, JsonElement parameters, CancellationToken cancellationToken);
}

/// <summary>One action in a Button block or persisted automation.</summary>
public sealed record ButtonAction(string ActionId, JsonElement Parameters, bool RequiresConfirmation = false);

/// <summary>
/// Server-side contract for the editor's Button block. The frontend may render the button however it likes;
/// execution always goes through the allow-listed action registry.
/// </summary>
public sealed record ButtonBlockContract(
    string Label,
    IReadOnlyList<ButtonAction> Actions,
    bool RequiresConfirmation = false);

public sealed record AutomationActionDescriptor(
    string Id,
    string DisplayName,
    string ParametersSchema,
    AutomationActionCapabilities Capabilities);

/// <summary>Allow-list of executable actions. Unknown ids are never dispatched.</summary>
public interface IAutomationActionRegistry
{
    IReadOnlyList<AutomationActionDescriptor> Descriptors { get; }

    IAutomationAction? Find(string id);
}

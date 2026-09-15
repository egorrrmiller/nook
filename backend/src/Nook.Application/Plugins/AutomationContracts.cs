using System.Text.Json;

namespace Nook.Application.Plugins;

public static class AutomationConstants
{
    public const string StatePluginId = "core.automation";
    public const int MaxActions = 20;
    public const int MaxActionParametersBytes = 64 * 1024;
    public const int MaxWebhookBodyBytes = 256 * 1024;
}

public sealed record AutomationActionRequest(string ActionId, JsonElement Parameters);

public sealed record CreateAutomationRequest(
    string Name,
    string TriggerType,
    string? EventType,
    IReadOnlyList<AutomationActionRequest> Actions,
    bool? Enabled,
    bool? AllowNetwork,
    string? WebhookSecret);

public sealed record UpdateAutomationRequest(
    string? Name,
    string? TriggerType,
    string? EventType,
    IReadOnlyList<AutomationActionRequest>? Actions,
    bool? Enabled,
    bool? AllowNetwork,
    string? WebhookSecret);

public sealed record ExecuteAutomationRequest(Guid? NodeId, JsonElement Input, string? IdempotencyKey);

public sealed record AutomationDefinitionDto(
    Guid Id,
    string Name,
    string TriggerType,
    string? EventType,
    bool Enabled,
    bool AllowNetwork,
    IReadOnlyList<AutomationActionRequest> Actions,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string? WebhookPath);

public sealed record AutomationCreateResponse(AutomationDefinitionDto Automation, string? WebhookSecret);

public sealed record AutomationRunDto(
    Guid Id,
    Guid AutomationId,
    string Status,
    string? IdempotencyKey,
    DateTimeOffset StartedAt,
    DateTimeOffset? FinishedAt,
    string? Error);

public sealed record AutomationTriggerDto(string Id, string Name, string? Description);

/// <summary>Stored shape. It is intentionally not exposed as an API contract so fields can be added compatibly.</summary>
internal sealed record StoredAutomationDefinition(
    Guid Id,
    Guid OwnerUserId,
    string Name,
    string TriggerType,
    string? EventType,
    string? WebhookSecretHash,
    bool Enabled,
    bool AllowNetwork,
    IReadOnlyList<AutomationActionRequest> Actions,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

internal sealed record StoredAutomationRun(
    Guid Id,
    Guid AutomationId,
    string Status,
    string? IdempotencyKey,
    DateTimeOffset StartedAt,
    DateTimeOffset? FinishedAt,
    string? Error);

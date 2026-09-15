using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Nook.Application.Common;
using Nook.Application.Workspaces;
using Nook.Domain.Enums;
using Nook.Plugins.Sdk;

namespace Nook.Application.Plugins;

public interface IAutomationEventDispatcher
{
    Task DispatchAsync(long deliveryId, string eventType, JsonElement payload, CancellationToken cancellationToken);
}

/// <summary>
/// Self-hosted automation runtime. Definitions and idempotency records live in plugin_state; actions are always
/// resolved from the allow-list and are executed in the caller's workspace context.
/// </summary>
public sealed class AutomationService(
    IPluginStateStore state,
    IAutomationActionRegistry actions,
    IWorkspaceContextAccessor contextAccessor,
    WorkspaceContextResolver workspaceResolver,
    IClock clock,
    IServiceProvider services,
    ILogger<AutomationService> logger)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly string[] TriggerTypes = ["manual", "event", "webhook"];

    public static IReadOnlyList<AutomationTriggerDto> Triggers { get; } =
    [
        new("manual", "Manual / Button", "Started by a Button block or an authenticated API call."),
        new("event", "Event", "Started when a core or plugin event is written to the outbox."),
        new("webhook", "Webhook", "Started by a secret-authenticated POST request."),
    ];

    private WorkspaceContext Context => contextAccessor.Required;

    public async Task<IReadOnlyList<AutomationDefinitionDto>> ListAsync(CancellationToken ct)
    {
        var ctx = Context;
        return (await LoadAsync(ctx.WorkspaceId, ct)).Select(ToDto).ToArray();
    }

    public async Task<AutomationDefinitionDto> GetAsync(Guid id, CancellationToken ct)
    {
        var definition = await FindAsync(Context.WorkspaceId, id, ct) ?? throw new NotFoundException("Automation not found.");
        return ToDto(definition);
    }

    public async Task<AutomationCreateResponse> CreateAsync(CreateAutomationRequest request, CancellationToken ct)
    {
        RequireEditor();
        var ctx = Context;
        var now = clock.UtcNow;
        var trigger = ValidateTrigger(request.TriggerType, request.EventType);
        var actionsToStore = ValidateActions(request.Actions);
        var webhookSecret = trigger == "webhook" ? NormaliseOrCreateSecret(request.WebhookSecret) : null;
        var definition = new StoredAutomationDefinition(
            Guid.NewGuid(),
            ctx.UserId,
            NormaliseName(request.Name),
            trigger,
            NormaliseEventType(request.EventType),
            webhookSecret is null ? null : HashSecret(webhookSecret),
            request.Enabled ?? true,
            request.AllowNetwork ?? false,
            actionsToStore,
            now,
            now);

        var definitions = await LoadAsync(ctx.WorkspaceId, ct);
        definitions.Add(definition);
        await SaveAsync(ctx.WorkspaceId, definitions, ct);
        return new AutomationCreateResponse(ToDto(definition), webhookSecret);
    }

    public async Task<AutomationDefinitionDto> UpdateAsync(Guid id, UpdateAutomationRequest request, CancellationToken ct)
    {
        RequireEditor();
        var ctx = Context;
        var definitions = await LoadAsync(ctx.WorkspaceId, ct);
        var index = definitions.FindIndex(a => a.Id == id);
        if (index < 0) throw new NotFoundException("Automation not found.");

        var current = definitions[index];
        var trigger = request.TriggerType is null ? current.TriggerType : ValidateTrigger(request.TriggerType, request.EventType ?? current.EventType);
        var eventType = request.EventType is null ? current.EventType : NormaliseEventType(request.EventType);
        ValidateTrigger(trigger, eventType);
        var actionsToStore = request.Actions is null ? current.Actions : ValidateActions(request.Actions);
        var secret = request.WebhookSecret is null
            ? current.WebhookSecretHash
            : trigger == "webhook" ? HashSecret(RequireSecret(request.WebhookSecret)) : null;
        var updated = current with
        {
            Name = request.Name is null ? current.Name : NormaliseName(request.Name),
            TriggerType = trigger,
            EventType = eventType,
            WebhookSecretHash = secret,
            Enabled = request.Enabled ?? current.Enabled,
            AllowNetwork = request.AllowNetwork ?? current.AllowNetwork,
            Actions = actionsToStore,
            UpdatedAt = clock.UtcNow,
        };
        definitions[index] = updated;
        await SaveAsync(ctx.WorkspaceId, definitions, ct);
        return ToDto(updated);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        RequireEditor();
        var ctx = Context;
        var definitions = await LoadAsync(ctx.WorkspaceId, ct);
        if (definitions.RemoveAll(a => a.Id == id) == 0) throw new NotFoundException("Automation not found.");
        await SaveAsync(ctx.WorkspaceId, definitions, ct);
    }

    /// <summary>Runs a manual/Button invocation in the already resolved workspace context.</summary>
    public Task<AutomationRunDto> RunAsync(Guid id, ExecuteAutomationRequest request, CancellationToken ct)
    {
        var ctx = Context;
        return RunDefinitionAsync(ctx.WorkspaceId, id, request.NodeId, request.Input, ctx.UserId,
            request.IdempotencyKey, fromWebhook: false, secret: null, ct);
    }

    public async Task<AutomationRunDto> RunWebhookAsync(
        Guid workspaceId,
        Guid automationId,
        string? secret,
        JsonElement input,
        string? idempotencyKey,
        CancellationToken ct)
    {
        var definition = await FindAsync(workspaceId, automationId, ct) ?? throw new NotFoundException("Automation not found.");
        if (!definition.Enabled || definition.TriggerType != "webhook" || definition.WebhookSecretHash is null)
            throw new NotFoundException("Webhook not found.");
        if (secret is null || !FixedTimeEquals(definition.WebhookSecretHash, HashSecret(secret)))
            throw new UnauthorizedException("Invalid webhook secret.");

        await EnsureExecutionContextAsync(workspaceId, definition.OwnerUserId, ct);
        var nodeId = TryGetGuid(input, "nodeId") ?? TryGetGuid(input, "node_id");
        return await RunDefinitionAsync(workspaceId, automationId, nodeId, input, definition.OwnerUserId,
            idempotencyKey, fromWebhook: true, secret, ct);
    }

    /// <summary>Called by the outbox dispatcher after normal plugin event handlers.</summary>
    public async Task DispatchEventAsync(long deliveryId, string eventType, JsonElement payload, CancellationToken ct)
    {
        var workspaceId = TryGetGuid(payload, "workspaceId") ?? TryGetGuid(payload, "workspace_id");
        if (workspaceId is null) return;
        var definitions = await LoadAsync(workspaceId.Value, ct);
        foreach (var definition in definitions.Where(a => a.Enabled && a.TriggerType == "event" &&
                     string.Equals(a.EventType, eventType, StringComparison.OrdinalIgnoreCase)))
        {
            await EnsureExecutionContextAsync(workspaceId.Value, definition.OwnerUserId, ct);
            var nodeId = TryGetGuid(payload, "nodeId") ?? TryGetGuid(payload, "node_id");
            var key = $"event:{deliveryId}:{definition.Id:N}";
            await RunDefinitionAsync(workspaceId.Value, definition.Id, nodeId, payload, definition.OwnerUserId,
                key, fromWebhook: false, secret: null, ct);
        }
    }

    private async Task<AutomationRunDto> RunDefinitionAsync(
        Guid workspaceId,
        Guid automationId,
        Guid? nodeId,
        JsonElement input,
        Guid executionUserId,
        string? idempotencyKey,
        bool fromWebhook,
        string? secret,
        CancellationToken ct)
    {
        var definition = await FindAsync(workspaceId, automationId, ct) ?? throw new NotFoundException("Automation not found.");
        if (!definition.Enabled) throw new ConflictException("Automation is disabled.");
        if (fromWebhook && definition.TriggerType != "webhook") throw new NotFoundException("Webhook not found.");
        if (!fromWebhook && definition.TriggerType == "webhook" && secret is null)
            throw new ForbiddenException("Webhook automations must be invoked through their webhook endpoint.");
        if (input.ValueKind == JsonValueKind.Undefined) input = EmptyObject();
        if (input.GetRawText().Length > AutomationConstants.MaxWebhookBodyBytes)
            throw new ValidationException($"Automation input is too large (max {AutomationConstants.MaxWebhookBodyBytes} bytes).");

        var normalisedKey = NormaliseIdempotencyKey(idempotencyKey);
        var run = new StoredAutomationRun(Guid.NewGuid(), automationId, "running", normalisedKey, clock.UtcNow, null, null);
        var stateKey = RunStateKey(workspaceId, automationId, normalisedKey ?? run.Id.ToString("N"));
        if (!await state.TryAddAsync(AutomationConstants.StatePluginId, stateKey, run, ct))
        {
            var previous = await state.GetAsync<StoredAutomationRun>(AutomationConstants.StatePluginId, stateKey, ct);
            if (previous is not null) return ToDto(previous);
            throw new ConflictException("Automation invocation is already being created.");
        }

        try
        {
            await EnsureExecutionContextAsync(workspaceId, executionUserId, ct);
            var actionContext = new AutomationContext(workspaceId, executionUserId, nodeId, services, input.Clone(), run.Id.ToString("N"));
            foreach (var request in definition.Actions)
            {
                var action = actions.Find(request.ActionId);
                if (action is null) throw new ValidationException($"Automation action '{request.ActionId}' is not available.");
                if (!definition.AllowNetwork && action.Capabilities.HasFlag(AutomationActionCapabilities.Network))
                    throw new ForbiddenException($"Automation action '{request.ActionId}' requires network access, which is disabled.");
                await action.ExecuteAsync(actionContext, request.Parameters, ct);
            }

            var completed = run with { Status = "succeeded", FinishedAt = clock.UtcNow };
            await state.PutAsync(AutomationConstants.StatePluginId, stateKey, completed, ct);
            return ToDto(completed);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            var message = e.Message.Length > 4000 ? e.Message[..4000] : e.Message;
            var failed = run with { Status = "failed", FinishedAt = clock.UtcNow, Error = message };
            await state.PutAsync(AutomationConstants.StatePluginId, stateKey, failed, ct);
            logger.LogWarning(e, "Automation {AutomationId} invocation {RunId} failed", automationId, run.Id);
            return ToDto(failed);
        }
    }

    private async Task EnsureExecutionContextAsync(Guid workspaceId, Guid userId, CancellationToken ct)
    {
        if (contextAccessor.Current is { WorkspaceId: var currentWorkspace, UserId: var currentUser }
            && currentWorkspace == workspaceId && currentUser == userId) return;
        contextAccessor.Current = await workspaceResolver.ResolveAsync(userId, workspaceId, ct);
    }

    private async Task<List<StoredAutomationDefinition>> LoadAsync(Guid workspaceId, CancellationToken ct)
    {
        var stored = await state.GetAsync<StoredAutomationDefinition[]>(AutomationConstants.StatePluginId,
            DefinitionsKey(workspaceId), ct);
        return stored?.ToList() ?? [];
    }

    private Task SaveAsync(Guid workspaceId, IReadOnlyList<StoredAutomationDefinition> definitions, CancellationToken ct) =>
        state.PutAsync(AutomationConstants.StatePluginId, DefinitionsKey(workspaceId), definitions.ToArray(), ct);

    private async Task<StoredAutomationDefinition?> FindAsync(Guid workspaceId, Guid id, CancellationToken ct) =>
        (await LoadAsync(workspaceId, ct)).FirstOrDefault(a => a.Id == id);

    private void RequireEditor()
    {
        if (!Context.IsMember || Context.MembershipRole is not { } role || !role.CanEdit())
            throw new ForbiddenException("Only workspace editors can manage automations.");
    }

    private static string DefinitionsKey(Guid workspaceId) => $"definitions:{workspaceId:N}";

    private static string RunStateKey(Guid workspaceId, Guid automationId, string key) =>
        $"run:{workspaceId:N}:{automationId:N}:{HashKey(key)}";

    private static string HashKey(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant()[..32];

    private static string NormaliseName(string? value)
    {
        var name = (value ?? "").Trim();
        if (name.Length is < 1 or > 200) throw new ValidationException("Automation name must be 1–200 characters.");
        return name;
    }

    private static string ValidateTrigger(string? raw, string? eventType)
    {
        var trigger = (raw ?? "").Trim().ToLowerInvariant();
        if (!TriggerTypes.Contains(trigger, StringComparer.Ordinal)) throw new ValidationException("triggerType must be manual|event|webhook.");
        if (trigger == "event" && string.IsNullOrWhiteSpace(eventType)) throw new ValidationException("eventType is required for event triggers.");
        if (eventType is { Length: > 200 }) throw new ValidationException("eventType is too long (max 200 characters).");
        return trigger;
    }

    private static string? NormaliseEventType(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private IReadOnlyList<AutomationActionRequest> ValidateActions(IReadOnlyList<AutomationActionRequest>? requested)
    {
        if (requested is null || requested.Count is < 1 or > AutomationConstants.MaxActions)
            throw new ValidationException($"actions must contain 1–{AutomationConstants.MaxActions} items.");
        foreach (var item in requested)
        {
            if (actions.Find(item.ActionId) is null) throw new ValidationException($"Unknown automation action '{item.ActionId}'.");
            if (item.Parameters.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
                throw new ValidationException($"Action '{item.ActionId}' parameters are required.");
            if (item.Parameters.GetRawText().Length > AutomationConstants.MaxActionParametersBytes)
                throw new ValidationException($"Action '{item.ActionId}' parameters are too large.");
        }
        return requested.Select(a => a with { ActionId = a.ActionId.Trim(), Parameters = a.Parameters.Clone() }).ToArray();
    }

    private static string NormaliseOrCreateSecret(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "nook_wh_" + Nook.Application.Collab.Jwt.Base64Url(RandomNumberGenerator.GetBytes(32)) : RequireSecret(value);

    private static string RequireSecret(string value)
    {
        var secret = value.Trim();
        if (secret.Length is < 16 or > 200) throw new ValidationException("Webhook secret must be 16–200 characters.");
        return secret;
    }

    private static string HashSecret(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private static bool FixedTimeEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));

    private static string? NormaliseIdempotencyKey(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var key = value.Trim();
        if (key.Length is < 1 or > 200) throw new ValidationException("Idempotency-Key must be 1–200 characters.");
        return key;
    }

    private static Guid? TryGetGuid(JsonElement value, string property)
    {
        return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var raw)
            && raw.ValueKind == JsonValueKind.String && Guid.TryParse(raw.GetString(), out var id) ? id : null;
    }

    private static JsonElement EmptyObject() => JsonSerializer.SerializeToElement(new { }, Json);

    private static AutomationDefinitionDto ToDto(StoredAutomationDefinition a) => new(
        a.Id, a.Name, a.TriggerType, a.EventType, a.Enabled, a.AllowNetwork, a.Actions, a.CreatedAt, a.UpdatedAt,
        a.TriggerType == "webhook" ? $"/api/plugins/webhooks/{{workspaceId}}/{a.Id}" : null);

    private static AutomationRunDto ToDto(StoredAutomationRun r) =>
        new(r.Id, r.AutomationId, r.Status, r.IdempotencyKey, r.StartedAt, r.FinishedAt, r.Error);
}

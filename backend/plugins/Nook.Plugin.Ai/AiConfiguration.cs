using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Nook.Application.Common;
using Nook.Domain.Entities;

namespace Nook.Plugin.Ai;

public sealed record AiProviderSettings(string? Provider, string? Model, string? Endpoint);

public interface IAiSettingsStore
{
    Task<AiProviderSettings> GetAsync(CancellationToken cancellationToken);
    Task SaveAsync(AiProviderSettings settings, CancellationToken cancellationToken);
}

/// <summary>Secret boundary. A host can replace this implementation with an encrypted vault without changing the plugin.</summary>
public interface IAiSecretStore
{
    Task<string?> GetApiKeyAsync(CancellationToken cancellationToken);
    Task SetApiKeyAsync(string? apiKey, CancellationToken cancellationToken);
}

/// <summary>
/// Default self-hosted persistence uses the existing plugin_state table. The API key is never returned by this class.
/// Deployments that need encryption can register another IAiSecretStore implementation.
/// </summary>
public sealed class PluginStateAiSettingsStore(IAppDbContext db, IConfiguration configuration) : IAiSettingsStore
{
    private const string SettingsKey = "settings";

    public async Task<AiProviderSettings> GetAsync(CancellationToken cancellationToken)
    {
        var row = await db.PluginStates.AsNoTracking().FirstOrDefaultAsync(
            x => x.PluginId == AiPluginConstants.PluginId && x.Key == SettingsKey, cancellationToken);
        if (row is not null && row.Value.ValueKind == JsonValueKind.Object)
        {
            try
            {
                return JsonSerializer.Deserialize<AiProviderSettings>(row.Value.GetRawText())
                    ?? FromConfiguration();
            }
            catch (JsonException)
            {
                return FromConfiguration();
            }
        }
        return FromConfiguration();
    }

    public async Task SaveAsync(AiProviderSettings settings, CancellationToken cancellationToken)
    {
        var row = await db.PluginStates.FirstOrDefaultAsync(
            x => x.PluginId == AiPluginConstants.PluginId && x.Key == SettingsKey, cancellationToken);
        var value = JsonSerializer.SerializeToElement(settings);
        if (row is null) db.PluginStates.Add(new PluginState { PluginId = AiPluginConstants.PluginId, Key = SettingsKey, Value = value });
        else row.Value = value;
        await db.SaveChangesAsync(cancellationToken);
    }

    private AiProviderSettings FromConfiguration() => new(
        configuration["Nook:Plugins:Ai:Provider"] ?? configuration["NOOK_AI_PROVIDER"],
        configuration["Nook:Plugins:Ai:Model"] ?? configuration["NOOK_AI_MODEL"],
        configuration["Nook:Plugins:Ai:Endpoint"] ?? configuration["NOOK_AI_ENDPOINT"]);
}

public sealed class PluginStateAiSecretStore(IAppDbContext db) : IAiSecretStore
{
    private const string ApiKeyKey = "secret.apiKey";

    public async Task<string?> GetApiKeyAsync(CancellationToken cancellationToken)
    {
        var row = await db.PluginStates.AsNoTracking().FirstOrDefaultAsync(
            x => x.PluginId == AiPluginConstants.PluginId && x.Key == ApiKeyKey, cancellationToken);
        return row is not null && row.Value.ValueKind == JsonValueKind.String ? row.Value.GetString() : null;
    }

    public async Task SetApiKeyAsync(string? apiKey, CancellationToken cancellationToken)
    {
        var row = await db.PluginStates.FirstOrDefaultAsync(
            x => x.PluginId == AiPluginConstants.PluginId && x.Key == ApiKeyKey, cancellationToken);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            if (row is not null) db.PluginStates.Remove(row);
        }
        else
        {
            var value = JsonSerializer.SerializeToElement(apiKey.Trim());
            if (row is null) db.PluginStates.Add(new PluginState { PluginId = AiPluginConstants.PluginId, Key = ApiKeyKey, Value = value });
            else row.Value = value;
        }
        await db.SaveChangesAsync(cancellationToken);
    }
}

public sealed class AiConfigurationService(IAiSettingsStore settings, IAiSecretStore secrets) : IAiConfigurationReader
{
    public async Task<AiSettingsResponse> GetAsync(CancellationToken cancellationToken)
    {
        var provider = await settings.GetAsync(cancellationToken);
        return new AiSettingsResponse(provider.Provider, provider.Model, provider.Endpoint,
            !string.IsNullOrWhiteSpace(await secrets.GetApiKeyAsync(cancellationToken)));
    }

    public async Task SaveAsync(AiSettingsRequest request, CancellationToken cancellationToken)
    {
        var provider = request.Provider?.Trim();
        if (provider is { Length: > 100 }) throw new Nook.Application.Common.ValidationException("Provider name is too long.");
        if (request.Model?.Length > 200) throw new Nook.Application.Common.ValidationException("Model name is too long.");
        if (request.Endpoint?.Length > 2_000) throw new Nook.Application.Common.ValidationException("Provider endpoint is too long.");
        await settings.SaveAsync(new AiProviderSettings(provider, request.Model?.Trim(), request.Endpoint?.Trim()), cancellationToken);
        if (request.ClearApiKey || request.ApiKey is not null)
            await secrets.SetApiKeyAsync(request.ClearApiKey ? null : request.ApiKey, cancellationToken);
    }

    public async Task<(AiProviderSettings Settings, string? ApiKey)> ReadProviderAsync(CancellationToken cancellationToken) =>
        (await settings.GetAsync(cancellationToken), await secrets.GetApiKeyAsync(cancellationToken));
}

public sealed class AiProviderSelector(IAiConfigurationReader configuration, IAiProviderRegistry providers)
{
    public async Task<(AiProviderSettings Settings, IAiProvider Provider, string? ApiKey)> SelectAsync(CancellationToken cancellationToken)
    {
        var (settings, apiKey) = await configuration.ReadProviderAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(settings.Provider)) throw new AiProviderNotConfiguredException();
        var provider = providers.Find(settings.Provider);
        if (provider is null) throw new AiProviderUnavailableException(settings.Provider);
        return (settings, provider, apiKey);
    }
}

public interface IAiConfigurationReader
{
    Task<(AiProviderSettings Settings, string? ApiKey)> ReadProviderAsync(CancellationToken cancellationToken);
}

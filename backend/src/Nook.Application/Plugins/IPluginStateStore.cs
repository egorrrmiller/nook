using System.Text.Json;

namespace Nook.Application.Plugins;

/// <summary>
/// Small persistence port for plugin-owned state. The implementation is deliberately key/value so a plugin can
/// evolve its own JSON without making the application layer depend on plugin tables.
/// </summary>
public interface IPluginStateStore
{
    Task<T?> GetAsync<T>(string pluginId, string key, CancellationToken cancellationToken);

    Task PutAsync<T>(string pluginId, string key, T value, CancellationToken cancellationToken);

    /// <summary>Atomically adds a value when the key does not exist. Used for idempotency records.</summary>
    Task<bool> TryAddAsync<T>(string pluginId, string key, T value, CancellationToken cancellationToken);

    Task DeleteAsync(string pluginId, string key, CancellationToken cancellationToken);
}

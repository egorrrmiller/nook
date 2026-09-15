using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Plugins;
using Nook.Domain.Entities;

namespace Nook.Infrastructure.Persistence;

/// <summary>EF/PostgreSQL persistence for plugin-owned JSON state. The key is unique, so TryAdd is safe across workers.</summary>
public sealed class EfPluginStateStore(IAppDbContext db) : IPluginStateStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<T?> GetAsync<T>(string pluginId, string key, CancellationToken cancellationToken)
    {
        var row = await db.PluginStates.AsNoTracking().FirstOrDefaultAsync(
            s => s.PluginId == pluginId && s.Key == key, cancellationToken);
        return row is null ? default : row.Value.Deserialize<T>(Json);
    }

    public async Task PutAsync<T>(string pluginId, string key, T value, CancellationToken cancellationToken)
    {
        ValidateKey(pluginId, key);
        var row = await db.PluginStates.FirstOrDefaultAsync(
            s => s.PluginId == pluginId && s.Key == key, cancellationToken);
        var json = JsonSerializer.SerializeToElement(value, Json);
        if (row is null)
            db.PluginStates.Add(new PluginState { PluginId = pluginId, Key = key, Value = json });
        else
            row.Value = json;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<bool> TryAddAsync<T>(string pluginId, string key, T value, CancellationToken cancellationToken)
    {
        ValidateKey(pluginId, key);
        var json = JsonSerializer.Serialize(value, Json);
        var changed = await db.Database.ExecuteSqlAsync($"""
            INSERT INTO plugin_state (plugin_id, key, value)
            VALUES ({pluginId}, {key}, CAST({json} AS jsonb))
            ON CONFLICT (plugin_id, key) DO NOTHING
            """, cancellationToken);
        return changed == 1;
    }

    public async Task DeleteAsync(string pluginId, string key, CancellationToken cancellationToken)
    {
        ValidateKey(pluginId, key);
        var row = await db.PluginStates.FirstOrDefaultAsync(
            s => s.PluginId == pluginId && s.Key == key, cancellationToken);
        if (row is null) return;
        db.PluginStates.Remove(row);
        await db.SaveChangesAsync(cancellationToken);
    }

    private static void ValidateKey(string pluginId, string key)
    {
        if (string.IsNullOrWhiteSpace(pluginId) || pluginId.Length > 100) throw new ArgumentException("Plugin id is invalid.", nameof(pluginId));
        if (string.IsNullOrWhiteSpace(key) || key.Length > 200) throw new ArgumentException("Plugin state key is invalid.", nameof(key));
    }
}

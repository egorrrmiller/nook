using System.Collections.Concurrent;

namespace Nook.Infrastructure.Realtime;

public sealed record PresenceUser(Guid Id, string Name, string Color);

/// <summary>In-memory presence: which users (by connection) are on which node.</summary>
public sealed class PresenceTracker
{
    private readonly ConcurrentDictionary<string, (PresenceUser User, HashSet<Guid> Nodes)> _connections = new();
    private readonly object _lock = new();

    public void Connect(string connectionId, PresenceUser user) => _connections[connectionId] = (user, []);

    /// <summary>Returns the nodes the connection was on (to broadcast their new presence lists).</summary>
    public IReadOnlyList<Guid> Disconnect(string connectionId)
    {
        if (!_connections.TryRemove(connectionId, out var entry)) return [];
        lock (_lock) return entry.Nodes.ToList();
    }

    public void Enter(string connectionId, Guid nodeId)
    {
        if (!_connections.TryGetValue(connectionId, out var entry)) return;
        lock (_lock) entry.Nodes.Add(nodeId);
    }

    public void Leave(string connectionId, Guid nodeId)
    {
        if (!_connections.TryGetValue(connectionId, out var entry)) return;
        lock (_lock) entry.Nodes.Remove(nodeId);
    }

    public IReadOnlyList<PresenceUser> UsersOn(Guid nodeId)
    {
        lock (_lock)
        {
            return _connections.Values
                .Where(e => e.Nodes.Contains(nodeId))
                .Select(e => e.User)
                .DistinctBy(u => u.Id)
                .OrderBy(u => u.Name)
                .ToList();
        }
    }
}

using Nook.Application.Contracts;

namespace Nook.Application.Common;

/// <summary>Broadcasts realtime messages to connected clients (implemented over SignalR in Infrastructure).</summary>
public interface IRealtimeNotifier
{
    Task NodeChangedAsync(Guid workspaceId, NodeDto node, CancellationToken cancellationToken = default);
    Task NodeDeletedAsync(Guid workspaceId, Guid nodeId, CancellationToken cancellationToken = default);
    Task NodeMovedAsync(Guid workspaceId, Guid nodeId, Guid? parentId, string position, CancellationToken cancellationToken = default);
    Task DocumentChangedAsync(Guid workspaceId, Guid nodeId, int version, CancellationToken cancellationToken = default);

    // --- wave1: tree (contracts §7.6) ---

    /// <summary><c>favoritesChanged {workspaceId}</c> — only to the connections of <paramref name="userId"/>.</summary>
    Task FavoritesChangedAsync(Guid userId, Guid workspaceId, CancellationToken cancellationToken = default);

    /// <summary><c>nodeArchived {id, archivedAt}</c> (<c>archivedAt</c> null = unarchived).</summary>
    Task NodeArchivedAsync(Guid workspaceId, Guid nodeId, DateTimeOffset? archivedAt, CancellationToken cancellationToken = default);

    /// <summary><c>nodeRestored {node}</c>.</summary>
    Task NodeRestoredAsync(Guid workspaceId, NodeDto node, CancellationToken cancellationToken = default);

    /// <summary><c>trashChanged {workspaceId}</c>.</summary>
    Task TrashChangedAsync(Guid workspaceId, CancellationToken cancellationToken = default);
}

public sealed class NullRealtimeNotifier : IRealtimeNotifier
{
    public Task NodeChangedAsync(Guid workspaceId, NodeDto node, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task NodeDeletedAsync(Guid workspaceId, Guid nodeId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task NodeMovedAsync(Guid workspaceId, Guid nodeId, Guid? parentId, string position, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task DocumentChangedAsync(Guid workspaceId, Guid nodeId, int version, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task FavoritesChangedAsync(Guid userId, Guid workspaceId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task NodeArchivedAsync(Guid workspaceId, Guid nodeId, DateTimeOffset? archivedAt, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task NodeRestoredAsync(Guid workspaceId, NodeDto node, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task TrashChangedAsync(Guid workspaceId, CancellationToken cancellationToken = default) => Task.CompletedTask;
}

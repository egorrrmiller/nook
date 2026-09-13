using Nook.Application.Contracts;
using Nook.Application.Tags;

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
    // --- wave1: knowledge (contracts §9.9) ---
    /// <summary><c>tagsChanged {nodeId, tags}</c> — the union of manual + inline tags on a node changed.</summary>
    Task TagsChangedAsync(Guid workspaceId, Guid nodeId, IReadOnlyList<TagDto> tags, CancellationToken cancellationToken = default);

    /// <summary><c>linksChanged {nodeId}</c> — the outgoing link set changed after a store (throttled to one message per node per 2 s).</summary>
    Task LinksChangedAsync(Guid workspaceId, Guid nodeId, CancellationToken cancellationToken = default);

    /// <summary><c>historyChanged {nodeId}</c> — a snapshot was added or a version restored.</summary>
    Task HistoryChangedAsync(Guid workspaceId, Guid nodeId, CancellationToken cancellationToken = default);
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
    public Task TagsChangedAsync(Guid workspaceId, Guid nodeId, IReadOnlyList<TagDto> tags, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task LinksChangedAsync(Guid workspaceId, Guid nodeId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task HistoryChangedAsync(Guid workspaceId, Guid nodeId, CancellationToken cancellationToken = default) => Task.CompletedTask;
}

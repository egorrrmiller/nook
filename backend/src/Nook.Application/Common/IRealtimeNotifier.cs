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
    public Task TagsChangedAsync(Guid workspaceId, Guid nodeId, IReadOnlyList<TagDto> tags, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task LinksChangedAsync(Guid workspaceId, Guid nodeId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task HistoryChangedAsync(Guid workspaceId, Guid nodeId, CancellationToken cancellationToken = default) => Task.CompletedTask;
}

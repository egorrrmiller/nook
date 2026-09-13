using Nook.Application.Contracts;

namespace Nook.Application.Common;

/// <summary>Broadcasts realtime messages to connected clients (implemented over SignalR in Infrastructure).</summary>
public interface IRealtimeNotifier
{
    Task NodeChangedAsync(Guid workspaceId, NodeDto node, CancellationToken cancellationToken = default);
    Task NodeDeletedAsync(Guid workspaceId, Guid nodeId, CancellationToken cancellationToken = default);
    Task NodeMovedAsync(Guid workspaceId, Guid nodeId, Guid? parentId, string position, CancellationToken cancellationToken = default);
    Task DocumentChangedAsync(Guid workspaceId, Guid nodeId, int version, CancellationToken cancellationToken = default);
}

public sealed class NullRealtimeNotifier : IRealtimeNotifier
{
    public Task NodeChangedAsync(Guid workspaceId, NodeDto node, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task NodeDeletedAsync(Guid workspaceId, Guid nodeId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task NodeMovedAsync(Guid workspaceId, Guid nodeId, Guid? parentId, string position, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task DocumentChangedAsync(Guid workspaceId, Guid nodeId, int version, CancellationToken cancellationToken = default) => Task.CompletedTask;
}

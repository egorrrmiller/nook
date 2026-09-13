using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Nook.Application.Common;
using Nook.Application.Nodes;
using Nook.Application.Users;
using Nook.Application.Workspaces;
using Nook.Infrastructure.Auth;

namespace Nook.Infrastructure.Realtime;

/// <summary>SignalR hub at <c>/hub</c> (contracts §5).</summary>
[Authorize]
public sealed class NookHub(
    PresenceTracker presence,
    WorkspaceContextResolver resolver,
    IWorkspaceContextAccessor contextAccessor,
    NodeAccess access,
    ILogger<NookHub> logger) : Hub
{
    public static string WorkspaceGroup(Guid workspaceId) => $"ws:{workspaceId}";
    public static string NodeGroup(Guid nodeId) => $"node:{nodeId}";

    private Guid UserId => NookClaims.GetUserId(Context.User) ?? throw new HubException("Unauthenticated.");

    public override Task OnConnectedAsync()
    {
        var user = Context.User;
        var id = UserId;
        presence.Connect(Context.ConnectionId, new PresenceUser(
            id,
            user?.FindFirst(NookClaims.Name)?.Value ?? user?.FindFirst(NookClaims.Email)?.Value ?? "user",
            UserColor.For(id)));
        return base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        foreach (var nodeId in presence.Disconnect(Context.ConnectionId))
            await BroadcastPresenceAsync(nodeId);
        await base.OnDisconnectedAsync(exception);
    }

    public async Task WatchWorkspace(Guid workspaceId)
    {
        await Guard(() => resolver.ResolveAsync(UserId, workspaceId, Context.ConnectionAborted));
        await Groups.AddToGroupAsync(Context.ConnectionId, WorkspaceGroup(workspaceId), Context.ConnectionAborted);
    }

    public Task UnwatchWorkspace(Guid workspaceId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, WorkspaceGroup(workspaceId), Context.ConnectionAborted);

    public async Task EnterNode(Guid nodeId)
    {
        await Guard(async () =>
        {
            var ctx = await resolver.ResolveForNodeAsync(UserId, nodeId, Context.ConnectionAborted);
            contextAccessor.Current = ctx;
            var parent = await access.ParentOfAsync(nodeId, Context.ConnectionAborted);
            var role = await access.EffectiveRoleAsync(nodeId, parent, Context.ConnectionAborted);
            if (role is null) throw new ForbiddenException("No access to this node.");
            return ctx;
        });
        await Groups.AddToGroupAsync(Context.ConnectionId, NodeGroup(nodeId), Context.ConnectionAborted);
        presence.Enter(Context.ConnectionId, nodeId);
        await BroadcastPresenceAsync(nodeId);
    }

    public async Task LeaveNode(Guid nodeId)
    {
        presence.Leave(Context.ConnectionId, nodeId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, NodeGroup(nodeId), Context.ConnectionAborted);
        await BroadcastPresenceAsync(nodeId);
    }

    private async Task<T> Guard<T>(Func<Task<T>> action)
    {
        try
        {
            return await action();
        }
        catch (NookException e)
        {
            logger.LogDebug("Hub access denied: {Message}", e.Message);
            throw new HubException(e.Message);
        }
    }

    private Task BroadcastPresenceAsync(Guid nodeId) =>
        Clients.Group(NodeGroup(nodeId)).SendAsync("presence", new { nodeId, users = presence.UsersOn(nodeId) });
}

/// <summary>Application-facing notifier that fans out to SignalR groups.</summary>
public sealed class SignalRRealtimeNotifier(IHubContext<NookHub> hub) : IRealtimeNotifier
{
    public Task NodeChangedAsync(Guid workspaceId, Application.Contracts.NodeDto node, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(NookHub.WorkspaceGroup(workspaceId)).SendAsync("nodeChanged", new { node }, cancellationToken);

    public Task NodeDeletedAsync(Guid workspaceId, Guid nodeId, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(NookHub.WorkspaceGroup(workspaceId)).SendAsync("nodeDeleted", new { id = nodeId }, cancellationToken);

    public Task NodeMovedAsync(Guid workspaceId, Guid nodeId, Guid? parentId, string position, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(NookHub.WorkspaceGroup(workspaceId)).SendAsync("nodeMoved", new { id = nodeId, parentId, position }, cancellationToken);

    public Task DocumentChangedAsync(Guid workspaceId, Guid nodeId, int version, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(NookHub.WorkspaceGroup(workspaceId)).SendAsync("documentChanged", new { nodeId, version }, cancellationToken);

    // --- wave1: knowledge (contracts §9.9) ---

    public Task TagsChangedAsync(Guid workspaceId, Guid nodeId, IReadOnlyList<Application.Tags.TagDto> tags, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(NookHub.WorkspaceGroup(workspaceId)).SendAsync("tagsChanged", new { nodeId, tags }, cancellationToken);

    /// <summary>Throttled to one message per node per <see cref="LinksThrottle"/> (contracts §9.9).</summary>
    public Task LinksChangedAsync(Guid workspaceId, Guid nodeId, CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var send = _linksSentAt.AddOrUpdate(nodeId, now, (_, previous) => now - previous >= LinksThrottle ? now : previous) == now;
        if (!send) return Task.CompletedTask;
        if (_linksSentAt.Count > 10_000)
        {
            foreach (var (key, at) in _linksSentAt)
            {
                if (now - at > LinksThrottle) _linksSentAt.TryRemove(key, out _);
            }
        }
        return hub.Clients.Group(NookHub.WorkspaceGroup(workspaceId)).SendAsync("linksChanged", new { nodeId }, cancellationToken);
    }

    public Task HistoryChangedAsync(Guid workspaceId, Guid nodeId, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(NookHub.WorkspaceGroup(workspaceId)).SendAsync("historyChanged", new { nodeId }, cancellationToken);

    public static readonly TimeSpan LinksThrottle = TimeSpan.FromSeconds(2);
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<Guid, DateTimeOffset> _linksSentAt = new();
}

namespace Nook.Plugins.Sdk.Events;

public sealed record DocumentChanged(Guid WorkspaceId, Guid NodeId, int Version, Guid[] UserIds) : INookEvent;

public sealed record NodeCreated(Guid WorkspaceId, Guid NodeId, Guid? ParentId, string Kind, Guid? UserId) : INookEvent;

public sealed record NodeUpdated(Guid WorkspaceId, Guid NodeId, string[] ChangedFields, Guid? UserId) : INookEvent;

public sealed record NodeMoved(Guid WorkspaceId, Guid NodeId, Guid? OldParentId, Guid? NewParentId, string Position, Guid? UserId) : INookEvent;

public sealed record NodeDeleted(Guid WorkspaceId, Guid NodeId, Guid? UserId) : INookEvent;

public sealed record UserRegistered(Guid WorkspaceId, Guid UserId, string Email) : INookEvent;

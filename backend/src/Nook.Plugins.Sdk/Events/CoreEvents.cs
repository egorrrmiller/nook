namespace Nook.Plugins.Sdk.Events;

public sealed record DocumentChanged(Guid WorkspaceId, Guid NodeId, int Version, Guid[] UserIds) : INookEvent;

public sealed record NodeCreated(Guid WorkspaceId, Guid NodeId, Guid? ParentId, string Kind, Guid? UserId) : INookEvent;

public sealed record NodeUpdated(Guid WorkspaceId, Guid NodeId, string[] ChangedFields, Guid? UserId) : INookEvent;

public sealed record NodeMoved(Guid WorkspaceId, Guid NodeId, Guid? OldParentId, Guid? NewParentId, string Position, Guid? UserId) : INookEvent;

public sealed record NodeDeleted(Guid WorkspaceId, Guid NodeId, Guid? UserId) : INookEvent;

public sealed record UserRegistered(Guid WorkspaceId, Guid UserId, string Email) : INookEvent;

// --- wave1: tree ---

public sealed record NodeArchived(Guid WorkspaceId, Guid NodeId, bool Archived, Guid? UserId) : INookEvent;

public sealed record NodeRestored(Guid WorkspaceId, Guid NodeId, Guid? ParentId, Guid? UserId) : INookEvent;

/// <summary>A trashed subtree was permanently deleted (<paramref name="NodeIds"/> = every purged node, root first).</summary>
public sealed record NodePurged(Guid WorkspaceId, Guid NodeId, Guid[] NodeIds, Guid? UserId) : INookEvent;

public sealed record NodeDuplicated(Guid WorkspaceId, Guid SourceNodeId, Guid NodeId, Guid? ParentId, int CopiedCount, Guid? UserId) : INookEvent;

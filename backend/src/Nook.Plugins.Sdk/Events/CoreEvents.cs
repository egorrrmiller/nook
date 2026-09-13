namespace Nook.Plugins.Sdk.Events;

public sealed record DocumentChanged(Guid WorkspaceId, Guid NodeId, int Version, Guid[] UserIds) : INookEvent;

public sealed record NodeCreated(Guid WorkspaceId, Guid NodeId, Guid? ParentId, string Kind, Guid? UserId) : INookEvent;

public sealed record NodeUpdated(Guid WorkspaceId, Guid NodeId, string[] ChangedFields, Guid? UserId) : INookEvent;

public sealed record NodeMoved(Guid WorkspaceId, Guid NodeId, Guid? OldParentId, Guid? NewParentId, string Position, Guid? UserId) : INookEvent;

public sealed record NodeDeleted(Guid WorkspaceId, Guid NodeId, Guid? UserId) : INookEvent;

public sealed record UserRegistered(Guid WorkspaceId, Guid UserId, string Email) : INookEvent;

// --- wave1: knowledge ---------------------------------------------------------------------------------------------

/// <summary>The union of manual + inline tags on a node changed.</summary>
public sealed record TagsChanged(Guid WorkspaceId, Guid NodeId, Guid[] TagIds, Guid? UserId) : INookEvent;

/// <summary><c>nodes.properties</c> of a page changed (PUT/PATCH /nodes/{id}/properties).</summary>
public sealed record PropertiesChanged(Guid WorkspaceId, Guid NodeId, Guid? UserId) : INookEvent;

/// <summary>A page was restored from a snapshot (<paramref name="SnapshotId"/> = the restored version).</summary>
public sealed record VersionRestored(Guid WorkspaceId, Guid NodeId, Guid SnapshotId, int SnapshotVersion, Guid? UserId) : INookEvent;

/// <summary>An import finished (synchronous or via the Hangfire job <paramref name="JobId"/>).</summary>
public sealed record ImportCompleted(Guid WorkspaceId, Guid? JobId, int PagesCreated, Guid[] NodeIds, Guid? UserId) : INookEvent;

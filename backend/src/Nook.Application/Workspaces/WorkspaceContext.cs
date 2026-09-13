using Nook.Domain.Enums;

namespace Nook.Application.Workspaces;

/// <summary>
/// The workspace every content request runs in (resolved from <c>X-Workspace-Id</c>). Carries the caller's membership role
/// and the node shares the caller holds inside this workspace, so effective roles can be computed without extra queries.
/// </summary>
public sealed class WorkspaceContext
{
    public required Guid WorkspaceId { get; init; }
    public required Guid UserId { get; init; }

    /// <summary><c>null</c> when the caller is not a member and only reaches the workspace through node shares.</summary>
    public required WorkspaceRole? MembershipRole { get; init; }

    /// <summary>node id → role granted directly on that node (subtree root) to the caller.</summary>
    public required IReadOnlyDictionary<Guid, WorkspaceRole> Shares { get; init; }

    public bool IsMember => MembershipRole is not null;
    public bool IsWorkspaceOwner => MembershipRole == WorkspaceRole.Owner;
}

/// <summary>Scoped holder for the current request's <see cref="WorkspaceContext"/>. Set by the API host after resolution.</summary>
public interface IWorkspaceContextAccessor
{
    WorkspaceContext? Current { get; set; }

    /// <summary>Throws <see cref="Common.ForbiddenException"/> if no workspace context was resolved for this request.</summary>
    WorkspaceContext Required { get; }
}

public sealed class WorkspaceContextAccessor : IWorkspaceContextAccessor
{
    public WorkspaceContext? Current { get; set; }

    public WorkspaceContext Required => Current ?? throw new Common.ForbiddenException("Missing or invalid X-Workspace-Id header.");
}

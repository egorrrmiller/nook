using Nook.Application.Common;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Domain.ValueObjects;

namespace Nook.Application.Contracts;

public sealed record UserDto(Guid Id, string Email, string DisplayName, string? AvatarUrl, bool IsInstanceOwner, DateTimeOffset CreatedAt)
{
    public static UserDto From(User u) => new(u.Id, u.Email, u.DisplayName, u.AvatarUrl, u.IsInstanceOwner, u.CreatedAt);
}

public sealed record WorkspaceSummary(Guid Id, string Name, NodeIcon? Icon, string Role, bool IsPersonal)
{
    public static WorkspaceSummary From(Workspace w, WorkspaceRole role) => new(w.Id, w.Name, w.Icon, role.ToWire(), w.IsPersonal);
}

public sealed record AuthResponse(UserDto User, IReadOnlyList<WorkspaceSummary> Workspaces);

public sealed record LoginRequest(string Email, string Password);

public sealed record RegisterRequest(string InviteCode, string Email, string Password, string DisplayName);

public sealed record InviteCheckResponse(bool Valid, string? Email);

public sealed record CreateInviteRequest(string? Email, int? ExpiresInHours);

public sealed record InviteCreatedResponse(string Code, string Url, DateTimeOffset ExpiresAt);

public sealed record CreateApiTokenRequest(string Name, string[] Scopes);

public sealed record ApiTokenDto(Guid Id, string Name, string[] Scopes, DateTimeOffset CreatedAt, DateTimeOffset? LastUsedAt);

public sealed record ApiTokenCreatedResponse(Guid Id, string Name, string Token, string[] Scopes, DateTimeOffset CreatedAt);

public sealed record CreateWorkspaceRequest(string Name, NodeIcon? Icon);

public sealed record WorkspaceMemberDto(Guid UserId, string Email, string DisplayName, string Role);

public sealed record AddWorkspaceMemberRequest(string Email, string Role);

public sealed record NodeDto(
    Guid Id,
    Guid WorkspaceId,
    Guid? ParentId,
    string Kind,
    string Title,
    NodeIcon? Icon,
    NodeCover? Cover,
    string Position,
    PageSettings? PageSettings,
    DateTimeOffset? ArchivedAt,
    DateTimeOffset? DeletedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string? EffectiveRole)
{
    public static NodeDto From(Node n, WorkspaceRole? effectiveRole) => new(
        n.Id, n.WorkspaceId, n.ParentId, n.Kind.ToWire(), n.Title, n.Icon, n.Cover, n.Position, n.PageSettings,
        n.ArchivedAt, n.DeletedAt, n.CreatedAt, n.UpdatedAt, effectiveRole?.ToWire());
}

public sealed record CreateNodeRequest(Guid? ParentId, string? Kind, string? Title, NodeIcon? Icon);

public sealed record PatchNodeRequest(
    string? Title,
    Optional<NodeIcon?> Icon,
    Optional<NodeCover?> Cover,
    Optional<Guid?> ParentId,
    string? Position,
    PageSettings? PageSettings);

public sealed record NodeShareDto(Guid NodeId, Guid UserId, string Email, string DisplayName, string Role, DateTimeOffset CreatedAt);

public sealed record CreateNodeShareRequest(string Email, string Role);

public sealed record CollabTokenResponse(string Token, string WsUrl);

public sealed record InternalDocumentResponse(string? Ydoc, int Version);

public sealed record InternalDocumentPutRequest(
    string Ydoc,
    int Version,
    string? Title,
    System.Text.Json.JsonElement Blocks,
    string[]? Updates,
    string[]? UserIds);

public sealed record InternalDocumentPutResponse(int Version);

using Nook.Application.Common;

namespace Nook.Application.Auth;

/// <summary>Contracts §7.5: <c>PATCH /me</c>.</summary>
public sealed record PatchMeRequest(string? DisplayName, Optional<string?> AvatarUrl);

/// <summary>Contracts §7.5: <c>POST /me/password</c>.</summary>
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

/// <summary>Contracts §7.5: <c>GET /invites</c> row.</summary>
public sealed record InviteDto(string Code, string? Email, DateTimeOffset ExpiresAt, DateTimeOffset? UsedAt, DateTimeOffset CreatedAt);

namespace Nook.Application.Common;

/// <summary>The authenticated principal of the current request (cookie session or API token).</summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    Guid UserId { get; }
    Guid? UserIdOrNull { get; }
    string? Email { get; }
    string? DisplayName { get; }
    bool IsInstanceOwner { get; }

    /// <summary><c>"cookie"</c> or <c>"api-token"</c>; <c>null</c> when anonymous.</summary>
    string? AuthType { get; }

    /// <summary>API token scopes (empty for cookie sessions, which have full access).</summary>
    IReadOnlyCollection<string> Scopes { get; }
}

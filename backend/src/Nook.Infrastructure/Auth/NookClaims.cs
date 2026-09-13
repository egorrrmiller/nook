using System.Security.Claims;

namespace Nook.Infrastructure.Auth;

public static class NookClaims
{
    public const string UserId = "sub";
    public const string Email = "email";
    public const string Name = "name";
    public const string InstanceOwner = "nook:owner";
    public const string AuthType = "nook:auth";
    public const string Scope = "nook:scope";

    public const string AuthTypeCookie = "cookie";
    public const string AuthTypeApiToken = "api-token";

    public static ClaimsIdentity Build(Domain.Entities.User user, string authType, string authenticationScheme, IEnumerable<string>? scopes = null)
    {
        var identity = new ClaimsIdentity(authenticationScheme, Name, null);
        identity.AddClaim(new Claim(UserId, user.Id.ToString()));
        identity.AddClaim(new Claim(Email, user.Email));
        identity.AddClaim(new Claim(Name, user.DisplayName));
        identity.AddClaim(new Claim(InstanceOwner, user.IsInstanceOwner ? "true" : "false"));
        identity.AddClaim(new Claim(AuthType, authType));
        foreach (var scope in scopes ?? []) identity.AddClaim(new Claim(Scope, scope));
        return identity;
    }

    public static Guid? GetUserId(ClaimsPrincipal? principal) =>
        Guid.TryParse(principal?.FindFirstValue(UserId), out var id) ? id : null;

    public static bool IsInstanceOwner(ClaimsPrincipal? principal) => principal?.FindFirstValue(InstanceOwner) == "true";
}

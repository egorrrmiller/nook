using Nook.Application.Common;
using Nook.Infrastructure.Auth;

namespace Nook.Api.Auth;

public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private System.Security.Claims.ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true && UserIdOrNull is not null;
    public Guid UserId => UserIdOrNull ?? throw new UnauthorizedException();
    public Guid? UserIdOrNull => NookClaims.GetUserId(Principal);
    public string? Email => Principal?.FindFirst(NookClaims.Email)?.Value;
    public string? DisplayName => Principal?.FindFirst(NookClaims.Name)?.Value;
    public bool IsInstanceOwner => NookClaims.IsInstanceOwner(Principal);
    public string? AuthType => Principal?.FindFirst(NookClaims.AuthType)?.Value;
    public IReadOnlyCollection<string> Scopes => Principal?.FindAll(NookClaims.Scope).Select(c => c.Value).ToArray() ?? [];
}

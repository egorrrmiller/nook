using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Nook.Application.Auth;
using Nook.Application.Common;
using Nook.Infrastructure.Auth;
using Nook.Infrastructure.Persistence;

namespace Nook.Api.Auth;

public static class AuthSchemes
{
    public const string Cookie = "Cookies";
    public const string ApiToken = "ApiToken";
    /// <summary>Policy scheme that picks <see cref="ApiToken"/> when an <c>Authorization: Bearer</c> header is present, else the cookie.</summary>
    public const string Smart = "Smart";
}

/// <summary><c>Authorization: Bearer nook_…</c> → api_tokens lookup by SHA-256 hash.</summary>
public sealed class ApiTokenAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    AppDbContext db,
    IClock clock) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return AuthenticateResult.NoResult();
        var raw = header[7..].Trim();
        if (raw.Length == 0) return AuthenticateResult.Fail("Empty bearer token.");

        var hash = AuthService.HashToken(raw);
        var token = await db.ApiTokens.Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == hash && t.RevokedAt == null, Context.RequestAborted);
        if (token?.User is null) return AuthenticateResult.Fail("Invalid API token.");

        var now = clock.UtcNow;
        if (token.LastUsedAt is null || now - token.LastUsedAt > TimeSpan.FromMinutes(5))
        {
            token.LastUsedAt = now;
            await db.SaveChangesAsync(Context.RequestAborted);
        }

        var identity = NookClaims.Build(token.User, NookClaims.AuthTypeApiToken, Scheme.Name, token.Scopes);
        identity.AddClaim(new Claim("nook:token_id", token.Id.ToString()));
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name));
    }
}

/// <summary>Endpoint metadata: this endpoint needs the <c>admin</c> scope when called with an API token.</summary>
public sealed class RequireAdminScopeAttribute : Attribute;

/// <summary>
/// Enforces API-token scopes on <c>/api</c>: <c>read</c> allows GET/HEAD, <c>write</c> allows mutations,
/// <c>admin</c> is required for endpoints marked with <see cref="RequireAdminScopeAttribute"/>. Cookie sessions are unrestricted.
/// </summary>
public sealed class ApiTokenScopeFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var user = http.User;
        if (user.FindFirst(NookClaims.AuthType)?.Value != NookClaims.AuthTypeApiToken) return await next(context);

        var scopes = user.FindAll(NookClaims.Scope).Select(c => c.Value).ToHashSet(StringComparer.Ordinal);
        var isAdmin = scopes.Contains("admin");
        var needsAdmin = http.GetEndpoint()?.Metadata.GetMetadata<RequireAdminScopeAttribute>() is not null;
        var isRead = HttpMethods.IsGet(http.Request.Method) || HttpMethods.IsHead(http.Request.Method);

        var allowed = isAdmin || (needsAdmin ? false : isRead ? scopes.Contains("read") || scopes.Contains("write") : scopes.Contains("write"));
        if (!allowed) throw new ForbiddenException("API token lacks the required scope.");
        return await next(context);
    }
}

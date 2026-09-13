using Nook.Api.Infrastructure;
using Nook.Application.Common;

namespace Nook.Api.Auth;

/// <summary>Guards <c>/internal/**</c> with the shared <c>X-Internal-Token</c> secret (collab service ↔ backend).</summary>
public sealed class InternalTokenFilter(NookOptions options) : IEndpointFilter
{
    public const string HeaderName = "X-Internal-Token";

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var expected = options.InternalToken;
        var provided = context.HttpContext.Request.Headers[HeaderName].ToString();
        if (string.IsNullOrEmpty(expected) || provided.Length == 0 || !FixedTimeEquals(expected, provided))
            throw new UnauthorizedException("Invalid internal token.");
        return await next(context);
    }

    private static bool FixedTimeEquals(string a, string b) =>
        System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.UTF8.GetBytes(a), System.Text.Encoding.UTF8.GetBytes(b));
}

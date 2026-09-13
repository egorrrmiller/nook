using Nook.Application.Common;
using Nook.Application.Workspaces;

namespace Nook.Api.Auth;

/// <summary>Resolves <c>X-Workspace-Id</c> into the scoped <see cref="WorkspaceContext"/>; 403 when missing/invalid/no access.</summary>
public sealed class WorkspaceContextFilter : IEndpointFilter
{
    public const string HeaderName = "X-Workspace-Id";

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var accessor = http.RequestServices.GetRequiredService<IWorkspaceContextAccessor>();
        if (accessor.Current is null)
        {
            var raw = http.Request.Headers[HeaderName].ToString();
            if (!Guid.TryParse(raw, out var workspaceId)) throw new ForbiddenException($"Missing or invalid {HeaderName} header.");
            var currentUser = http.RequestServices.GetRequiredService<ICurrentUser>();
            var resolver = http.RequestServices.GetRequiredService<WorkspaceContextResolver>();
            accessor.Current = await resolver.ResolveAsync(currentUser.UserId, workspaceId, http.RequestAborted);
        }
        return await next(context);
    }
}

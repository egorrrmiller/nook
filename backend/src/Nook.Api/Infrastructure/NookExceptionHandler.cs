using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Nook.Application.Common;

namespace Nook.Api.Infrastructure;

/// <summary>Maps <see cref="NookException"/> to RFC 9457 ProblemDetails responses.</summary>
public sealed class NookExceptionHandler(IProblemDetailsService problemDetails) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not NookException e) return false;

        ProblemDetails problem = e is ValidationException v && v.Errors is not null
            ? new HttpValidationProblemDetails(v.Errors) { Detail = e.Message }
            : new ProblemDetails { Detail = e.Message };
        problem.Status = e.Status;
        problem.Title = e.Status switch
        {
            400 => "Bad Request",
            401 => "Unauthorized",
            403 => "Forbidden",
            404 => "Not Found",
            409 => "Conflict",
            410 => "Gone",
            502 => "Bad Gateway",
            413 => "Payload Too Large",
            503 => "Service Unavailable",
            _ => "Error",
        };
        if (e.Extensions is not null)
        {
            foreach (var (k, val) in e.Extensions) problem.Extensions[k] = val;
        }

        httpContext.Response.StatusCode = e.Status;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext { HttpContext = httpContext, ProblemDetails = problem, Exception = exception });
    }
}

namespace Nook.Application.Common;

/// <summary>Base for exceptions that map to an HTTP status (translated to ProblemDetails by the API host).</summary>
public abstract class NookException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
    public IDictionary<string, object?>? Extensions { get; init; }
}

public sealed class NotFoundException(string message = "Not found") : NookException(404, message);

public sealed class ForbiddenException(string message = "Forbidden") : NookException(403, message);

public sealed class UnauthorizedException(string message = "Unauthorized") : NookException(401, message);

public sealed class ConflictException(string message = "Conflict") : NookException(409, message);

public sealed class GoneException(string message = "Gone") : NookException(410, message);

public sealed class ValidationException(string message, IDictionary<string, string[]>? errors = null) : NookException(400, message)
{
    public IDictionary<string, string[]>? Errors { get; } = errors;
}

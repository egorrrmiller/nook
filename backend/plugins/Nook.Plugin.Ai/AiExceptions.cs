using Nook.Application.Common;

namespace Nook.Plugin.Ai;

public sealed class AiProviderNotConfiguredException()
    : NookException(503, "AI provider is not configured. Set a provider in AI plugin settings.");

public sealed class AiProviderUnavailableException(string provider)
    : NookException(503, $"AI provider '{provider}' is not available in this installation.");

public sealed class AiProviderFailedException(string message, Exception? inner = null)
    : NookException(502, message)
{
    public Exception? InnerFailure { get; } = inner;
}

public sealed class AiRequestTooLargeException(string message)
    : NookException(413, message);

public sealed class AiRateLimitException : NookException
{
    public AiRateLimitException(int retryAfterSeconds = 60)
        : base(429, "AI request rate limit exceeded. Try again later.")
    {
        Extensions = new Dictionary<string, object?> { ["retryAfterSeconds"] = retryAfterSeconds };
    }
}

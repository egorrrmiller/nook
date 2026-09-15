namespace Nook.Application.Integrations.Notion;

/// <summary>Exception deliberately kept separate from native Nook exceptions so /v1 never emits ProblemDetails.</summary>
public sealed class NotionApiException(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}

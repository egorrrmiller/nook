namespace Nook.Application.Files;

/// <summary>Background work triggered by uploads (Hangfire queue <c>files</c>). A no-op when background jobs are disabled.</summary>
public interface IFileJobs
{
    void EnqueueExtraction(Guid attachmentId);
}

public sealed class NullFileJobs : IFileJobs
{
    public void EnqueueExtraction(Guid attachmentId)
    {
    }
}

public sealed record FilesOptions(long MaxUploadBytes)
{
    /// <summary>
    /// Self-hosted installations are unlimited by default. Operators that need a guardrail can
    /// opt in with <c>NOOK_MAX_UPLOAD_MB</c>.
    /// </summary>
    public const long Unlimited = long.MaxValue;

    public bool HasUploadLimit => MaxUploadBytes != Unlimited;
}

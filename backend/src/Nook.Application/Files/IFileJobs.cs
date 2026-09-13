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
    public const int DefaultMaxUploadMb = 512;
}

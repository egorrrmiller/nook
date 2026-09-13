namespace Nook.Application.Import;

/// <summary>Contracts §9.8 <c>POST /import</c> (synchronous result).</summary>
public sealed record ImportResponse(int PagesCreated, IReadOnlyList<Guid> NodeIds, IReadOnlyList<string> Warnings);

/// <summary>202 response for archives larger than <see cref="ImportService.BackgroundThresholdBytes"/>.</summary>
public sealed record ImportAcceptedResponse(Guid JobId);

/// <summary>Contracts §9.8 <c>GET /import/{jobId}</c>.</summary>
public sealed record ImportJobStatusResponse(Guid JobId, string Status, ImportResponse? Result, string? Error, DateTimeOffset CreatedAt, DateTimeOffset? FinishedAt);

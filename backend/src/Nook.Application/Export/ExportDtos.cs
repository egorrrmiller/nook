namespace Nook.Application.Export;

/// <summary>Contracts §9.8 <c>POST /export</c>.</summary>
public sealed record ExportRequestDto(Guid[] NodeIds, bool? IncludeChildren, string? Format, bool? IncludeFiles);

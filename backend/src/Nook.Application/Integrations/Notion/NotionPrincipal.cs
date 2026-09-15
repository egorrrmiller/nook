using Nook.Domain.Enums;

namespace Nook.Application.Integrations.Notion;

/// <summary>Authenticated workspace-scoped principal resolved from a compatibility bearer token.</summary>
public sealed record NotionPrincipal(
    Guid InstallationId,
    Guid WorkspaceId,
    InstallationTokenKind TokenKind,
    Guid? OwnerUserId,
    Guid? BotUserId,
    NotionCapabilities Capabilities,
    string? IntegrationName = null);

/// <summary>Resolves a raw bearer credential without exposing or persisting the raw value.</summary>
public interface INotionTokenResolver
{
    Task<NotionPrincipal?> ResolveAsync(string bearerToken, CancellationToken cancellationToken = default);
}

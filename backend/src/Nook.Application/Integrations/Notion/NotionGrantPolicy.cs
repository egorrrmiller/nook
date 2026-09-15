namespace Nook.Application.Integrations.Notion;

/// <summary>Result of evaluating an installation's page-root grant.</summary>
public sealed record NotionGrantDecision(bool IsAllowed, Guid? GrantId)
{
    public static NotionGrantDecision Denied { get; } = new(false, null);
}

/// <summary>
/// Evaluates page grants against a workspace-scoped principal. Implementations must treat a grant root as covering
/// the complete descendant subtree when <c>IncludeChildren</c> is true.
/// </summary>
public interface INotionGrantPolicy
{
    Task<NotionGrantDecision> EvaluateAsync(
        NotionPrincipal principal,
        Guid nodeId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<Guid>?> VisibleNodeIdsAsync(
        NotionPrincipal principal,
        CancellationToken cancellationToken = default);
}

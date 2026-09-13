using Nook.Application.Common;
using Nook.Domain.ValueObjects;

namespace Nook.Application.Workspaces;

/// <summary>Contracts §7.5: <c>PATCH /workspaces/{id}</c>.</summary>
public sealed record PatchWorkspaceRequest(string? Name, Optional<NodeIcon?> Icon);

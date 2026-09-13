namespace Nook.Domain.Enums;

/// <summary>Role of a user inside a workspace or on a shared subtree. Ordinal order == privilege order.</summary>
public enum WorkspaceRole
{
    Viewer = 0,
    Editor = 1,
    Owner = 2,
}

public static class WorkspaceRoleExtensions
{
    public static WorkspaceRole Max(this WorkspaceRole a, WorkspaceRole b) => a >= b ? a : b;

    public static WorkspaceRole? Max(this WorkspaceRole? a, WorkspaceRole? b)
    {
        if (a is null) return b;
        if (b is null) return a;
        return a.Value.Max(b.Value);
    }

    public static bool CanEdit(this WorkspaceRole role) => role >= WorkspaceRole.Editor;

    public static string ToWire(this WorkspaceRole role) => role switch
    {
        WorkspaceRole.Owner => "owner",
        WorkspaceRole.Editor => "editor",
        _ => "viewer",
    };

    public static WorkspaceRole? ParseWire(string? value) => value?.ToLowerInvariant() switch
    {
        "owner" => WorkspaceRole.Owner,
        "editor" => WorkspaceRole.Editor,
        "viewer" => WorkspaceRole.Viewer,
        _ => null,
    };
}

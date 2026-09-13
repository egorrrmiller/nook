using System.Text.Json;

namespace Nook.Domain.Entities;

/// <summary>Key/value settings (contracts §7.5): <c>scope</c> = <see cref="SettingScopes"/>, <c>scope_id</c> = user/workspace id (<see cref="Guid.Empty"/> for the instance).</summary>
public class Setting
{
    public string Scope { get; set; } = SettingScopes.Instance;
    public Guid ScopeId { get; set; } = Guid.Empty;
    public required string Key { get; set; }
    public JsonElement Value { get; set; }
}

public static class SettingScopes
{
    public const string Instance = "instance";
    public const string User = "user";
    public const string Workspace = "workspace";
}

public class PluginState
{
    public required string PluginId { get; set; }
    public required string Key { get; set; }
    public JsonElement Value { get; set; }
}

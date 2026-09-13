using System.Text.Json;

namespace Nook.Domain.Entities;

public class Setting
{
    public required string Key { get; set; }
    public JsonElement Value { get; set; }
}

public class PluginState
{
    public required string PluginId { get; set; }
    public required string Key { get; set; }
    public JsonElement Value { get; set; }
}

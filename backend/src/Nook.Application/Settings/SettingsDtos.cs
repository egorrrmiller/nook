using System.Text.Json;

namespace Nook.Application.Settings;

/// <summary>Contracts §7.5: <c>PUT …/settings/{key} {value}</c> (any JSON, ≤ 16 KB).</summary>
public sealed record PutSettingRequest(JsonElement Value);

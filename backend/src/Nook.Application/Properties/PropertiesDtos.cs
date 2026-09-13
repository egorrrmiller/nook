using System.Text.Json;

namespace Nook.Application.Properties;

/// <summary>Contracts §9.3: <c>PageProperties = Record&lt;name, { type, value }&gt;</c>. Kept as raw JSON (validated by <see cref="PropertyService"/>).</summary>
public sealed record PagePropertiesEnvelope(JsonElement Properties);

/// <summary>Contracts §9.4 <c>PUT /nodes/{id}/aliases</c>.</summary>
public sealed record SetAliasesRequest(string[] Aliases);

/// <summary>Contracts §9.4: one entry of the <c>conflicts</c> extension on the 409 returned by <c>PUT /nodes/{id}/aliases</c>.</summary>
public sealed record AliasConflict(string Alias, Nook.Application.Knowledge.NodeSummaryDto Node);

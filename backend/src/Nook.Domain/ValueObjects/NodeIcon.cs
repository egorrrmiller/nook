namespace Nook.Domain.ValueObjects;

/// <summary>Icon of a node: <c>{type: "emoji"|"url"|"upload", value}</c>.</summary>
public sealed record NodeIcon(string Type, string Value);

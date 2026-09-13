namespace Nook.Domain.ValueObjects;

/// <summary>Cover of a node. Shape is intentionally loose in wave 0: <c>{type, value, position?}</c>.</summary>
public sealed record NodeCover(string Type, string Value, double? Position = null);
